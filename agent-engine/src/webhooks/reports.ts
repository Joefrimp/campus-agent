/**
 * On-demand weekly report downloads.
 *
 *   GET /reports/weekly.pdf?user_id=...&week_end=YYYY-MM-DD   (optional)
 *   GET /reports/weekly.xlsx?user_id=...&week_end=YYYY-MM-DD
 *
 * Generates the same Buffer the Friday-night email job sends but streams
 * it directly back to the dashboard as a file download. Reuses
 * buildWeeklyReport + renderWeeklyReportPdf / renderWeeklyReportXlsx
 * from lib/reports.ts so PDF/Excel content stays in lock-step with the
 * email digest.
 */
import type { Context } from 'hono';
import { z } from 'zod';
import {
  buildWeeklyReport,
  renderWeeklyReportPdf,
  renderWeeklyReportXlsx,
} from '../lib/reports.js';
import { logger } from '../lib/logger.js';

const QuerySchema = z.object({
  user_id: z.string().uuid(),
  /** Optional ISO date string. Defaults to today. Week is the 7 days
   *  ending at this date (inclusive). */
  week_end: z.string().optional(),
});

function parseWeekEnd(raw: string | undefined): Date {
  if (!raw) return new Date();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function safeFilename(business_name: string, ext: string, week_end: Date): string {
  const slug =
    (business_name || 'report')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'report';
  const day = week_end.toISOString().slice(0, 10);
  return `${slug}-weekly-${day}.${ext}`;
}

export async function handleWeeklyReportPdf(c: Context): Promise<Response> {
  const parsed = QuerySchema.safeParse({
    user_id: c.req.query('user_id'),
    week_end: c.req.query('week_end'),
  });
  if (!parsed.success) return c.json({ error: 'invalid query' }, 400);

  try {
    const week_end = parseWeekEnd(parsed.data.week_end);
    const data = await buildWeeklyReport(parsed.data.user_id, week_end);
    const buf = await renderWeeklyReportPdf(data);
    const name = safeFilename(data.business_name, 'pdf', week_end);
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': String(buf.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    logger.error({ err, user_id: parsed.data.user_id }, 'weekly pdf failed');
    return c.json({ error: 'could not build report' }, 500);
  }
}

export async function handleWeeklyReportXlsx(c: Context): Promise<Response> {
  const parsed = QuerySchema.safeParse({
    user_id: c.req.query('user_id'),
    week_end: c.req.query('week_end'),
  });
  if (!parsed.success) return c.json({ error: 'invalid query' }, 400);

  try {
    const week_end = parseWeekEnd(parsed.data.week_end);
    const data = await buildWeeklyReport(parsed.data.user_id, week_end);
    const buf = await renderWeeklyReportXlsx(data);
    const name = safeFilename(data.business_name, 'xlsx', week_end);
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': String(buf.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    logger.error({ err, user_id: parsed.data.user_id }, 'weekly xlsx failed');
    return c.json({ error: 'could not build report' }, 500);
  }
}
