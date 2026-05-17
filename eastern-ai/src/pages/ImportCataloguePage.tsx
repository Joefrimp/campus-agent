/**
 * Import catalogue from website — owner pastes URL, backend crawls, owner
 * reviews each discovered product and approves/rejects.
 *
 * Pure UI — all business logic lives in webhooks.ts + agent-engine.
 * Visual: Vector design tokens (#030303 bg, #0A0A0A cards, #00FF66 CTA).
 */
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Globe, Loader2, Check, X, RefreshCw, ArrowRight, Tag, AlertCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  startScraperRun,
  getScraperRuns,
  getPendingImports,
  decideImports,
  type ScraperRun,
  type PendingImport,
} from '../lib/webhooks'

export function ImportCataloguePage() {
  const { user } = useAuth()
  const [url, setUrl] = useState('')
  const [starting, setStarting] = useState(false)
  const [startErr, setStartErr] = useState('')
  const [runs, setRuns] = useState<ScraperRun[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [imports, setImports] = useState<PendingImport[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const refreshRuns = async () => {
    if (!user) return
    try {
      const r = await getScraperRuns(user.id)
      setRuns(r)
      if (!activeRunId && r.length > 0) setActiveRunId(r[0].id)
    } catch {/* swallow */}
  }
  const refreshImports = async () => {
    if (!user || !activeRunId) return
    try {
      const list = await getPendingImports(user.id, activeRunId)
      setImports(list)
    } catch {/* swallow */}
  }

  useEffect(() => { refreshRuns() }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refreshImports() }, [activeRunId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while active run is in progress
  useEffect(() => {
    const active = runs.find(r => r.id === activeRunId)
    if (!active) return
    if (active.status === 'ready_for_review' || active.status === 'completed' || active.status === 'failed') return
    const t = setInterval(() => { refreshRuns(); refreshImports() }, 4000)
    return () => clearInterval(t)
  }, [runs, activeRunId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = async () => {
    if (!user) return
    const trimmed = url.trim()
    if (!trimmed) { setStartErr('Paste a website URL.'); return }
    setStarting(true); setStartErr('')
    try {
      const res = await startScraperRun(user.id, trimmed)
      if (res.success && res.run_id) {
        setActiveRunId(res.run_id)
        setUrl('')
        await refreshRuns()
      } else {
        setStartErr(res.error || 'Could not start import.')
      }
    } catch (e) {
      setStartErr(e instanceof Error ? e.message : String(e))
    }
    setStarting(false)
  }

  const toggleSel = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  const pendingOnly = imports.filter(i => i.state === 'pending')
  const toggleAll = () => {
    if (selected.size === pendingOnly.length) setSelected(new Set())
    else setSelected(new Set(pendingOnly.map(i => i.id)))
  }

  const handleDecide = async (id: string, action: 'approve' | 'reject') => {
    if (!user) return
    setBusyId(id)
    try {
      await decideImports(user.id, action, { ids: [id], scope: 'ids' })
      setImports(prev => prev.map(i => i.id === id ? { ...i, state: action === 'approve' ? 'imported' : 'rejected' } : i))
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch {/* swallow */}
    setBusyId(null)
  }

  const handleBulk = async (action: 'approve' | 'reject') => {
    if (!user || selected.size === 0) return
    setBulkBusy(true)
    try {
      await decideImports(user.id, action, { ids: [...selected], scope: 'ids' })
      const newState = action === 'approve' ? 'imported' as const : 'rejected' as const
      setImports(prev => prev.map(i => selected.has(i.id) ? { ...i, state: newState } : i))
      setSelected(new Set())
    } catch {/* swallow */}
    setBulkBusy(false)
  }

  const activeRun = runs.find(r => r.id === activeRunId)

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="font-display font-black text-3xl md:text-4xl text-white tracking-tight mb-2">
          Import catalogue from your website
        </h1>
        <p className="text-zinc-400 text-base max-w-2xl">
          Paste any catalogue URL — Vector crawls it, extracts products, and writes plain descriptions you can review and approve before they appear in your live catalogue.
        </p>
      </header>

      {/* Start a new import */}
      <section className="rounded-2xl bg-[#0A0A0A] border border-[rgba(255,255,255,0.1)] p-6 mb-8">
        <label className="block">
          <span className="block font-[Inter] text-xs font-medium uppercase tracking-widest text-[#E0E0E0] mb-2">
            Website URL
          </span>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://yourshop.com"
                onKeyDown={e => { if (e.key === 'Enter') handleStart() }}
                className="w-full h-12 pl-10 pr-4 rounded-xl bg-[#030303] border border-[rgba(255,255,255,0.1)] text-white font-[Inter] text-sm placeholder:text-zinc-600 focus:outline-none focus:border-vector-primary/60 focus:ring-2 focus:ring-vector-primary/20 transition-all"
              />
            </div>
            <button
              onClick={handleStart}
              disabled={starting}
              className="h-12 px-6 rounded-full bg-vector-primary text-black font-[Outfit] font-bold text-sm hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Start import <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </label>
        {startErr && (
          <p className="mt-3 text-sm text-[#F87171] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {startErr}
          </p>
        )}
      </section>

      {/* Runs list */}
      {runs.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-[Outfit] font-bold text-lg text-white">Recent imports</h2>
            <button onClick={refreshRuns} className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {runs.slice(0, 8).map(r => (
              <button
                key={r.id}
                onClick={() => setActiveRunId(r.id)}
                className={`px-4 py-2 rounded-full text-xs font-[Inter] font-medium transition-all border ${
                  activeRunId === r.id
                    ? 'bg-vector-primary text-black border-vector-primary'
                    : 'bg-[#0A0A0A] text-zinc-300 border-[rgba(255,255,255,0.1)] hover:border-vector-primary/40'
                }`}
              >
                <span className="truncate max-w-[180px] inline-block align-middle">
                  {new URL(r.source_url).hostname}
                </span>
                <RunStatusDot status={r.status} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Active run status */}
      {activeRun && <RunStatusCard run={activeRun} />}

      {/* Imports table */}
      {imports.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-[Outfit] font-bold text-xl text-white">
                {pendingOnly.length} pending · {imports.filter(i => i.state === 'imported').length} imported · {imports.filter(i => i.state === 'rejected').length} rejected
              </h2>
            </div>
            {pendingOnly.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleAll}
                  className="text-xs font-medium text-zinc-300 hover:text-white"
                >
                  {selected.size === pendingOnly.length ? 'Deselect all' : 'Select all'}
                </button>
                <button
                  onClick={() => handleBulk('reject')}
                  disabled={selected.size === 0 || bulkBusy}
                  className="h-9 px-4 rounded-full border border-[rgba(255,255,255,0.1)] text-white text-xs font-medium hover:border-[#F87171] hover:text-[#F87171] transition-all disabled:opacity-40"
                >
                  Reject ({selected.size})
                </button>
                <button
                  onClick={() => handleBulk('approve')}
                  disabled={selected.size === 0 || bulkBusy}
                  className="h-9 px-4 rounded-full bg-vector-primary text-black font-[Outfit] font-bold text-xs hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `Approve ${selected.size}`}
                </button>
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {imports.map((item, idx) => (
              <ImportCard
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                onToggle={() => toggleSel(item.id)}
                onApprove={() => handleDecide(item.id, 'approve')}
                onReject={() => handleDecide(item.id, 'reject')}
                busy={busyId === item.id}
                delay={Math.min(idx * 30, 400)}
              />
            ))}
          </div>
        </section>
      )}

      {imports.length === 0 && activeRun && activeRun.status === 'ready_for_review' && (
        <EmptyResultsCard run={activeRun} />
      )}
    </div>
  )
}

function EmptyResultsCard({ run }: { run: ScraperRun }) {
  const diags = run.diagnostics ?? []
  return (
    <section className="mt-8 rounded-2xl bg-[#0A0A0A] border border-dashed border-[rgba(255,255,255,0.1)] p-7">
      <div className="flex items-start gap-3 mb-4">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-[Outfit] font-bold text-white text-lg mb-1">No products found</h3>
          <p className="text-zinc-400 text-sm leading-relaxed">
            {run.hint ?? 'No products extracted from this site.'}
          </p>
        </div>
      </div>

      {diags.length > 0 && (
        <details className="mt-4 group">
          <summary className="text-xs font-[Inter] font-medium text-zinc-500 hover:text-zinc-300 cursor-pointer select-none">
            Show per-page diagnostics ({diags.length})
          </summary>
          <div className="mt-3 space-y-2">
            {diags.map((d, i) => (
              <div
                key={i}
                className="rounded-lg bg-[#030303] border border-[rgba(255,255,255,0.06)] p-3 text-xs font-mono"
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-zinc-300 truncate flex-1">{d.url}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] ${
                      d.products_found > 0
                        ? 'bg-vector-primary/15 text-vector-primary'
                        : 'bg-zinc-700/30 text-zinc-400'
                    }`}
                  >
                    {d.products_found} found
                  </span>
                </div>
                <div className="text-zinc-500 text-[11px] flex flex-wrap gap-x-4 gap-y-0.5">
                  <span>HTTP {d.status_code ?? 'fail'}</span>
                  <span>{d.html_kb}KB</span>
                  <span>method: {d.method_tried}</span>
                </div>
                {d.skip_reason && (
                  <div className="text-[#F87171] text-[11px] mt-1.5 font-sans">{d.skip_reason}</div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-5 pt-5 border-t border-[rgba(255,255,255,0.06)] text-xs text-zinc-500 leading-relaxed">
        <p className="font-medium text-zinc-400 mb-2">Try this:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Paste a deeper URL like <code className="text-zinc-300">/shop</code>, <code className="text-zinc-300">/products</code>, or <code className="text-zinc-300">/menu</code> instead of the homepage</li>
          <li>If the site is JavaScript-only (React/Next.js without SSR), our scraper cannot see its products — try a Shopify/Wix/WooCommerce store instead</li>
          <li>Add the products manually via the Catalogue page if the site refuses to scrape</li>
        </ul>
      </div>
    </section>
  )
}

/* ─── Sub-components ─── */

function RunStatusCard({ run }: { run: ScraperRun }) {
  const isRunning = run.status === 'queued' || run.status === 'crawling' || run.status === 'enriching'
  return (
    <div className="rounded-2xl bg-[#0A0A0A] border border-[rgba(255,255,255,0.1)] p-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-[Inter] text-xs uppercase tracking-widest text-zinc-500 mb-1">Current import</div>
        <div className="text-white font-medium truncate">{run.source_url}</div>
        <div className="text-xs text-zinc-400 mt-1">
          {run.total_found} found · {run.approved_count} approved · {run.rejected_count} rejected
        </div>
        {run.error_message && (
          <div className="text-xs text-[#F87171] mt-2">{run.error_message}</div>
        )}
      </div>
      <div className="shrink-0">
        <StatusBadge status={run.status} spinning={isRunning} />
      </div>
    </div>
  )
}

function StatusBadge({ status, spinning }: { status: ScraperRun['status']; spinning: boolean }) {
  const map: Record<ScraperRun['status'], { label: string; cls: string }> = {
    queued:           { label: 'Queued',     cls: 'bg-zinc-700/40 text-zinc-300 border-zinc-700' },
    crawling:         { label: 'Crawling',   cls: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
    enriching:        { label: 'Enriching',  cls: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30' },
    ready_for_review: { label: 'Ready',      cls: 'bg-vector-primary/15 text-vector-primary border-vector-primary/40' },
    completed:        { label: 'Completed',  cls: 'bg-vector-primary/15 text-vector-primary border-vector-primary/40' },
    failed:           { label: 'Failed',     cls: 'bg-[#F87171]/10 text-[#F87171] border-[#F87171]/30' },
  }
  const { label, cls } = map[status]
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-[Outfit] font-bold ${cls}`}>
      {spinning && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </span>
  )
}

function RunStatusDot({ status }: { status: ScraperRun['status'] }) {
  const colorMap: Record<ScraperRun['status'], string> = {
    queued: 'bg-zinc-500',
    crawling: 'bg-blue-400 animate-pulse',
    enriching: 'bg-fuchsia-400 animate-pulse',
    ready_for_review: 'bg-vector-primary',
    completed: 'bg-vector-primary',
    failed: 'bg-[#F87171]',
  }
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ml-2 ${colorMap[status]}`} />
}

function ImportCard({
  item, selected, onToggle, onApprove, onReject, busy, delay,
}: {
  item: PendingImport
  selected: boolean
  onToggle: () => void
  onApprove: () => void
  onReject: () => void
  busy: boolean
  delay: number
}) {
  const isPending = item.state === 'pending'
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: delay / 1000 }}
      className={`rounded-2xl overflow-hidden border transition-all bg-[#0A0A0A] ${
        selected ? 'border-vector-primary/60 shadow-[0_0_24px_rgba(0,255,102,0.15)]' : 'border-[rgba(255,255,255,0.1)]'
      } ${!isPending ? 'opacity-60' : ''}`}
    >
      <div className="aspect-square bg-[#030303] relative overflow-hidden">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Tag className="w-12 h-12 text-zinc-700" />
          </div>
        )}
        {isPending && (
          <button
            onClick={onToggle}
            aria-label={selected ? 'Deselect' : 'Select'}
            className={`absolute top-3 right-3 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
              selected
                ? 'bg-vector-primary border-vector-primary text-black'
                : 'bg-black/50 border-white/30 text-white hover:border-white'
            }`}
          >
            {selected && <Check className="w-4 h-4" />}
          </button>
        )}
        {!isPending && (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-[Outfit] font-bold uppercase tracking-wider bg-black/70 text-white border border-white/20">
            {item.state}
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-[Outfit] font-bold text-white text-sm leading-tight mb-1 line-clamp-2">{item.name}</h3>
        {item.price != null && (
          <div className="text-vector-primary font-[Outfit] font-black text-lg">
            ₵{item.price.toLocaleString()}
          </div>
        )}
        {item.description && (
          <p className="text-xs text-zinc-400 mt-2 line-clamp-3 leading-relaxed">{item.description}</p>
        )}
        {isPending && (
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={onReject}
              disabled={busy}
              aria-label="Reject"
              className="flex-1 h-9 rounded-full border border-[rgba(255,255,255,0.1)] text-white text-xs hover:border-[#F87171] hover:text-[#F87171] transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <X className="w-3.5 h-3.5" /> Reject
            </button>
            <button
              onClick={onApprove}
              disabled={busy}
              aria-label="Approve"
              className="flex-1 h-9 rounded-full bg-vector-primary text-black font-[Outfit] font-bold text-xs hover:brightness-110 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Approve</>}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
