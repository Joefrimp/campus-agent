/**
 * Weekly report generators — produces a single canonical aggregation,
 * then renders it as a PDF (visual summary) and an Excel workbook
 * (raw data for the owner's own analysis).
 */
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { supabase } from './supabase.js';

export interface WeeklyReportData {
  business_name: string;
  owner_first_name: string;
  week_start: Date;
  week_end: Date;
  totals: {
    revenue: number;
    expenses: number;
    net: number;
    orders_paid: number;
    orders_quoted: number;
    inquiries: number;
    customers_new: number;
    customers_returning: number;
  };
  daily: Array<{ date: string; revenue: number; expenses: number; orders: number }>;
  top_products: Array<{ name: string; qty: number; revenue: number }>;
  top_customers: Array<{ name: string; phone: string; spend: number; orders: number }>;
  expense_breakdown: Array<{ category: string; amount: number }>;
  raw_orders: Array<{ id: string; date: string; customer: string; items: string; total: number; state: string }>;
  raw_expenses: Array<{ date: string; amount: number; category: string; description: string }>;
}

export async function buildWeeklyReport(user_id: string, week_end: Date): Promise<WeeklyReportData> {
  const week_start = new Date(week_end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since = week_start.toISOString();

  const [{ data: profile }, { data: orders }, { data: expenses }, { count: inquiries }, { data: customers }] = await Promise.all([
    supabase.from('profiles').select('first_name, business_name').eq('id', user_id).single(),
    supabase
      .from('orders')
      .select('id, state, total_amount, items, created_at, customer_id')
      .eq('user_id', user_id)
      .gte('created_at', since),
    supabase.from('expenses').select('amount, category, description, recorded_at').eq('user_id', user_id).gte('recorded_at', since),
    supabase.from('agent_logs').select('*', { count: 'exact', head: true }).eq('user_id', user_id).gte('created_at', since),
    supabase.from('customers').select('id, phone, display_name, total_orders, created_at').eq('user_id', user_id),
  ]);

  const ord = orders ?? [];
  const exp = expenses ?? [];
  const cust = customers ?? [];

  const closed = ord.filter((o) => o.state === 'paid' || o.state === 'delivered');
  const revenue = closed.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const totalExpenses = exp.reduce((s, e) => s + Number(e.amount ?? 0), 0);

  // Customer hydration
  const cId = new Map(cust.map((c) => [c.id, c]));
  const newSinceWeek = cust.filter((c) => new Date(c.created_at) >= week_start).length;
  const returningWithOrder = new Set<string>();
  for (const o of closed) if (o.customer_id) returningWithOrder.add(o.customer_id);

  // Daily series
  const days = new Map<string, { revenue: number; expenses: number; orders: number }>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(week_start.getTime() + i * 24 * 60 * 60 * 1000);
    days.set(d.toISOString().slice(0, 10), { revenue: 0, expenses: 0, orders: 0 });
  }
  for (const o of closed) {
    const d = new Date(o.created_at).toISOString().slice(0, 10);
    const slot = days.get(d);
    if (slot) {
      slot.revenue += Number(o.total_amount ?? 0);
      slot.orders += 1;
    }
  }
  for (const e of exp) {
    const d = new Date(e.recorded_at).toISOString().slice(0, 10);
    const slot = days.get(d);
    if (slot) slot.expenses += Number(e.amount ?? 0);
  }

  // Top products from items
  const productTally = new Map<string, { qty: number; revenue: number }>();
  for (const o of closed) {
    const items = (o.items ?? []) as Array<{ name?: string; qty?: number; price?: number }>;
    for (const it of items) {
      if (!it.name) continue;
      const t = productTally.get(it.name) ?? { qty: 0, revenue: 0 };
      t.qty += it.qty ?? 1;
      t.revenue += (it.qty ?? 1) * (it.price ?? 0);
      productTally.set(it.name, t);
    }
  }

  // Top customers
  const custSpend = new Map<string, { name: string; phone: string; spend: number; orders: number }>();
  for (const o of closed) {
    if (!o.customer_id) continue;
    const c = cId.get(o.customer_id);
    if (!c) continue;
    const k = c.id;
    const cur = custSpend.get(k) ?? { name: c.display_name ?? c.phone, phone: c.phone, spend: 0, orders: 0 };
    cur.spend += Number(o.total_amount ?? 0);
    cur.orders += 1;
    custSpend.set(k, cur);
  }

  // Expense breakdown
  const expCat = new Map<string, number>();
  for (const e of exp) {
    expCat.set(e.category ?? 'other', (expCat.get(e.category ?? 'other') ?? 0) + Number(e.amount ?? 0));
  }

  return {
    business_name: profile?.business_name ?? 'Your business',
    owner_first_name: profile?.first_name ?? 'there',
    week_start,
    week_end,
    totals: {
      revenue,
      expenses: totalExpenses,
      net: revenue - totalExpenses,
      orders_paid: closed.length,
      orders_quoted: ord.filter((o) => o.state === 'quoted').length,
      inquiries: inquiries ?? 0,
      customers_new: newSinceWeek,
      customers_returning: returningWithOrder.size - newSinceWeek > 0 ? returningWithOrder.size - newSinceWeek : 0,
    },
    daily: [...days.entries()].map(([date, v]) => ({ date, ...v })),
    top_products: [...productTally.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([name, t]) => ({ name, qty: t.qty, revenue: t.revenue })),
    top_customers: [...custSpend.values()].sort((a, b) => b.spend - a.spend).slice(0, 5),
    expense_breakdown: [...expCat.entries()].map(([category, amount]) => ({ category, amount })),
    raw_orders: closed.map((o) => ({
      id: o.id.slice(0, 8),
      date: new Date(o.created_at).toISOString().slice(0, 10),
      customer: o.customer_id ? (cId.get(o.customer_id)?.display_name ?? cId.get(o.customer_id)?.phone ?? '') : '',
      items: ((o.items ?? []) as Array<{ name?: string; qty?: number }>)
        .map((i) => `${i.qty ?? 1}× ${i.name ?? ''}`)
        .join(' + '),
      total: Number(o.total_amount ?? 0),
      state: o.state,
    })),
    raw_expenses: exp.map((e) => ({
      date: new Date(e.recorded_at).toISOString().slice(0, 10),
      amount: Number(e.amount ?? 0),
      category: e.category ?? 'other',
      description: e.description ?? '',
    })),
  };
}

