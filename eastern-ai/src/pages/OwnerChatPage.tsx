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
  Paperclip, Camera, ImageIcon, X,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
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
  type OutgoingAttachment,
} from '../lib/webhooks'

/* ─── Attachment helpers ─── */

// A file the owner picked but hasn't sent yet.
interface PendingAttachment {
  id: string
  file: File
  previewUrl: string | null // object URL for images, null otherwise
  url: string | null        // public URL once uploaded
  uploading: boolean
  error: boolean
}

function attachmentType(mime: string): string {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'xlsx'
  if (mime.includes('word') || mime.includes('document')) return 'docx'
  return 'file'
}

async function uploadToStorage(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${userId}/owner-chat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('product-images').getPublicUrl(path)
  return data.publicUrl
}

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
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const endRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

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
  /* ─── attachment handlers ─── */
  const addFiles = async (files: FileList | null) => {
    if (!user || !files || files.length === 0) return
    setError('')
    const room = Math.max(0, 8 - attachments.length)
    const picked = Array.from(files).slice(0, room)
    const next: PendingAttachment[] = picked.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      url: null,
      uploading: true,
      error: false,
    }))
    setAttachments(prev => [...prev, ...next])
    // Upload each in parallel; flip uploading flag as they land.
    await Promise.all(next.map(async (att) => {
      try {
        const url = await uploadToStorage(user.id, att.file)
        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, url, uploading: false } : a))
      } catch {
        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, uploading: false, error: true } : a))
      }
    }))
  }
  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const gone = prev.find(a => a.id === id)
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter(a => a.id !== id)
    })
  }

  const uploadingAny = attachments.some(a => a.uploading)

  const handleSend = async () => {
    if (!user) return
    const text = input.trim()
    const ready = attachments.filter(a => a.url && !a.error)
    if (!text && ready.length === 0) return
    if (uploadingAny) return // wait for uploads to finish
    let threadId = activeId
    if (!threadId) {
      const res = await createOwnerChatThread(user.id)
      if (!res.success || !res.thread) { setError('Could not start chat.'); return }
      threadId = res.thread.id
      setThreads(prev => [res.thread!, ...prev])
      setActiveId(threadId)
    }
    const outgoing: OutgoingAttachment[] = ready.map(a => ({
      type: attachmentType(a.file.type),
      url: a.url!,
      mime: a.file.type || 'application/octet-stream',
      name: a.file.name,
      size_bytes: a.file.size,
    }))
    setInput('')
    setSending(true)
    setError('')
    // Optimistic user bubble
    const optimisticId = `tmp-${Date.now()}`
    setMessages(prev => [...prev, {
      id: optimisticId, role: 'user', content: text || '[attachment]',
      attachments: outgoing.length
        ? outgoing.map(o => ({ type: o.type, filename: o.name, url: o.url, size_bytes: o.size_bytes ?? 0 }))
        : null,
      tool_calls: null, credits_spent: 0, created_at: new Date().toISOString(),
    }])
    // Clear the composer attachments (revoke previews)
    attachments.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    setAttachments([])
    try {
      const res = await sendOwnerChatMessage(user.id, threadId, text, outgoing)
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
            {/* Pending attachment chips */}
            {attachments.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {attachments.map(a => (
                  <ComposerChip key={a.id} att={a} onRemove={() => removeAttachment(a.id)} />
                ))}
              </div>
            )}

            {/* Hidden inputs */}
            <input
              ref={fileInputRef} type="file" multiple className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
            />
            <input
              ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
            />
            <input
              ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
            />

            <div className="flex items-end gap-2">
              <div className="flex items-center gap-1 pb-1">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={sending || !!outOfCredits || attachments.length >= 8}
                  className="shrink-0 h-9 w-9 rounded-full text-zinc-400 hover:text-vector-primary hover:bg-white/5 flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Attach image"
                  title="Add image"
                >
                  <ImageIcon className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={sending || !!outOfCredits || attachments.length >= 8}
                  className="shrink-0 h-9 w-9 rounded-full text-zinc-400 hover:text-vector-primary hover:bg-white/5 flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Take photo"
                  title="Take photo"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || !!outOfCredits || attachments.length >= 8}
                  className="shrink-0 h-9 w-9 rounded-full text-zinc-400 hover:text-vector-primary hover:bg-white/5 flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Attach file"
                  title="Attach file"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
              </div>
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
                disabled={sending || uploadingAny || (!input.trim() && attachments.filter(a => a.url && !a.error).length === 0) || !!outOfCredits}
                className="shrink-0 h-12 w-12 rounded-full bg-vector-primary text-black flex items-center justify-center hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send"
              >
                {sending || uploadingAny ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
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
  // Render images as a clickable thumbnail.
  if (a.type === 'image') {
    return (
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={a.url}
          alt={a.filename}
          className="max-h-48 max-w-[220px] rounded-xl border border-[rgba(255,255,255,0.1)] object-cover hover:border-vector-primary/50 transition"
        />
      </a>
    )
  }
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

/* Pending attachment preview in the composer (before send). */
function ComposerChip({ att, onRemove }: { att: PendingAttachment; onRemove: () => void }) {
  const isImage = att.file.type.startsWith('image/')
  const Icon = attachmentType(att.file.type) === 'pdf' ? FileText
    : attachmentType(att.file.type) === 'xlsx' ? FileSpreadsheet
    : FileIcon
  return (
    <div className="relative group">
      {isImage && att.previewUrl ? (
        <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-[rgba(255,255,255,0.12)]">
          <img src={att.previewUrl} alt={att.file.name} className="w-full h-full object-cover" />
          {att.uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            </div>
          )}
          {att.error && (
            <div className="absolute inset-0 bg-[#F87171]/30 flex items-center justify-center text-[9px] text-white font-medium">
              failed
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-[#030303] border border-[rgba(255,255,255,0.12)] rounded-lg pl-2.5 pr-2 py-2 max-w-[200px]">
          <div className="w-7 h-7 rounded bg-vector-primary/15 border border-vector-primary/30 flex items-center justify-center shrink-0">
            {att.uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-vector-primary" />
              : <Icon className="w-3.5 h-3.5 text-vector-primary" />}
          </div>
          <span className={`text-[11px] truncate ${att.error ? 'text-[#F87171]' : 'text-zinc-300'}`}>
            {att.error ? 'Upload failed' : att.file.name}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#0A0A0A] border border-[rgba(255,255,255,0.2)] text-zinc-300 hover:text-white hover:border-white flex items-center justify-center transition"
        aria-label="Remove attachment"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
