/**
 * Supabase admin client (uses service-role / secret key).
 * Bypasses RLS — never expose this client to user code paths.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { 'x-application-name': 'agent-engine' },
  },
});

export type SupabaseAdmin = typeof supabase;
