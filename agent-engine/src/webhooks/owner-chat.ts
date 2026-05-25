/**
 * Owner-chat HTTP routes (all shared-secret-gated).
 *
 *   POST /owner-chat/threads               { user_id, title? } -> { thread_id }
 *   GET  /owner-chat/threads               ?user_id=...        -> recent threads
 *   POST /owner-chat/threads/delete        { user_id, thread_id }
 *   GET  /owner-chat/messages              ?user_id=...&thread_id=...
 *   POST /owner-chat/send                  { user_id, thread_id, text }
 *   GET  /owner-chat/credits               ?user_id=...        -> credit state
 */
import type { Context } from 'hono';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { sendOwnerChatMessage } from '../owner-chat/handler.js';
import { getCreditState } from '../owner-chat/credits.js';

const CreateThreadSchema = z.object({
  user_id: z.string().uuid(),
  title: z.string().max(120).optional(),
});

export async function handleCreateThread(c: Context): Promise<Response> {
  const parsed = CreateThreadSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'invalid payload' }, 400);
  const { data, error } = await supabase
    .from('owner_chat_threads')
    .insert({ user_id: parsed.data.user_id, title: parsed.data.title ?? 'New chat' })
    .select('id, title, created_at, updated_at')
    .single();
  if (error || !data) {
    logger.error({ err: error }, 'create thread failed');
    return c.json({ success: false, error: 'could not create thread' }, 200);
  }
  return c.json({ success: true, thread: data });
}

export async function handleListThreads(c: Context): Promise<Response> {
  const user_id = c.req.query('user_id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(user_id))
    return c.json({ success: false, error: 'invalid user_id' }, 400);
  const { data } = await supabase
    .from('owner_chat_threads')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user_id)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(50);
  return c.json({ success: true, threads: data ?? [] });
}

const DeleteThreadSchema = z.object({
  user_id: z.string().uuid(),
  thread_id: z.string().uuid(),
});

export async function handleDeleteThread(c: Context): Promise<Response> {
  const parsed = DeleteThreadSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'invalid payload' }, 400);
  // Confirm ownership before delete
  const { data: row } = await supabase
    .from('owner_chat_threads')
    .select('user_id')
    .eq('id', parsed.data.thread_id)
    .maybeSingle();
  if (!row || row.user_id !== parsed.data.user_id) {
    return c.json({ success: false, error: 'not found' }, 200);
  }
  await supabase.from('owner_chat_threads').delete().eq('id', parsed.data.thread_id);
  return c.json({ success: true });
}

export async function handleListMessages(c: Context): Promise<Response> {
  const user_id = c.req.query('user_id') ?? '';
  const thread_id = c.req.query('thread_id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(user_id) || !/^[0-9a-f-]{36}$/i.test(thread_id))
    return c.json({ success: false, error: 'invalid query' }, 400);
  const { data } = await supabase
    .from('owner_chat_messages')
    .select('id, role, content, attachments, tool_calls, credits_spent, created_at')
    .eq('user_id', user_id)
    .eq('thread_id', thread_id)
    .order('created_at', { ascending: true })
    .limit(200);
  return c.json({ success: true, messages: data ?? [] });
}

const SendSchema = z.object({
  user_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  // text can be empty when the owner sends attachments with no caption
  text: z.string().max(4000).default(''),
  attachments: z
    .array(
      z.object({
        type: z.string(),
        url: z.string().url(),
        mime: z.string(),
        name: z.string(),
        size_bytes: z.number().optional(),
      }),
    )
    .max(8)
    .optional(),
}).refine((d) => (d.text && d.text.trim().length > 0) || (d.attachments && d.attachments.length > 0), {
  message: 'Provide text or at least one attachment',
});

export async function handleSendOwnerChat(c: Context): Promise<Response> {
  const parsed = SendSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'invalid payload' }, 400);
  const result = await sendOwnerChatMessage(parsed.data);
  return c.json(result);
}

export async function handleGetCredits(c: Context): Promise<Response> {
  const user_id = c.req.query('user_id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(user_id))
    return c.json({ success: false, error: 'invalid user_id' }, 400);
  const state = await getCreditState(user_id);
  return c.json({ success: true, credits: state });
}
