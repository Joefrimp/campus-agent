/**
 * Owner-chat agent loop. Loads the last ~20 turns of the thread, calls
 * Gemini Flash with the owner-tools, persists the assistant reply +
 * any attachments + the tool call summary, charges credits, returns.
 *
 * Credit pricing:
 *   base 1 + (1 per tool call) + (5 per file generated) capped at 15.
 */
import { models, resilientGenerateText } from '../lib/gemini.js';
import { supabase } from '../lib/supabase.js';
import { buildOwnerTools, type OwnerToolContext } from './tools.js';
import { chargeCredits, getCreditState } from './credits.js';
import { logger } from '../lib/logger.js';
import type { CreditState } from './credits.js';

export interface SendResult {
  ok: boolean;
  error?: string;
  assistant_message_id?: string;
  credits: CreditState;
}

export interface IncomingAttachment {
  type: string;        // 'image' | 'pdf' | 'xlsx' | 'docx' | 'file'
  url: string;         // public Supabase Storage URL
  mime: string;        // e.g. 'image/jpeg', 'application/pdf'
  name: string;
  size_bytes?: number;
}

export async function sendOwnerChatMessage(args: {
  user_id: string;
  thread_id: string;
  text: string;
  attachments?: IncomingAttachment[];
}): Promise<SendResult> {
  // Pre-flight credit check: refuse with 0 charge if at the cap
  const pre = await getCreditState(args.user_id);
  if (pre.remaining <= 0) {
    return {
      ok: false,
      error: `You're out of chat credits. They reset at ${new Date(pre.reset_at).toLocaleString()}.`,
      credits: pre,
    };
  }

  const incoming = args.attachments ?? [];
  const images = incoming.filter((a) => a.mime?.startsWith('image/'));
  const otherFiles = incoming.filter((a) => !a.mime?.startsWith('image/'));

  // Persist user turn first (store attachments so they render in history)
  const userTurn = await supabase
    .from('owner_chat_messages')
    .insert({
      thread_id: args.thread_id,
      user_id: args.user_id,
      role: 'user',
      content: args.text || (incoming.length ? '[attachment]' : ''),
      attachments: incoming.length
        ? incoming.map((a) => ({ type: a.type, filename: a.name, url: a.url, size_bytes: a.size_bytes ?? 0 }))
        : null,
      credits_spent: 0,
    })
    .select('id, created_at')
    .single();

  // Load recent history (limit ~20 turns to keep prompt small)
  const { data: history } = await supabase
    .from('owner_chat_messages')
    .select('role, content')
    .eq('thread_id', args.thread_id)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(20);
  // content can be a plain string (history) or multimodal parts (this turn).
  type Part =
    | { type: 'text'; text: string }
    | { type: 'image'; image: URL };
  const messages: Array<{ role: 'user' | 'assistant'; content: string | Part[] }> =
    (history ?? [])
      .reverse()
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

  // If the owner attached images, rebuild the LAST (current) user turn as
  // multimodal content so the vision-capable model can actually see them.
  // Non-image files are referenced by name in the text (full document
  // parsing is a follow-up).
  if (incoming.length > 0 && messages.length > 0) {
    const lastIdx = messages.length - 1;
    let text = args.text?.trim() || 'Take a look at what I attached.';
    if (otherFiles.length > 0) {
      text += `\n\n[Attached files: ${otherFiles.map((f) => `${f.name} (${f.mime})`).join(', ')}]`;
    }
    const parts: Part[] = [{ type: 'text', text }];
    for (const img of images) {
      try {
        parts.push({ type: 'image', image: new URL(img.url) });
      } catch {/* skip malformed url */}
    }
    messages[lastIdx] = { role: 'user', content: parts };
  }

  const hasImages = images.length > 0;

  // Load tenant context for the prompt
  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name, first_name')
    .eq('id', args.user_id)
    .maybeSingle();

  const ctx: OwnerToolContext = {
    user_id: args.user_id,
    thread_id: args.thread_id,
    tool_call_count: 0,
    file_count: 0,
    attachments: [],
  };
  const tools = buildOwnerTools(ctx);

  const system = buildSystemPrompt(profile?.business_name ?? 'your business', profile?.first_name ?? 'there');

  let replyText = '';
  try {
    const out = await resilientGenerateText({
      // Use Gemini Flash (the agent model) for owner chat — NOT Flash-Lite.
      // This is the operator's own console: low volume, quality matters, and
      // Flash-Lite frequently calls a tool then returns empty text (the
      // "couldn't summarise it cleanly" stub). Flash reliably does
      // tool-call → summarise in one turn. Groq fallback covers the
      // text-only path if Gemini is rate-limited (Groq has no vision).
      model: models.agent,
      fallbackModel: hasImages ? undefined : models.groqFallback,
      system,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      tools,
      maxSteps: 6,
      temperature: 0.5,
      maxTokens: 700,
    });
    replyText = cleanReply(out.text);
    // Empty reply usually means the LLM made tool calls but produced no
    // final text. Fall back to a friendly stub so the chat doesn't look
    // broken — the tool output (if any attachment) is still attached.
    if (!replyText) {
      replyText = ctx.file_count > 0
        ? "Here's what you asked for — the file is attached above."
        : ctx.tool_call_count > 0
          ? "I pulled the data but couldn't summarise it cleanly. Try rephrasing your question."
          : "I didn't catch that. Could you rephrase?";
    }
  } catch (err) {
    const errMsg = (err as Error).message ?? 'unknown';
    logger.error({ err, errMsg, thread_id: args.thread_id }, 'owner-chat: generateText failed');
    return {
      ok: false,
      error: `Could not generate a reply: ${errMsg.slice(0, 240)}`,
      credits: await getCreditState(args.user_id),
    };
  }

  // Credit math
  const cost = Math.min(15, 1 + ctx.tool_call_count + ctx.file_count * 5);
  const charge = await chargeCredits(args.user_id, cost);
  if (!charge.ok) {
    // Should rarely happen since we pre-checked, but if a long-running
    // reply lands JUST as the user's credits dry up, still save the reply
    // and tell them the next message is gated.
    logger.warn({ user_id: args.user_id }, 'owner-chat: charge failed at end of turn');
  }

  // Persist assistant turn
  const assistant = await supabase
    .from('owner_chat_messages')
    .insert({
      thread_id: args.thread_id,
      user_id: args.user_id,
      role: 'assistant',
      content: replyText,
      credits_spent: cost,
      attachments: ctx.attachments.length > 0 ? ctx.attachments : null,
      tool_calls: ctx.tool_call_count > 0
        ? { count: ctx.tool_call_count, files: ctx.file_count }
        : null,
    })
    .select('id')
    .single();

  // Bump thread updated_at + maybe set title from first user turn
  await supabase
    .from('owner_chat_threads')
    .update({
      updated_at: new Date().toISOString(),
      ...(userTurn.data && messages.length === 1
        ? { title: deriveTitle(args.text) }
        : {}),
    })
    .eq('id', args.thread_id);

  return {
    ok: true,
    assistant_message_id: assistant.data?.id,
    credits: charge.state,
  };
}

