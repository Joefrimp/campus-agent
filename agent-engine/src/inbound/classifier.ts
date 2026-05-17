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
    'forwarded_blast',
    'unknown',
  ]),
  language: z.enum(['en', 'twi', 'pidgin']),
  requires_owner: z.boolean(),
  confidence: z.number().min(0).max(1),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'abusive']),
});

const SYSTEM_PROMPT = `You are a fast intent classifier for a Ghanaian small-business WhatsApp agent. Read the customer message and the last 3 turns. Return ONLY valid JSON matching the schema.

DECISION ORDER — check in this order and return the FIRST one that applies:

1. forwarded_blast — broadcast / chain / promotional content that has nothing to
   do with the business. Strong signals:
   - Religious / ministry / devotional content (Bible verses, "God", "Pastor",
     "church", "Healing Streams", "Rhapsody of Realities", "amen", "blessing",
     "PRAY", "Allah", "Quran", scripture references like "John 3:16")
   - Political content (NPP, NDC, candidate names, election commentary)
   - Chain messages ("share with 10 friends", "forward to 5 people", "do not break
     this", "send this to everyone you love")
   - Motivational / inspirational forwards not addressed to anyone specific
   - News headlines copy-pasted without a question
   - Long message (>=200 chars) containing >=2 outbound links AND no question
     directly about the business
   - The literal word "Forwarded" or "Fwd:" anywhere in the body
   Return forwarded_blast, confidence 0.85, requires_owner=false.

2. spam — one emoji only / single link only / random characters / repeated
   gibberish / "hi" "hello" with nothing else. confidence 0.4.

3. Business intents (only if message clearly engages with the business):
   - order_intent — explicit request to buy / order / book / "I want X" / "send me X"
   - inquiry — question about a specific product, price, availability, hours, location
   - delivery_status — "where my order?", "when delivery?", tracking question
   - review — leaving feedback about a past order
   - complaint — dissatisfaction with a product, service, or interaction
   - refund_request — explicit ask for money back

4. Conversational:
   - greeting — pure hello with nothing else (maakye, maaha, hi, hey, ɛte sɛn)
   - smalltalk — chat / jokes / dating attempts / general chat with no business signal

5. unknown — only if you genuinely can't tell. confidence 0.5, requires_owner=true.

CRITICAL: A message can mention generic words like "give", "want", "need",
"help", "blessing", "promise" WITHOUT being a business inquiry. Do not infer
business intent from those words alone — they must be attached to a concrete
product, price, location, or transaction signal.

OTHER RULES:
- requires_owner=true ONLY for: refund_request, formal complaint, custom large
  order (>500 GHS implied), threats of bad reviews, legal/press/police mention.
- Akan greetings → greeting / twi. Pidgin markers (charle, abi, dey, wetin, omo)
  → pidgin.
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
