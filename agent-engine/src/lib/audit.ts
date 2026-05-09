/**
 * Audit log helper — every AI decision lands in ai_audit.
 * Fire-and-forget; logging failures must never break the user-facing path.
 */
import { supabase } from './supabase.js';
import { logger } from './logger.js';
import { sha256 } from './crypto.js';

export interface AuditEntry {
  user_id?: string | null;
  workflow: string;
  model?: string;
  input?: unknown;
  output?: unknown;
  tools_called?: string[];
  tokens_in?: number;
  tokens_out?: number;
  latency_ms?: number;
  was_overridden?: boolean;
  severity?: 'info' | 'warn' | 'error';
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const prompt_hash = entry.input ? sha256(JSON.stringify(entry.input)).slice(0, 16) : undefined;
    await supabase.from('ai_audit').insert({
      user_id: entry.user_id ?? null,
      workflow: entry.workflow,
      model: entry.model ?? null,
      prompt_hash: prompt_hash ?? null,
      input: entry.input ?? null,
      output: entry.output ?? null,
      tools_called: entry.tools_called ?? null,
      tokens_in: entry.tokens_in ?? null,
      tokens_out: entry.tokens_out ?? null,
      latency_ms: entry.latency_ms ?? null,
      was_overridden: entry.was_overridden ?? false,
      severity: entry.severity ?? 'info',
    });
  } catch (err) {
    logger.error({ err, workflow: entry.workflow }, 'audit insert failed');
  }
}

/** Push a failed payload to the dead letter queue for later retry. */
export async function deadLetter(args: {
  user_id?: string | null;
  source: 'inbound' | 'outbound' | 'cron' | 'webhook';
  payload: unknown;
  error: string;
}): Promise<void> {
  try {
    await supabase.from('dead_letter_queue').insert({
      user_id: args.user_id ?? null,
      source: args.source,
      payload: args.payload as object,
      error: args.error,
    });
  } catch (err) {
    logger.error({ err, source: args.source }, 'DLQ insert failed — last-resort log');
  }
}
