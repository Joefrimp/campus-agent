/**
 * Owner-chat agent loop. Loads the last ~20 turns of the thread, calls
 * Gemini Flash with the owner-tools, persists the assistant reply +
 * any attachments + the tool call summary, charges credits, returns.
 *
 * Credit pricing:
 *   base 1 + (1 per tool call) + (5 per file generated) capped at 15.
 */
import { generateText } from 'ai';
import { models } from '../lib/gemini.js';
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

export async function sendOwnerChatMessage(args: {
  user_id: string;
  thread_id: string;
  text: string;
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

  // Persist user turn first
  const userTurn = await supabase
    .from('owner_chat_messages')
    .insert({
      thread_id: args.thread_id,
      user_id: args.user_id,
      role: 'user',
      content: args.text,
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
  const messages = (history ?? [])
    .reverse()
    .map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

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
    const out = await generateText({
      // Owner chat uses Flash-Lite to stretch the free-tier quota.
      // Customer-facing brain (brain.ts) stays on Flash so replies keep
      // their quality. Owner chat is operator tooling, not the product
      // surface — Flash-Lite is plenty.
      model: models.classifier,
      system,
      messages,
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
- Answer questions about their business using tools (read_business_metrics, search_orders, list_catalogue, pending_approvals).
- Generate downloadable reports when asked: PDF (visual summary), XLSX (raw spreadsheet), DOCX (editable Word doc). Use generate_report.
- Draft marketing messages, brainstorm strategies, plan promotions, advise on pricing — speak with the confidence of a seasoned operator.
- Be candid. If a number looks bad, name it. If a strategy is risky, say so.

# STYLE
- Concise but substantive. 2-6 short paragraphs by default. Bullets only when the structure earns it.
- Direct, calm, founder-to-founder voice. Not chatty, not corporate.
- When you call a tool and it returns numbers, weave them into your reply naturally — never dump raw JSON.
- When you generate a file, mention it ONCE in your reply ("I've put it together as a PDF — the link is attached.") and do NOT paste the URL. The system attaches the link automatically.

# HARD RULES
- Never invent numbers or facts. If you don't have data, call a tool.
- Never expose your AI/model identity. You are Vector.
- Never share the owner's data with anyone other than the owner.
- For pricing / promotion advice, ground it in their actual top products / margins / customer mix from the tools.

# CREDIT AWARENESS
The owner has a finite credit budget per 48 hours. Don't be wasteful — if a single tool call answers the question, don't call three. If they ask something you already answered, recall it from the chat history rather than re-fetching.`;
}