// ───────────────── PDF ─────────────────

export function renderWeeklyReportPdf(data: WeeklyReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const accent = '#3B82F6';
    const muted = '#6B7280';

    // Header
    doc.fontSize(20).fillColor('#111').text(data.business_name, { continued: false });
    doc
      .fontSize(10)
      .fillColor(muted)
      .text(`Weekly Report · ${fmtDate(data.week_start)} – ${fmtDate(data.week_end)}`);
    doc.moveDown();

    // Headline numbers
    doc.fontSize(13).fillColor('#111').text('At a glance', { underline: false });
    doc.moveDown(0.5);
    const t = data.totals;
    drawKv(doc, [
      ['Revenue', `GHS ${fmtMoney(t.revenue)}`, accent],
      ['Expenses', `GHS ${fmtMoney(t.expenses)}`, '#EF4444'],
      ['Net profit', `GHS ${fmtMoney(t.net)}`, t.net >= 0 ? '#10B981' : '#EF4444'],
      ['Orders paid', `${t.orders_paid}`, '#111'],
      ['Quotes pending', `${t.orders_quoted}`, '#111'],
      ['Inquiries', `${t.inquiries}`, '#111'],
      ['New customers', `${t.customers_new}`, '#111'],
    ]);
    doc.moveDown();

    // Top products
    doc.fontSize(13).fillColor('#111').text('Top products');
    doc.moveDown(0.3);
    if (data.top_products.length === 0) {
      doc.fontSize(10).fillColor(muted).text('No paid orders this week.');
    } else {
      data.top_products.forEach((p, i) => {
        doc
          .fontSize(10)
          .fillColor('#111')
          .text(`${i + 1}. ${p.name} — ${p.qty} sold, GHS ${fmtMoney(p.revenue)}`);
      });
    }
    doc.moveDown();

    // Top customers
    doc.fontSize(13).fillColor('#111').text('Top customers');
    doc.moveDown(0.3);
    if (data.top_customers.length === 0) {
      doc.fontSize(10).fillColor(muted).text('No identified customers this week.');
    } else {
      data.top_customers.forEach((c, i) => {
        doc
          .fontSize(10)
          .fillColor('#111')
          .text(`${i + 1}. ${c.name} (${c.phone}) — GHS ${fmtMoney(c.spend)} across ${c.orders} order${c.orders === 1 ? '' : 's'}`);
      });
    }
    doc.moveDown();

    // Daily breakdown
    doc.fontSize(13).fillColor('#111').text('Daily breakdown');
    doc.moveDown(0.3);
    data.daily.forEach((d) => {
      doc
        .fontSize(10)
        .fillColor('#111')
        .text(`${d.date}: GHS ${fmtMoney(d.revenue)} in · GHS ${fmtMoney(d.expenses)} out · ${d.orders} orders`);
    });
    doc.moveDown();

    // Expense breakdown
    if (data.expense_breakdown.length > 0) {
      doc.fontSize(13).fillColor('#111').text('Where the money went');
      doc.moveDown(0.3);
      data.expense_breakdown.forEach((e) => {
        doc.fontSize(10).fillColor('#111').text(`• ${e.category}: GHS ${fmtMoney(e.amount)}`);
      });
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor(muted).text('Generated by Eastern AI · Your 1st Employee');

    doc.end();
  });
}

