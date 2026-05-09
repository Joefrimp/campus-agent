import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { SetupTab } from '../components/whatsapp/SetupTab'

export function SetupPage() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text">WhatsApp Setup</h1>
        <p className="text-sm text-text-muted mt-1">Connect your WhatsApp and activate your AI sales agent.</p>
      </div>
      <SetupTab
        userId={user?.id ?? ''}
        brandVoiceProvisioned={!!profile?.brand_voice}
      />
    </div>
  )
}
