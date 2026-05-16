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

export interface PairPhoneResponse {
  success: boolean
  code?: string
  expires_in_seconds?: number
  error?: string
}

export function pairWhatsAppByPhone(userId: string, phone: string) {
  return post<PairPhoneResponse>('/whapi/pair-phone', { user_id: userId, phone })
}