// ───────────────── Free-form document (PDF) ─────────────────

/**
 * Render arbitrary owner-chat content (a promo, a letter, a plan, a
 * marketing draft — anything that is NOT the weekly metrics report) into
 * a clean A4 PDF. `content` is lightly-Markdown: `#`/`##` headings,
 * `-`/`*` bullets, `**bold**` inline, blank lines = paragraph breaks.
 */
export function renderContentPdf(opts: {
  title: string;
  content: string;
  business_name: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const muted = '#6B7280';

    // Header
    doc.fontSize(22).fillColor('#111').font('Helvetica-Bold').text(opts.title);
    doc.font('Helvetica').fontSize(10).fillColor(muted)
      .text(`${opts.business_name} · ${fmtDate(new Date())}`);
    doc.moveDown(1);

    const lines = opts.content.replace(/\r\n/g, '\n').split('\n');
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (line.trim() === '' || line.trim() === '---') {
        doc.moveDown(0.6);
        continue;
      }
      if (line.startsWith('## ')) {
        doc.moveDown(0.3).fontSize(13).fillColor('#111');
        renderRichLine(doc, line.slice(3), true);
        continue;
      }
      if (line.startsWith('# ')) {
        doc.moveDown(0.4).fontSize(16).fillColor('#111');
        renderRichLine(doc, line.slice(2), true);
        continue;
      }
      const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bulletMatch) {
        doc.fontSize(10.5).fillColor('#111').font('Helvetica').text('•  ', { continued: true, indent: 8 });
        renderRichLine(doc, bulletMatch[1]!, false);
        continue;
      }
      const numMatch = /^\s*(\d+)\.\s+(.*)$/.exec(line);
      if (numMatch) {
        doc.fontSize(10.5).fillColor('#111').font('Helvetica').text(`${numMatch[1]}.  `, { continued: true, indent: 8 });
        renderRichLine(doc, numMatch[2]!, false);
        continue;
      }
      doc.fontSize(10.5).fillColor('#111');
      renderRichLine(doc, line, false);
    }

    // Footer
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(8).fillColor(muted)
      .text('Generated by Vector · Eastern AI', { align: 'left' });

    doc.end();
  });
}

/**
 * Render one line of lightly-Markdown text, honouring `**bold**` runs by
 * splitting on the markers and toggling the font. Strips stray `*`/`_`.
 */
function renderRichLine(doc: PDFKit.PDFDocument, text: string, baseBold: boolean): void {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0);
  if (segments.length === 0) {
    doc.font('Helvetica').text(' ');
    return;
  }
  segments.forEach((seg, i) => {
    const isLast = i === segments.length - 1;
    const boldRun = /^\*\*[^*]+\*\*$/.test(seg);
    const clean = seg.replace(/^\*\*|\*\*$/g, '').replace(/[_*]/g, '');
    doc.font(boldRun || baseBold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(clean, { continued: !isLast });
  });
  doc.font('Helvetica'); // reset for following lines
}

