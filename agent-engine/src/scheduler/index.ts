/**
 * Internal cron scheduler — replaces n8n cron triggers.
 * All jobs use node-cron and run inside the same Node process.
 *
 * Each job is wrapped in try/catch so one failure never kills another.
 * For multi-instance deploys later, swap to BullMQ or DB-based locks.
 */
import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { runFollowups } from './followups.js';
import { runDigest } from './daily-digest.js';
import { runCircuitWatcher } from './circuit-breaker.js';
import { runDLQ } from './dlq-processor.js';
import { runDeliveryBatch } from '../owner-commands/delivery.js';
import { runWeeklyEmailDigest } from './weekly-email-digest.js';
import { sweepExpiredActivations } from '../billing/activation.js';
import { runStyleLearning } from './style-learning.js';
import { runCustomerPreferences } from './customer-preferences.js';
import { runStaleInquiryFollowup } from './stale-inquiry.js';
import { runOnboardingInterviewKickoffs } from './onboarding-interview.js';

export function startScheduler(): void {
  logger.info('starting internal scheduler');

  // W7 Followups — every 30 min
  cron.schedule('*/30 * * * *', () => safe('W7-followups', runFollowups));

  // W8 Daily Digest — every hour, worker checks per-tenant local time
  cron.schedule('5 * * * *', () => safe('W8-digest', runDigest));

  // W10 Circuit Breaker Watcher — every 5 min
  cron.schedule('*/5 * * * *', () => safe('W10-circuit', runCircuitWatcher));

  // W12 DLQ Processor — every 15 min
  cron.schedule('*/15 * * * *', () => safe('W12-dlq', runDLQ));

  // Delivery batching — every hour, worker checks per-tenant local time (11:00)
  cron.schedule('15 * * * *', () => safe('delivery-batch', runDeliveryBatch));

  // Weekly email digest — every 5 min between :30 and :35 each hour. Worker
  // gates per-tenant on Friday 19:30 local. Slim window keeps it idempotent.
  cron.schedule('30,35 * * * *', () => safe('weekly-email', runWeeklyEmailDigest));

  // Pro activation sweep — every 5 min, marks expired pending rows.
  cron.schedule('*/5 * * * *', () =>
    safe('billing-sweep', async () => {
      const n = await sweepExpiredActivations();
      if (n > 0) logger.info({ expired: n }, 'pro activation sweep');
    }),
  );

  // LLM-heavy background crons (style-learning + customer-preferences)
  // are GATED behind ENABLE_LLM_BACKGROUND_JOBS=true. They make per-tenant
  // and per-customer LLM calls that quickly burn through Gemini free-tier
  // quota. Default: OFF so the customer-facing brain has all the quota
  // budget. Turn on once you have paid Gemini billing.
  if (process.env.ENABLE_LLM_BACKGROUND_JOBS === 'true') {
    // Weekly style learning — Sunday 02:00 UTC. Uses Gemini Pro (expensive).
    cron.schedule('0 2 * * 0', () => safe('style-learning', runStyleLearning));

    // Daily customer-preferences extraction — 03:00 UTC. Flash-Lite per customer.
    cron.schedule('0 3 * * *', () => safe('customer-preferences', runCustomerPreferences));
    logger.info('LLM background jobs ENABLED (style-learning + customer-preferences)');
  } else {
    logger.info('LLM background jobs DISABLED to conserve free-tier quota. Set ENABLE_LLM_BACKGROUND_JOBS=true on Render to enable.');
  }

  // Stale-inquiry follow-up — daily 10:00 UTC. Nudges customers who
  // enquired but didn't order after 3 days, in the owner's voice.
  cron.schedule('0 10 * * *', () => safe('stale-inquiry', runStaleInquiryFollowup));

  // Onboarding interview kickoffs — hourly. Sends Q1 to tenants that
  // are verified + WhatsApp-connected but haven't started the interview.
  cron.schedule('20 * * * *', () => safe('onboarding-kickoffs', runOnboardingInterviewKickoffs));

  logger.info('scheduler running: W7 (30m), W8 (hourly), W10 (5m), W12 (15m), delivery (hourly), weekly-email (Fri 19:30 local), billing-sweep (5m), style-learning (Sun 02:00 UTC), customer-preferences (daily 03:00 UTC), stale-inquiry (daily 10:00 UTC), onboarding-kickoffs (hourly :20)');
}

async function safe(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    const start = Date.now();
    await fn();
    logger.debug({ job: name, ms: Date.now() - start }, 'cron job done');
  } catch (err) {
    logger.error({ err, job: name }, 'cron job failed (isolated)');
  }
}
