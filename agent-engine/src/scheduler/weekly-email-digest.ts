/**
 * Weekly email digest with PDF + Excel attachments.
 *
 * Fires hourly; per-tenant we send when their local time is Friday 19:30.
 * Resolves the owner's email from auth.users (they signed in with Google).
 */
import { supabase } from '../lib/supabase.js';
import { localTime } from '../lib/time.js';
import { sendEmail } from '../lib/email.js';
import { buildWeeklyReport, renderWeeklyReportPdf, renderWeeklyReportXlsx } from '../lib/reports.js';
import { logger } from '../lib/logger.js';
import { audit } from '../lib/audit.js';

export async function runWeeklyEmailDigest(): Promise<void> {
  const { data: tenants } = await supabase
    .from('business_settings')
    .select('user_id, timezone, digest_enabled')
    .eq('digest_enabled', true);
  if (!tenants) return;

  for (const t of tenants) {
    const { hour, minute, dow } = localTime(t.timezone);
    // Friday (dow=5) at 19:30 local — fire only once
    if (dow !== 5 || hour !== 19 || minute >= 30 + 5 || minute < 30) continue;
    try {
      await sendOne(t.user_id);
    } catch (err) {
      logger.error({ err, user_id: t.user_id }, 'weekly email digest failed');
    }
  }
}

async function sendOne(user_id: string): Promise<void> {
  const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
  const email = authUser?.user?.email;
  if (!email) {
    logger.warn({ user_id }, 'no email on auth user, skipping weekly digest');
    return;
  }

  const data = await buildWeeklyReport(user_id, new Date());
  const [pdf, xlsx] = await Promise.all([renderWeeklyReportPdf(data), renderWeeklyReportXlsx(data)]);

  const weekTag = data.week_end.toISOString().slice(0, 10);
  const result = await sendEmail({
    to: email,
    subject: `${data.business_name} — Weekly Report (${weekTag})`,
    html: renderHtmlBody(data),
    text: renderTextBody(data),
    attachments: [
      { filename: `eastern-ai-${weekTag}.pdf`, content: pdf },
      { filename: `eastern-ai-${weekTag}.xlsx`, content: xlsx },
    ],
  });

  await audit({
    user_id,
    workflow: 'W-weekly-email',
    output: { sent: result.sent, reason: result.reason, week: weekTag, email_to_last4: email.slice(-4) },
  });
}

function renderHtmlBody(d: ReturnType<typeof buildWeeklyReport> extends Promise<infer R> ? R : never): string {
  const t = d.totals;
  const rows = (rs: Array<[string, string]>) =>
    rs
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">${k}</td><td style="padding:6px 12px;font-weight:600;font-size:14px">${v}</td></tr>`,
      )
      .join('');

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.05)">
    <h1 style="margin:0 0 4px;font-size:20px">${escapeHtml(d.business_name)}</h1>
    <p style="margin:0 0 20px;color:#6b7280;font-size:13px">Weekly Report · ${escapeHtml(fmtDate(d.week_start))} – ${escapeHtml(fmtDate(d.week_end))}</p>

    <h3 style="font-size:14px;color:#374151;margin:0 0 8px">At a glance</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">${rows([
      ['Revenue', `GHS ${fmtMoney(t.revenue)}`],
      ['Expenses', `GHS ${fmtMoney(t.expenses)}`],
      ['Net profit', `GHS ${fmtMoney(t.net)}`],
      ['Orders paid', `${t.orders_paid}`],
      ['Quotes pending', `${t.orders_quoted}`],
      ['Inquiries', `${t.inquiries}`],
      ['New customers', `${t.customers_new}`],
    ])}</table>

    <h3 style="font-size:14px;color:#374151;margin:0 0 8px">Top products</h3>
    <ol style="margin:0 0 20px;padding-left:20px;color:#111;font-size:13px">
      ${
        d.top_products.length === 0
          ? '<li style="color:#6b7280">No paid orders this week.</li>'
          : d.top_products.map((p) => `<li>${escapeHtml(p.name)} — ${p.qty} sold, GHS ${fmtMoney(p.revenue)}</li>`).join('')
      }
    </ol>

    <p style="color:#6b7280;font-size:13px;margin:24px 0 0">
      Two attachments: a PDF summary you can print, and an Excel workbook with raw rows you can slice however you want.
    </p>
    <p style="color:#9ca3af;font-size:11px;margin:24px 0 0">Eastern AI · Your 1st Employee</p>
  </div>
</body></html>`;
}

function renderTextBody(d: Awaited<ReturnType<typeof buildWeeklyReport>>): string {
  const t = d.totals;
  return [
    `${d.business_name} — Weekly Report`,
    `${fmtDate(d.week_start)} – ${fmtDate(d.week_end)}`,
    '',
    `Revenue:        GHS ${fmtMoney(t.revenue)}`,
    `Expenses:       GHS ${fmtMoney(t.expenses)}`,
    `Net profit:     GHS ${fmtMoney(t.net)}`,
    `Orders paid:    ${t.orders_paid}`,
    `Quotes pending: ${t.orders_quoted}`,
    `Inquiries:      ${t.inquiries}`,
    `New customers:  ${t.customers_new}`,
    '',
    'Two attachments: PDF summary + Excel workbook with the raw rows.',
    '',
    'Eastern AI · Your 1st Employee',
  ].join('\n');
}

function fmtMoney(n: number): string {
  return n.toFixed(2).replace(/\.00$/, '');
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
