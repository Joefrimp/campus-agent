/**
 * DOCX generator for the weekly business report. Mirrors the PDF/XLSX
 * outputs so the owner can pick whichever format suits the audience
 * (editable doc for clients, polished PDF for investors, raw spreadsheet
 * for accountants).
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import type { WeeklyReportData } from '../lib/reports.js';

export async function renderBusinessDocx(data: WeeklyReportData, titleHint?: string): Promise<Buffer> {
  const fmt = (n: number) => n.toFixed(2).replace(/\.00$/, '');
  const t = data.totals;
  const range = `${data.week_start.toISOString().slice(0, 10)} → ${data.week_end.toISOString().slice(0, 10)}`;
  const title = titleHint ?? `${data.business_name} — Weekly Business Report`;

  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: title, bold: true, size: 36 })],
    }),
    new Paragraph({
      children: [new TextRun({ text: range, italics: true, color: '888888' })],
    }),
    new Paragraph({ children: [new TextRun(' ')] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun('Headline numbers')],
    }),
    bullet(`Revenue: GHS ${fmt(t.revenue)}`),
    bullet(`Expenses: GHS ${fmt(t.expenses)}`),
    bullet(`Net profit: GHS ${fmt(t.net)}`),
    bullet(`Paid orders: ${t.orders_paid} · Quoted: ${t.orders_quoted}`),
    bullet(`Inquiries handled: ${t.inquiries}`),
    bullet(`Customers — new: ${t.customers_new} · returning: ${t.customers_returning}`),
    new Paragraph({ children: [new TextRun(' ')] }),
  ];

  if (data.top_products.length > 0) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Top products')] }),
    );
    children.push(twoColTable(['Product', 'Qty · Revenue'], data.top_products.map((p) => [
      p.name,
      `${p.qty} · GHS ${fmt(p.revenue)}`,
    ])) as unknown as Paragraph);
    children.push(new Paragraph({ children: [new TextRun(' ')] }));
  }

  if (data.top_customers.length > 0) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Top customers')] }),
    );
    children.push(twoColTable(['Customer', 'Orders · Spend'], data.top_customers.map((c) => [
      `${c.name} (${c.phone})`,
      `${c.orders} · GHS ${fmt(c.spend)}`,
    ])) as unknown as Paragraph);
    children.push(new Paragraph({ children: [new TextRun(' ')] }));
  }

  if (data.expense_breakdown.length > 0) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Expense breakdown')] }),
    );
    for (const e of data.expense_breakdown) {
      children.push(bullet(`${e.category}: GHS ${fmt(e.amount)}`));
    }
    children.push(new Paragraph({ children: [new TextRun(' ')] }));
  }

  if (data.daily.length > 0) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Daily breakdown')] }),
    );
    children.push(twoColTable(
      ['Day', 'Rev · Exp · Orders'],
      data.daily.map((d) => [d.date, `GHS ${fmt(d.revenue)} · GHS ${fmt(d.expenses)} · ${d.orders}`]),
    ) as unknown as Paragraph);
  }

  const doc = new Document({
    creator: 'Vector by Eastern AI',
    title,
    description: 'Weekly business report',
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}

/**
 * Render arbitrary owner-chat content (promo, letter, plan, marketing
 * draft) into an editable Word doc. `content` is lightly-Markdown:
 * `#`/`##` headings, `-`/`*` bullets, `**bold**` inline.
 */
export async function renderContentDocx(opts: {
  title: string;
  content: string;
  business_name: string;
}): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: opts.title, bold: true, size: 40 })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `${opts.business_name} · ${new Date().toISOString().slice(0, 10)}`, italics: true, color: '888888' })],
    }),
    new Paragraph({ children: [new TextRun(' ')] }),
  ];

  for (const raw of opts.content.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '' || line.trim() === '---') {
      children.push(new Paragraph({ children: [new TextRun(' ')] }));
      continue;
    }
    if (line.startsWith('## ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: richRuns(line.slice(3)) }));
      continue;
    }
    if (line.startsWith('# ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: richRuns(line.slice(2)) }));
      continue;
    }
    const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: richRuns(bulletMatch[1]!) }));
      continue;
    }
    children.push(new Paragraph({ children: richRuns(line) }));
  }

  const doc = new Document({
    creator: 'Vector by Eastern AI',
    title: opts.title,
    description: 'Document generated by Vector',
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}

/** Split a line on `**bold**` markers into alternating TextRuns. */
function richRuns(text: string): TextRun[] {
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0);
  if (segments.length === 0) return [new TextRun(' ')];
  return segments.map((seg) => {
    const bold = /^\*\*[^*]+\*\*$/.test(seg);
    const clean = seg.replace(/^\*\*|\*\*$/g, '').replace(/[_*]/g, '');
    return new TextRun({ text: clean, bold });
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun(text)],
  });
}

function twoColTable(headers: [string, string], rows: Array<[string, string]>): Table {
  const headerRow = new TableRow({
    children: headers.map((h) =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
        shading: { fill: 'F4F4F4' },
      })),
  });
  const bodyRows = rows.map((r) =>
    new TableRow({
      children: r.map((cell) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun(cell)] })],
        })),
    }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'EEEEEE' },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'EEEEEE' },
    },
  });
}
