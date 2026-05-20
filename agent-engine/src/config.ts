/**
 * Environment configuration with strict validation.
 * Fails fast at startup if required vars are missing or malformed.
 *
 * Loads both .env and .env.local (the latter takes precedence) so the same
 * convention as the eastern-ai frontend works here too.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Resolve project root regardless of cwd (handles tsx watch + production cases)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });
dotenv.config({ path: path.join(projectRoot, '.env.local'), override: true });

const schema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),

  // LLM
  GEMINI_API_KEY: z.string().min(20),
  // OpenRouter — used for vision (Qwen 2.5 VL 72B free) so we don't burn
  // Gemini's free vision quota on image matching + MoMo OCR. Optional;
  // when missing, vision falls back to Gemini.
  OPENROUTER_API_KEY: z.string().optional().default(''),
  // Groq — used as a text-generation fallback when Gemini returns 429
  // (rate-limited / quota-exceeded). Optional; when missing, the brain
  // simply propagates the Gemini error as before.
  GROQ_API_KEY: z.string().optional().default(''),

  // Whapi
  WHAPI_BASE_URL: z.string().url().default('https://gate.whapi.cloud'),
  WHAPI_TOKEN: z.string().min(10),
  WHAPI_PARTNER_KEY: z.string().optional().default(''),

  // Shared secrets
  AGENT_ENGINE_SECRET: z.string().min(32),
  ADMIN_HMAC_SECRET: z.string().min(32),

  // Server
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DEFAULT_TIMEZONE: z.string().default('Africa/Accra'),
  TRIAL_MSG_LIMIT: z.coerce.number().int().positive().default(50),
  QUIET_HOUR_START: z.coerce.number().int().min(0).max(23).default(22),
  QUIET_HOUR_END: z.coerce.number().int().min(0).max(23).default(7),

  // Optional
  RESEND_API_KEY: z.string().optional().default(''),
  SENTRY_DSN: z.string().optional().default(''),
  UPSTASH_REDIS_URL: z.string().optional().default(''),
  UPSTASH_REDIS_TOKEN: z.string().optional().default(''),

  // Pro auto-activation (MoMo OCR). Optional — falls back to operator_config row.
  // When BOTH env + row are present, env wins (so you can override per-deploy).
  EASTERN_AI_MOMO_NUMBER: z.string().optional().default(''),
  EASTERN_AI_MOMO_NAME: z.string().optional().default(''),
  EASTERN_AI_PRO_PRICE_GHS: z.coerce.number().positive().default(100),
  EASTERN_AI_ACTIVATION_PHONE: z.string().optional().default(''),
  EASTERN_AI_ACTIVATION_WHAPI_TOKEN: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nCheck your agent-engine/.env.local file against .env.example');
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
