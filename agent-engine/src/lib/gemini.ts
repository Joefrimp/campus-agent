/**
 * Gemini model registry — tiered for cost discipline.
 *
 * Token economy:
 *   - Flash-Lite: every-inbound classifier (~$0.04/1M in)
 *   - Flash:      main agent (~$0.30/1M in, 1M context)
 *   - Pro:        escalation only — refunds, complaints, ambiguous orders
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { config } from '../config.js';

const google = createGoogleGenerativeAI({
  apiKey: config.GEMINI_API_KEY,
});

export const models = {
  classifier: google('gemini-2.5-flash-lite'),
  agent: google('gemini-2.5-flash'),
  escalation: google('gemini-2.5-pro'),
  embedding: google.textEmbeddingModel('text-embedding-004'),
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
