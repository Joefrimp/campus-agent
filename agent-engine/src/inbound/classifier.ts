/**
 * Inbound classifier — Gemini 2.5 Flash-Lite, runs on EVERY message.
 * Cheap (~150 in / 40 out per call). Outputs strict JSON.
 */
import { generateObject } from 'ai';
import { z } from 'zod';
import { models } from '../lib/gemini.js';
import { logger } from '../lib/logger.js';
import type { ClassifierOutput } from '../types.js';

const ClassifierSchema = z.object({
  intent: z.enum([
    'greeting',
    'smalltalk',
    'inquiry',
    'order_intent',
    'complaint',
    'refund_request',
    'delivery_status',
    'review',
    'spam',
    'unknown',
  ]),
  language: z.enum(['en', 'twi', 'pidgin']),
  requires_owner: z.boolean(),
  confidence: z.number().min(0).max(1),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'abusive']),
});

const SYSTEM_PROMPT = `You are a fast intent classifier for a Ghanaian campus business WhatsApp agent. Read the customer message and the last 3 turns. Return ONLY valid JSON matching the schema.

Rules:
- requires_owner=true ONLY for: refund_request, formal complaint, custom large order (implied >500 GHS), threats of bad reviews, legal mention, press/journalist mention, police mention.
- Akan greetings (maakye, maaha, maadwo, ɛte sɛn) → greeting / twi.
- Pidgin markers (charle, abi, dey, wetin, omo) → pidgin.
- "Where my order?", "delivery?" → delivery_status.
- One emoji only / link only / random characters → spam, confidence 0.4.
- If unsure default {intent:"unknown",confidence:0.5,requires_owner:true}.`;

export async function classify(args: {
  current_message: string;
  last_3_turns: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<ClassifierOutput> {
  try {
    const { object } = await generateObject({
      model: models.classifier,
      schema: ClassifierSchema,
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify(args),
      temperature: 0,
      maxRetries: 1,
    });
    return object;
  } catch (err) {
    logger.warn({ err }, 'classifier failed — defaulting to safe fallback');
    return {
      intent: 'unknown',
      language: 'en',
      requires_owner: true,
      confidence: 0,
      sentiment: 'neutral',
    };
  }
}
