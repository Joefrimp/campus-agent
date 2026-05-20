/**
 * Model registry — Gemini primary, OpenRouter for vision, Groq as
 * text-generation fallback when Gemini returns 429.
 *
 *   - Flash-Lite: every-inbound classifier (~$0.04/1M in)
 *   - Flash:      main agent (~$0.30/1M in, 1M context)
 *   - Pro:        escalation only — refunds, complaints, ambiguous orders
 *   - Vision (OpenRouter free): image-match + payment OCR
 *   - Groq fallback: when Gemini text calls return quota errors
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { config } from '../config.js';
import { logger } from './logger.js';

const google = createGoogleGenerativeAI({
  apiKey: config.GEMINI_API_KEY,
});

const openrouter = config.OPENROUTER_API_KEY
  ? createOpenRouter({ apiKey: config.OPENROUTER_API_KEY })
  : null;

const groq = config.GROQ_API_KEY
  ? createGroq({ apiKey: config.GROQ_API_KEY })
  : null;

export const models = {
  classifier: google('gemini-2.5-flash-lite'),
  agent: google('gemini-2.5-flash'),
  escalation: google('gemini-2.5-pro'),
  embedding: google.textEmbeddingModel('text-embedding-004'),
  // Vision model lives on OpenRouter's free tier when configured —
  // Qwen 2.5 VL 72B is one of the strongest open vision models. Falls
  // back to Gemini Flash (which is multimodal) when OpenRouter is absent.
  vision: openrouter
    ? openrouter('qwen/qwen2.5-vl-72b-instruct:free') as unknown as LanguageModel
    : google('gemini-2.5-flash'),
  // Groq fallback model — GPT-OSS-120B (strong open model, 1000 RPD free).
  // Used by resilientGenerateText when Gemini returns 429.
  groqFallback: groq
    ? groq('openai/gpt-oss-120b') as unknown as LanguageModel
    : null,
} as const;

export type ModelTier = keyof typeof models;

/** Generate a 768-dim embedding from text (used by knowledge_chunks RAG). */
export async function embed(text: string): Promise<number[]> {
  const { embeddings } = await import('ai').then((m) => m.embedMany({
    model: models.embedding,
    values: [text],
  }));
  const first = embeddings[0];
  if (!first) throw new Error('Embedding API returned no vectors');
  return first;
}

/* ─── Resilient wrappers ─────────────────────────────────────────────
 * Wrap generateText / generateObject to auto-retry on Groq when Gemini
 * returns a quota-style error (429, RESOURCE_EXHAUSTED, rate_limit).
 * Pass a fallbackModel override OR rely on models.groqFallback.
 * ──────────────────────────────────────────────────────────────────── */

function isQuotaError(err: unknown): boolean {
  const msg = ((err as Error)?.message ?? String(err)).toLowerCase();
  return /\b429\b|quota|rate.?limit|resource.exhausted|exceeded/i.test(msg);
}

export async function resilientGenerateText(
  args: Parameters<typeof generateText>[0] & { fallbackModel?: LanguageModel | null },
): ReturnType<typeof generateText> {
  const { fallbackModel, ...rest } = args;
  try {
    return await generateText(rest);
  } catch (err) {
    const fb = fallbackModel ?? models.groqFallback;
    if (isQuotaError(err) && fb) {
      logger.warn({ err: (err as Error).message }, 'primary text model hit quota — retrying on Groq fallback');
      return await generateText({ ...rest, model: fb });
    }
    throw err;
  }
}

/**
 * Generic quota-fallback wrapper. Use this around any LLM call (including
 * generateObject, which has too-complex overload generics for a direct
 * wrapper). Call your primary fn first; if it throws a quota error, the
 * fallback fn runs. Use models.groqFallback inside the fallback fn.
 *
 * Example:
 *   const { object } = await withQuotaFallback(
 *     () => generateObject({ model: models.classifier, schema, ... }),
 *     models.groqFallback
 *       ? () => generateObject({ model: models.groqFallback!, schema, ... })
 *       : undefined,
 *   );
 */
export async function withQuotaFallback<T>(
  primary: () => Promise<T>,
  fallback?: (() => Promise<T>) | undefined,
): Promise<T> {
  try {
    return await primary();
  } catch (err) {
    if (isQuotaError(err) && fallback) {
      logger.warn({ err: (err as Error).message }, 'primary model hit quota — retrying on Groq fallback');
      return await fallback();
    }
    throw err;
  }
}
