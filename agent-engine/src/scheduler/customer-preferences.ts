/**
 * Daily customer-preferences extractor — writes a structured preferences
 * blob to customers.preferences for every customer with recent activity.
 *
 * brain.ts will later read customers.preferences and inject into the system
 * prompt so Vector knows things like "this person always orders chicken
 * jollof, picks up at Hall 7, pays via MoMo on Sundays".
 *
 * Runs daily at 03:00 UTC. Cheap (Flash-Lite). Skips customers seen by a
 * previous run within the last 36 hours unless they have new turns.
 */
import { generateObject } from 'ai';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { models } from '../lib/gemini.js';
import { logger } from '../lib/logger.js';

const LOOKBACK_DAYS = 30;
const MIN_TURNS = 4;
const MAX_TURNS = 40;
const REFRESH_INTERVAL_HOURS = 36;

const PreferencesSchema = z.object({
  address_label: z.string().nullable(),       // "Hall 7, Block C", "Pharmacy block"
  payment_pattern: z.string().nullable(),     // "MoMo on Sundays", "always asks for cash discount"
  tone_preference: z.string().nullable(),     // "casual + emojis", "formal, short"
  favourites: z.array(z.string()).default([]),
  no_go: z.array(z.string()).default([]),
  loyalty_signals: z.string().nullable(),     // "5+ orders in last 60d", "first-time"
  language: z.string().nullable(),            // "english", "twi-mix", "pidgin"
  notes: z.string().nullable().describe('Anything else that would help Vector serve this person better. Max 200 chars.'),
});

interface CustomerRow {
  id: string;
  user_id: string;
  phone: string;
  display_name: string | null;
  preferences_updated_at: string | null;
  last_contact_at: string | null;
}

export async function runCustomerPreferences(): Promise<void> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000).toISOString();
  const refreshCutoff = new Date(Date.now() - REFRESH_INTERVAL_HOURS * 3600_000).toISOString();

  // Customers with recent activity AND (never extracted OR extracted long ago)
  const { data: customers } = await supabase
    .from('customers')
    .select('id, user_id, phone, display_name, preferences_updated_at, last_contact_at')
    .gt('last_contact_at', since)
    .or(`preferences_updated_at.is.null,preferences_updated_at.lt.${refreshCutoff}`)
    .limit(200);

  if (!customers || customers.length === 0) {
    logger.debug('customer-preferences: no customers to refresh');
    return;
  }

  let updated = 0;
  for (const c of customers as CustomerRow[]) {
    try {
      const ok = await extractForCustomer(c);
      if (ok) updated++;
    } catch (err) {
      logger.error({ err, customer_id: c.id }, 'customer-preferences: extract failed (isolated)');
    }
  }
  logger.info({ scanned: customers.length, updated }, 'customer-preferences: done');
}

async function extractForCustomer(c: CustomerRow): Promise<boolean> {
  // Pull recent turns
  const { data: turns } = await supabase
    .from('conversation_memory')
    .select('role, content, created_at')
    .eq('user_id', c.user_id)
    .eq('customer_phone', c.phone)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(MAX_TURNS);

  if (!turns || turns.length < MIN_TURNS) {
    // Mark touched so we don't keep retrying every day for thin convos
    await supabase
      .from('customers')
      .update({ preferences_updated_at: new Date().toISOString() })
      .eq('id', c.id);
    return false;
  }

  // Pull existing prefs so we can merge intelligently in the prompt
  const { data: existing } = await supabase
    .from('customers')
    .select('preferences')
    .eq('id', c.id)
    .maybeSingle();

  const transcript = turns
    .reverse()
    .map((t: { role: string; content: string }) =>
      `${t.role === 'user' ? 'Customer' : 'Vector'}: ${(t.content ?? '').slice(0, 280)}`,
    )
    .join('\n');

  const prompt = `Read this conversation history between a small-business customer and "Vector" (the business's AI agent). Extract a STRUCTURED PROFILE that will help Vector personalise future replies.

Customer's name (if known): ${c.display_name ?? '(unknown)'}

Conversation (oldest -> newest):
${transcript}

Existing profile (merge with new evidence — do NOT keep stale claims that newer turns contradict):
${JSON.stringify(existing?.preferences ?? {}, null, 2)}

Rules:
- ONLY include facts directly evidenced by the messages or explicit existing profile entries. NO guessing.
- For favourites / no_go: list specific items mentioned by name.
- address_label: only fill if the customer told us where they collect from.
- payment_pattern: only fill if there's a clear pattern (>=2 occurrences).
- loyalty_signals: count the customer's orders/turns; describe in one short phrase.
- notes: a single sentence Vector should remember (max 200 chars). Leave null if nothing distinctive.`;

  let prefs: z.infer<typeof PreferencesSchema>;
  try {
    const { object } = await generateObject({
      model: models.classifier, // Flash-Lite — cheapest tier
      schema: PreferencesSchema,
      prompt,
      temperature: 0.1,
      maxRetries: 1,
    });
    prefs = object;
  } catch (err) {
    logger.warn({ err, customer_id: c.id }, 'customer-preferences: Gemini failed');
    return false;
  }

  await supabase
    .from('customers')
    .update({
      preferences: prefs as Record<string, unknown>,
      preferences_updated_at: new Date().toISOString(),
    })
    .eq('id', c.id);

  await supabase.from('style_synthesis_runs').insert({
    user_id: c.user_id,
    source: 'daily_preferences',
    inputs_considered: turns.length,
    summary_excerpt: prefs.notes?.slice(0, 240) ?? null,
  });

  return true;
}
