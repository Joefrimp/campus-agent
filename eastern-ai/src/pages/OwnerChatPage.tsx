/**
 * Owner-chat page — a Claude/Manus-style chat where the owner asks Vector
 * to do operator tasks: pull metrics, generate PDF/DOCX/XLSX reports,
 * draft marketing copy, brainstorm strategy, etc.
 *
 * Multi-thread sidebar on the left, message stream in the center, credit
 * meter top-right. 300 credits per 48h rolling window.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  MessageSquarePlus, Send, Loader2, Trash2, FileText, FileSpreadsheet,
  File as FileIcon, Sparkles, Bot, User as UserIcon, Clock, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  createOwnerChatThread,
  listOwnerChatThreads,
  deleteOwnerChatThread,
  listOwnerChatMessages,
  sendOwnerChatMessage,
  getOwnerChatCredits,
  type OwnerChatThread,
  type OwnerChatMessage,
  type OwnerChatAttachment,
  type OwnerChatCredits,
} from '../lib/webhooks'

export function OwnerChatPage() {
  const { user } = useAuth()
  const [threads, setThreads] = useState<OwnerChatThread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<OwnerChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [credits, setCredits] = useState<OwnerChatCredits | null>(null)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  /* ─── load threads + credits ─── */
  const refreshThreads = async () => {
    if (!user) return
    try {
      const t = await listOwnerChatThreads(user.id)
      setThreads(t)
      if (!activeId && t.length > 0) setActiveId(t[0].id)
    } catch {/* swallow */}
  }
  const refreshCredits = async () => {
    if (!user) return
    try { setCredits(await getOwnerChatCredits(user.id)) } catch {/* swallow */}
  }
  useEffect(() => {
    refreshThreads(); refreshCredits()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  /* ─── load messages when active thread changes ─── */
  useEffect(() => {
    if (!user || !activeId) { setMessages([]); return }
    listOwnerChatMessages(user.id, activeId).then(setMessages).catch(() => {})
  }, [user?.id, activeId])

  /* ─── auto-scroll to newest ─── */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  /* ─── handlers ─── */
  const handleNewThread = async () => {
    if (!user) return
    setCreating(true)
    try {
      const res = await createOwnerChatThread(user.id)
      if (res.success && res.thread) {
        setThreads(prev => [res.thread!, ...prev])
        setActiveId(res.thread.id)
        setMessages([])
      }
    } catch {/* swallow */}
    setCreating(false)
  }
  const handleDeleteThread = async (id: string) => {
    if (!user || !confirm('Delete this chat?')) return
    setDeletingId(id)
    try {
      await deleteOwnerChatThread(user.id, id)
      setThreads(prev => prev.filter(t => t.id !== id))
      if (activeId === id) { setActiveId(null); setMessages([]) }
    } catch {/* swallow */}
    setDeletingId(null)
  }
  const handleSend = async () => {
    if (!user || !input.trim()) return
    let threadId = activeId
    if (!threadId) {
      const res = await createOwnerChatThread(user.id)
      if (!res.success || !res.thread) { setError('Could not start chat.'); return }
      threadId = res.thread.id
      setThreads(prev => [res.thread!, ...prev])
      setActiveId(threadId)
    }
    const text = input.trim()
    setInput('')
    setSending(true)
    setError('')
    // Optimistic user bubble
    const optimisticId = `tmp-${Date.now()}`
    setMessages(prev => [...prev, {
      id: optimisticId, role: 'user', content: text, attachments: null,
      tool_calls: null, credits_spent: 0, created_at: new Date().toISOString(),
    }])
    try {
      const res = await sendOwnerChatMessage(user.id, threadId, text)
      if (res.credits) setCredits(res.credits)
      if (!res.ok) {
        setError(res.error || 'Could not send.')
      }
      // Re-fetch full thread to get both persisted user turn + assistant reply
      const full = await listOwnerChatMessages(user.id, threadId)
      setMessages(full)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
    }
    setSending(false)
  }
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const outOfCredits = credits && credits.remaining <= 0

  return (
    <div className="flex h-[calc(100vh-80px)] bg-vector-bg">
      {/* ─── Thread sidebar ─── */}
      <aside className="w-64 shrink-0 border-r border-[rgba(255,255,255,0.08)] bg-[#0A0A0A] flex flex-col">
        <button
          onClick={handleNewThread}
          disabled={creating}
          className="m-3 inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-vector-primary text-black font-[Outfit] font-bold text-sm hover:brightness-110 transition disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
          New chat
        </button>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {threads.length === 0 ? (
            <p className="text-xs text-zinc-500 px-3 py-4 text-center">No chats yet. Start one above.</p>
          ) : threads.map(t => (
            <div
              key={t.id}
              className={`group flex items-center gap-1.5 rounded-lg pl-3 pr-1 py-2 cursor-pointer transition-colors ${
                activeId === t.id ? 'bg-vector-primary/10 border border-vector-primary/30' : 'hover:bg-white/5 border border-transparent'
              }`}
              onClick={() => setActiveId(t.id)}
            >
              <span className={`flex-1 min-w-0 truncate text-sm ${activeId === t.id ? 'text-vector-primary font-medium' : 'text-zinc-300'}`}>
                {t.title}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteThread(t.id) }}
                disabled={deletingId === t.id}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-zinc-400 hover:text-[#F87171] p-1 rounded"
                aria-label="Delete chat"
              >
                {deletingId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
        {credits && <CreditsCard credits={credits} onRefresh={refreshCredits} />}
      </aside>

      {/* ─── Conversation panel ─── */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.length === 0 && <EmptyHelper onPrompt={(p) => setInput(p)} />}
            <AnimatePresence initial={false}>
              {messages.map(m => <Bubble key={m.id} msg={m} />)}
            </AnimatePresence>
            {sending && (
              <div className="flex items-center gap-2 text-xs text-zinc-500 px-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Vector is thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-[rgba(255,255,255,0.08)] bg-[#0A0A0A] px-4 md:px-8 py-4">
          <div className="max-w-3xl mx-auto">
            {error && <p className="text-xs text-[#F87171] mb-2">{error}</p>}
            {outOfCredits && (
              <div className="mb-3 rounded-lg bg-[#F87171]/10 border border-[#F87171]/30 px-3 py-2 text-xs text-[#F87171]">
                Out of chat credits. They reset at {credits ? new Date(credits.reset_at).toLocaleString() : 'soon'}.
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending || !!outOfCredits}
                rows={1}
                placeholder={outOfCredits ? 'Credits reset soon…' : 'Ask Vector anything — sales, strategy, draft a report, brainstorm a promo…'}
                className="flex-1 resize-none bg-[#030303] border border-[rgba(255,255,255,0.1)] text-white font-[Inter] text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-vector-primary/60 focus:ring-2 focus:ring-vector-primary/20 transition disabled:opacity-50 min-h-[48px] max-h-40"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = Math.min(160, el.scrollHeight) + 'px'
                }}
              />
              <button
                onClick={handleSend}
                disabled={sending || !input.trim() || !!outOfCredits}
                className="shrink-0 h-12 w-12 rounded-full bg-vector-primary text-black flex items-center justify-center hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send"
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 text-center mt-2">
              Enter to send · Shift+Enter for newline · {credits ? `${credits.remaining} / ${credits.cap} credits` : ''}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

/* ═══ Sub-components ═══ */

function CreditsCard({ credits, onRefresh }: { credits: OwnerChatCredits; onRefresh: () => void }) {
  const pct = Math.round((credits.remaining / credits.cap) * 100)
  const hours = Math.floor(credits.resets_in_ms / 3_600_000)
  const mins = Math.floor((credits.resets_in_ms % 3_600_000) / 60_000)
  return (
    <div className="m-3 p-3 rounded-xl bg-[#030303] border border-[rgba(255,255,255,0.08)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest">Credits</span>
        <button onClick={onRefresh} className="text-zinc-500 hover:text-zinc-300">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-[Outfit] font-bold text-white">{credits.remaining}</span>
        <span className="text-xs text-zinc-500">/ {credits.cap}</span>
      </div>
      <div className="h-1.5 bg-[rgba(255,255,255,0.08)] rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all ${
            pct > 30 ? 'bg-vector-primary' : pct > 10 ? 'bg-amber-400' : 'bg-[#F87171]'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-zinc-500 inline-flex items-center gap-1">
        <Clock className="w-3 h-3" /> Resets in {hours}h {mins}m
      </p>
    </div>
  )
}

function EmptyHelper({ onPrompt }: { onPrompt: (p: string) => void }) {
  const prompts = [
    "How did sales go this week?",
    "Generate a PDF report of last week's performance",
    "Draft a Friday promo for my top product",
    "Which 5 customers spent the most last month?",
    "What's in my pending approvals queue?",
  ]
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-vector-primary/10 border border-vector-primary/30 mb-4">
        <Sparkles className="w-7 h-7 text-vector-primary" />
      </div>
      <h2 className="font-[Outfit] font-bold text-2xl text-white mb-1">Talk to Vector</h2>
      <p className="text-sm text-zinc-400 max-w-md mx-auto mb-6">
        Ask about your business, generate reports, draft marketing copy, brainstorm strategy.
        Vector has live access to your sales, orders, catalogue, and approvals.
      </p>
      <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
        {prompts.map(p => (
          <button
            key={p}
            onClick={() => onPrompt(p)}
            className="text-xs text-zinc-300 bg-[#0A0A0A] border border-[rgba(255,255,255,0.08)] hover:border-vector-primary/40 hover:text-white rounded-full px-3.5 py-1.5 transition"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

function Bubble({ msg }: { msg: OwnerChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-vector-primary/20 border border-vector-primary/40' : 'bg-white/5 border border-white/10'
      }`}>
        {isUser
          ? <UserIcon className="w-4 h-4 text-vector-primary" />
          : <Bot className="w-4 h-4 text-zinc-300" />}
      </div>
      <div className={`flex-1 min-w-0 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block text-left rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-vector-primary text-black'
            : 'bg-[#0A0A0A] border border-[rgba(255,255,255,0.08)] text-zinc-100'
        }`}>
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
        </div>
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 justify-start">
            {msg.attachments.map((a, i) => <Attachment key={i} a={a} />)}
          </div>
        )}
        {msg.credits_spent > 0 && (
          <p className="text-[10px] text-zinc-500 mt-1.5 px-1">
            {msg.credits_spent} credit{msg.credits_spent === 1 ? '' : 's'}
            {msg.tool_calls?.count ? ` · ${msg.tool_calls.count} tool call${msg.tool_calls.count === 1 ? '' : 's'}` : ''}
          </p>
        )}
      </div>
    </motion.div>
  )
}

function Attachment({ a }: { a: OwnerChatAttachment }) {
  const Icon = a.type === 'pdf' ? FileText : a.type === 'xlsx' ? FileSpreadsheet : FileIcon
  const kb = a.size_bytes < 1024 * 1024
    ? `${Math.round(a.size_bytes / 1024)} KB`
    : `${(a.size_bytes / (1024 * 1024)).toFixed(1)} MB`
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      download={a.filename}
      className="inline-flex items-center gap-2.5 bg-[#0A0A0A] border border-[rgba(255,255,255,0.1)] hover:border-vector-primary/50 rounded-xl px-3 py-2.5 transition group"
    >
      <div className="w-9 h-9 rounded-lg bg-vector-primary/15 border border-vector-primary/30 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-vector-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-white truncate max-w-[200px]">{a.filename}</div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{a.type} · {kb}</div>
      </div>
    </a>
  )
}
