/**
 * agent-engine — HTTP server entrypoint.
 *
 * Routes:
 *   GET  /health                 public, for monitors
 *   POST /whapi/inbound          Whapi → inbound brain (W1)
 *   POST /whapi/channel-status   Whapi → channel events (W15)
 *   POST /onboarding             frontend → tenant setup (W3)
 *   POST /knowledge/upload       frontend → ingestion (W4)
 *   POST /approvals/resolve      frontend → owner approval (W9)
 *   POST /admin/replay           HMAC-protected replay (W14)
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { handleHealth } from './webhooks/health.js';
import { handleInboundWebhook } from './inbound/webhook.js';
import { handleChannelStatus } from './webhooks/channel-status.js';
import { handleOnboarding } from './webhooks/onboarding.js';
import { handleKnowledgeUpload } from './webhooks/knowledge-upload.js';
import { handleApprovalResolve } from './webhooks/approvals.js';
import { handleAdminReplay } from './webhooks/admin-replay.js';
import { handleSendOtp, handleVerifyOtp } from './webhooks/otp.js';
import { handlePairPhone } from './webhooks/pair-phone.js';
import { handleWhatsAppSetup } from './webhooks/whatsapp-setup.js';
import {
  handleProPaymentConfig,
  handleStartUpgrade,
  handleActivationStatus,
  handleCancelUpgrade,
  handleActivationWebhook,
  handleManualGrantPro,
  handleGiftProByEmail,
} from './webhooks/billing.js';
import {
  handleScraperStart,
  handleScraperRuns,
  handleScraperImports,
  handleScraperDecision,
  handleScraperDeleteRun,
  handleScraperClearRuns,
} from './webhooks/scraper.js';
import { startScheduler } from './scheduler/index.js';

const app = new Hono();

app.use('*', secureHeaders());
app.use('*', honoLogger((str) => logger.info(str)));

// CORS — allow the frontend (Vercel + localhost dev + LAN IPs) to call us.
// Without this, browsers block every request from a different origin and
// the React app shows a generic "Failed to send code".
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return origin; // server-to-server, Whapi webhooks
      if (origin.endsWith('.vercel.app')) return origin;        // any Vercel deploy
      if (/^http:\/\/localhost:\d+$/.test(origin)) return origin; // local dev
      if (/^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)) return origin; // LAN
      if (/^http:\/\/172\.\d+\.\d+\.\d+:\d+$/.test(origin)) return origin;
      return null; // reject everything else
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Eastern-AI-Secret', 'X-Admin-Sig'],
    credentials: true,
    maxAge: 86400,
  }),
);

// --- Public ---
app.get('/health', handleHealth);
app.get('/', (c) => c.text('agent-engine — running'));
app.get('/config/pro-payment', handleProPaymentConfig);

/**
 * Debug — auth-check.
 * Returns a diagnostic comparison of the X-Eastern-AI-Secret header that
 * the frontend sent vs the AGENT_ENGINE_SECRET env var the backend has.
 * Only exposes lengths and a 4-char fingerprint of each end, never the
 * full strings — safe to call from anywhere. Useful for diagnosing 401s
 * without leaking the secret. Remove once the mismatch is resolved.
 */
app.get('/debug/auth-check', (c) => {
  const provided = c.req.header('x-eastern-ai-secret') ?? '';
  const expected = config.AGENT_ENGINE_SECRET ?? '';
  const fp = (s: string) =>
    s.length === 0 ? '(empty)' : `${s.slice(0, 4)}…${s.slice(-4)} (len ${s.length})`;
  return c.json({
    provided_header_fingerprint: fp(provided),
    backend_env_fingerprint: fp(expected),
    match: provided === expected,
    cors_origin_received: c.req.header('origin') ?? '(none)',
  });
});

// --- Whapi → us (no shared secret; Whapi doesn't sign requests) ---
app.post('/whapi/inbound', handleInboundWebhook);
app.post('/whapi/channel-status', handleChannelStatus);
app.post('/billing/activation-webhook', handleActivationWebhook);

// --- Frontend → us (require X-Eastern-AI-Secret) ---
app.use('/onboarding', sharedSecretAuth);
app.use('/knowledge/upload', sharedSecretAuth);
app.use('/approvals/resolve', sharedSecretAuth);
app.use('/otp/*', sharedSecretAuth);
app.post('/onboarding', handleOnboarding);
app.post('/knowledge/upload', handleKnowledgeUpload);
app.post('/approvals/resolve', handleApprovalResolve);
app.post('/otp/send', handleSendOtp);
app.post('/otp/verify', handleVerifyOtp);
app.use('/whapi/pair-phone', sharedSecretAuth);
app.post('/whapi/pair-phone', handlePairPhone);
app.use('/whatsapp-setup', sharedSecretAuth);
app.post('/whatsapp-setup', handleWhatsAppSetup);
app.use('/billing/start-upgrade', sharedSecretAuth);
app.use('/billing/activation-status', sharedSecretAuth);
app.use('/billing/cancel-upgrade', sharedSecretAuth);
app.post('/billing/start-upgrade', handleStartUpgrade);
app.get('/billing/activation-status', handleActivationStatus);
app.post('/billing/cancel-upgrade', handleCancelUpgrade);
app.use('/scraper/start', sharedSecretAuth);
app.use('/scraper/runs', sharedSecretAuth);
app.use('/scraper/imports', sharedSecretAuth);
app.use('/scraper/imports/decision', sharedSecretAuth);
app.use('/scraper/runs/delete', sharedSecretAuth);
app.use('/scraper/runs/clear', sharedSecretAuth);
app.post('/scraper/start', handleScraperStart);
app.get('/scraper/runs', handleScraperRuns);
app.get('/scraper/imports', handleScraperImports);
app.post('/scraper/imports/decision', handleScraperDecision);
app.post('/scraper/runs/delete', handleScraperDeleteRun);
app.post('/scraper/runs/clear', handleScraperClearRuns);

// --- Admin (HMAC-signed) ---
app.post('/admin/replay', handleAdminReplay);
app.post('/admin/grant-pro', handleManualGrantPro);

// --- Admin (shared-secret + ADMIN_EMAILS allowlist) ---
app.use('/admin/gift-pro', sharedSecretAuth);
app.post('/admin/gift-pro', handleGiftProByEmail);

// --- 404 + global error ---
app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  logger.error({ err }, 'unhandled server error');
  return c.json({ error: 'internal error' }, 500);
});

async function sharedSecretAuth(c: Parameters<Parameters<typeof app.use>[1]>[0], next: () => Promise<void>): Promise<Response | void> {
  const provided = c.req.header('x-eastern-ai-secret');
  if (provided !== config.AGENT_ENGINE_SECRET) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

const port = config.PORT;
serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port, env: config.NODE_ENV }, '🚀 agent-engine listening');
});

// Boot scheduler
startScheduler();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  process.exit(0);
});
process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});