/**
 * Free-form content as a single-sheet workbook (one line per row). Used
 * when the owner explicitly asks for an .xlsx of non-metrics content.
 */
export async function renderContentXlsx(opts: { title: string; content: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vector by Eastern AI';
  wb.created = new Date();
  const ws = wb.addWorksheet('Document');
  ws.columns = [{ header: opts.title, key: 'line', width: 90 }];
  ws.getRow(1).font = { bold: true };
  for (const raw of opts.content.replace(/\r\n/g, '\n').split('\n')) {
    ws.addRow({ line: raw.replace(/[_*]/g, '') });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ───────────────── Excel ─────────────────

export async function renderWeeklyReportXlsx(data: WeeklyReportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Eastern AI';
  wb.created = new Date();

  // Summary sheet
  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Metric', key: 'metric', width: 26 },
    { header: 'Value', key: 'value', width: 18 },
  ];
  summary.getRow(1).font = { bold: true };
  const t = data.totals;
  summary.addRows([
    { metric: 'Business', value: data.business_name },
    { metric: 'Week start', value: fmtDate(data.week_start) },
    { metric: 'Week end', value: fmtDate(data.week_end) },
    { metric: 'Revenue (GHS)', value: t.revenue },
    { metric: 'Expenses (GHS)', value: t.expenses },
    { metric: 'Net profit (GHS)', value: t.net },
    { metric: 'Orders paid', value: t.orders_paid },
    { metric: 'Quotes pending', value: t.orders_quoted },
    { metric: 'Inquiries', value: t.inquiries },
    { metric: 'New customers', value: t.customers_new },
  ]);

  // Daily sheet
  const daily = wb.addWorksheet('Daily');
  daily.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Revenue (GHS)', key: 'revenue', width: 16 },
    { header: 'Expenses (GHS)', key: 'expenses', width: 16 },
    { header: 'Orders', key: 'orders', width: 10 },
  ];
  daily.getRow(1).font = { bold: true };
  daily.addRows(data.daily);

  // Orders sheet
  const orders = wb.addWorksheet('Orders');
  orders.columns = [
    { header: 'Order ID', key: 'id', width: 12 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Customer', key: 'customer', width: 24 },
    { header: 'Items', key: 'items', width: 36 },
    { header: 'Total (GHS)', key: 'total', width: 14 },
    { header: 'State', key: 'state', width: 14 },
  ];
  orders.getRow(1).font = { bold: true };
  orders.addRows(data.raw_orders);

  // Expenses sheet
  const expenses = wb.addWorksheet('Expenses');
  expenses.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Amount (GHS)', key: 'amount', width: 14 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Description', key: 'description', width: 36 },
  ];
  expenses.getRow(1).font = { bold: true };
  expenses.addRows(data.raw_expenses);

  // Top products
  const products = wb.addWorksheet('Top products');
  products.columns = [
    { header: 'Product', key: 'name', width: 28 },
    { header: 'Units sold', key: 'qty', width: 12 },
    { header: 'Revenue (GHS)', key: 'revenue', width: 16 },
  ];
  products.getRow(1).font = { bold: true };
  products.addRows(data.top_products);

  // Top customers
  const customers = wb.addWorksheet('Top customers');
  customers.columns = [
    { header: 'Customer', key: 'name', width: 24 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Spend (GHS)', key: 'spend', width: 14 },
    { header: 'Orders', key: 'orders', width: 10 },
  ];
  customers.getRow(1).font = { bold: true };
  customers.addRows(data.top_customers);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ───────────────── helpers ─────────────────

function drawKv(doc: PDFKit.PDFDocument, rows: Array<[string, string, string]>): void {
  rows.forEach(([k, v, color]) => {
    doc.fontSize(10).fillColor('#6B7280').text(k, { continued: true });
    doc.fillColor(color).text(`  ${v}`);
  });
}

function fmtMoney(n: number): string {
  return n.toFixed(2).replace(/\.00$/, '');
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
