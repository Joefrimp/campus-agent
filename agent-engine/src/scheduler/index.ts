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

  logger.info('scheduler running: W7 (30m), W8 (hourly), W10 (5m), W12 (15m), delivery (hourly), weekly-email (Fri 19:30 local), billing-sweep (5m)');
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