/* ─── Title helper: derive a short label from the first user message ─── */

function deriveTitle(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= 40) return cleaned;
  return cleaned.slice(0, 38).trimEnd() + '…';
}

function cleanReply(text: string): string {
  return text
    .replace(/^["']|["']$/g, '')
    .replace(/^Response:\s*/i, '')
    .trim();
}

/* ─── System prompt ─── */

function buildSystemPrompt(business_name: string, first_name: string): string {
  return `You are Vector — the operator-mode counterpart to the customer-facing agent for ${business_name}.

You are talking to ${first_name}, the OWNER. They are your principal, not a customer. Treat them as a peer running the business with you.

# WHAT YOU DO HERE
- Answer questions about their business using tools (read_business_metrics, search_orders, list_catalogue, pending_approvals, unanswered_messages).
- Surface customer messages Vector didn't reply to (non-business chatter it flagged for the owner) via unanswered_messages when they ask what came in, what's unanswered, or what needs their attention.
- Generate downloadable files with generate_report. It has TWO modes:
  • report_type='metrics' → the weekly sales/performance report (live data). Use ONLY when they want their numbers.
  • report_type='document' → ANY other file (a promo, letter, plan, pricing sheet, strategy memo). You MUST pass the full \`content\` — the file contains EXACTLY what you put there and nothing else. If the owner says "put THIS in a PDF" about something you just wrote, copy that text verbatim into \`content\`.
- Draft marketing messages, brainstorm strategies, plan promotions, advise on pricing — speak with the confidence of a seasoned operator.
- Be candid. If a number looks bad, name it. If a strategy is risky, say so.

# STYLE
- Write like a sharp, experienced human operator — never like a template or a corporate bot. Specific, decisive, warm.
- Concise but substantive. 2-6 short paragraphs by default. Bullets only when the structure earns it.
- When you call a tool and it returns numbers, weave them into your reply naturally — never dump raw JSON.
- When you generate a file, mention it ONCE ("Done — it's attached as a PDF.") and do NOT paste the URL. The system attaches the link automatically.

# HARD RULES — DO NOT BREAK
- NEVER invent products, numbers, prices, stock counts, or facts. If you don't have the data, call a tool; if the tool comes back empty, SAY it's empty — do not fabricate. (A made-up product like "HP EliteBook Dragonfly" when the catalogue is empty is a serious failure.)
- NEVER leave placeholders in anything you hand the owner — no "[Your Brand]", "[short URL]", "[price]", "[X units]". Use the real business name; omit any link or number you don't actually have.
- NEVER claim a file contains something you didn't pass into generate_report's \`content\`. What you write in \`content\` IS the file.
- For promos/pricing, ground every claim in their real catalogue / orders / margins from the tools.
- Never expose your AI/model identity. You are Vector. Never share the owner's data with anyone but the owner.

# CREDIT AWARENESS
The owner has a finite credit budget per 48 hours. Don't be wasteful — if a single tool call answers the question, don't call three. If they ask something you already answered, recall it from the chat history rather than re-fetching.`;
}
