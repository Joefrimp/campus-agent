/**
 * Frontend → agent-engine API client.
 * All endpoints validate X-Eastern-AI-Secret server-side.
 */
const BASE = import.meta.env.VITE_AGENT_ENGINE_URL as string
const SECRET = import.meta.env.VITE_AGENT_ENGINE_SECRET as string

if (!BASE) {
  // Surfaced to dev console — won't show OTP codes ever again.
  console.error(
    '[webhooks] VITE_AGENT_ENGINE_URL is not set. Set it in eastern-ai/.env.local and restart.',
  )
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Eastern-AI-Secret': SECRET || '',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Webhook ${path} failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<T>
}

export interface OtpResponse {
  success: boolean
  message?: string
  error?: string
}

export interface SetupWhatsAppResponse {
  success: boolean
  status: string
}

export function sendOtp(userId: string, phone: string) {
  return post<OtpResponse>('/otp/send', { user_id: userId, phone })
}

export function verifyOtp(userId: string, code: string) {
  return post<OtpResponse>('/otp/verify', { user_id: userId, code })
}

export function setupWhatsApp(userId: string) {
  return post<SetupWhatsAppResponse>('/whatsapp-setup', { user_id: userId })
}

export function updateBrandVoice(userId: string, brandVoice: string) {
  return post<{ success: boolean }>('/update-brand-voice', { user_id: userId, brand_voice: brandVoice })
}

export function setHumanInLoop(userId: string, enabled: boolean) {
  return post<{ success: boolean }>('/set-hitl', { user_id: userId, enabled })
}

/* ─── Pro auto-activation (MoMo OCR) ─── */

export interface ProPaymentConfig {
  momo_number: string
  momo_account_name: string
  pro_price_ghs: number
  activation_whatsapp: string
  activation_minutes: number
  configured: boolean
}

export async function getProPaymentConfig(): Promise<ProPaymentConfig> {
  // Public endpoint — no shared secret needed.
  const res = await fetch(`${BASE}/config/pro-payment`)
  if (!res.ok) throw new Error(`config failed (${res.status})`)
  return res.json() as Promise<ProPaymentConfig>
}

export interface StartUpgradeResponse {
  success: boolean
  code: string
  amount_due_ghs: number
  expires_at: string
  duration_months: number
  operator: ProPaymentConfig
  error?: string
}

export function startProUpgrade(userId: string, durationMonths = 1) {
  return post<StartUpgradeResponse>('/billing/start-upgrade', {
    user_id: userId,
    duration_months: durationMonths,
  })
}

export interface ActivationStatusResponse {
  success: boolean
  code?: string
  status?: 'pending' | 'paid' | 'expired' | 'cancelled'
  expires_at?: string
  matched_at?: string | null
  error?: string
}

export async function getActivationStatus(userId: string, code: string): Promise<ActivationStatusResponse> {
  const url = `${BASE}/billing/activation-status?user_id=${encodeURIComponent(userId)}&code=${encodeURIComponent(code)}`
  const res = await fetch(url, { headers: { 'X-Eastern-AI-Secret': SECRET || '' } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`activation-status failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<ActivationStatusResponse>
}

export function cancelProUpgrade(userId: string, code: string) {
  return post<{ success: boolean }>('/billing/cancel-upgrade', { user_id: userId, code })
}

/* ─── Website catalogue importer ─── */

export interface ScraperRun {
  id: string
  source_url: string
  status: 'queued' | 'crawling' | 'enriching' | 'ready_for_review' | 'completed' | 'failed'
  total_found: number
  approved_count: number
  rejected_count: number
  error_message: string | null
  started_at: string
  finished_at: string | null
}

export interface PendingImport {
  id: string
  name: string
  description: string | null
  price: number | null
  currency: string | null
  image_url: string | null
  category: string | null
  source_url: string | null
  state: 'pending' | 'approved' | 'rejected' | 'imported'
  created_at: string
}

export function startScraperRun(userId: string, sourceUrl: string) {
  return post<{ success: boolean; run_id?: string; error?: string }>(
    '/scraper/start',
    { user_id: userId, source_url: sourceUrl },
  )
}

export async function getScraperRuns(userId: string): Promise<ScraperRun[]> {
  const res = await fetch(`${BASE}/scraper/runs?user_id=${encodeURIComponent(userId)}`, {
    headers: { 'X-Eastern-AI-Secret': SECRET || '' },
  })
  if (!res.ok) throw new Error(`scraper/runs ${res.status}`)
  const j = (await res.json()) as { success: boolean; runs: ScraperRun[] }
  return j.runs
}

export async function getPendingImports(userId: string, runId?: string): Promise<PendingImport[]> {
  const q = runId ? `&run_id=${encodeURIComponent(runId)}` : ''
  const res = await fetch(
    `${BASE}/scraper/imports?user_id=${encodeURIComponent(userId)}${q}`,
    { headers: { 'X-Eastern-AI-Secret': SECRET || '' } },
  )
  if (!res.ok) throw new Error(`scraper/imports ${res.status}`)
  const j = (await res.json()) as { success: boolean; imports: PendingImport[] }
  return j.imports
}

export function decideImports(
  userId: string,
  action: 'approve' | 'reject',
  opts: { ids?: string[]; run_id?: string; scope?: 'ids' | 'all_pending' },
) {
  return post<{ success: boolean; processed: number }>(
    '/scraper/imports/decision',
    { user_id: userId, action, ...opts },
  )
}

export interface PairPhoneResponse {
  success: boolean
  code?: string
  expires_in_seconds?: number
  error?: string
}

export function pairWhatsAppByPhone(userId: string, phone: string) {
  return post<PairPhoneResponse>('/whapi/pair-phone', { user_id: userId, phone })
}
