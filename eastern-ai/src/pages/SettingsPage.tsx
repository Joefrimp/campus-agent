import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { BrandVoiceSelector } from '../components/brand/BrandVoiceSelector'
import { StyleGuideEditor } from '../components/settings/StyleGuideEditor'
import { ScheduleEditor } from '../components/settings/ScheduleEditor'
import { PaymentDetailsEditor } from '../components/settings/PaymentDetailsEditor'
import { IntegrationsPanel } from '../components/settings/IntegrationsPanel'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabase'
import { useState } from 'react'
import type { BrandVoice } from '../types/profile.types'

export function SettingsPage() {
  const { user } = useAuth()
  const { profile, updateProfile } = useProfile(user?.id)
  const [saving, setSaving] = useState(false)
  const [businessName, setBusinessName] = useState(profile?.business_name ?? '')

  const handleSaveName = async () => {
    if (!businessName.trim()) return
    setSaving(true)
    await updateProfile({ business_name: businessName.trim() })
    setSaving(false)
  }

  const handleVoiceUpdate = async (voice: BrandVoice) => {
    await updateProfile({ brand_voice: voice })
  }

  const handleSignOut = () => supabase.auth.signOut()

  if (!profile) return null

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-text">Settings</h1>
        <p className="text-sm text-text-muted mt-1">Manage your account and AI agent configuration.</p>
      </div>

      {/* Account */}
      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-text">Account</h2>
        <Input
          label="Business Name"
          value={businessName}
          onChange={e => setBusinessName(e.target.value)}
          placeholder="Your Business Name"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name" value={profile.first_name} disabled />
          <Input label="Last Name" value={profile.last_name} disabled />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSaveName} loading={saving} size="sm">Save Changes</Button>
        </div>
      </Card>

      {/* Brand Voice */}
      <div>
        <h2 className="font-semibold text-text mb-1">Brand Voice</h2>
        <p className="text-sm text-text-muted mb-4">Choose how your AI agent communicates with leads.</p>
        <BrandVoiceSelector
          currentVoice={profile.brand_voice}
          userId={user?.id ?? ''}
          onUpdate={handleVoiceUpdate}
        />
      </div>

      {/* Schedule */}
      <ScheduleEditor userId={user?.id ?? ''} />

      {/* Payment details (MoMo) */}
      <PaymentDetailsEditor userId={user?.id ?? ''} />

      {/* Personal Style Guide (Pro) */}
      <StyleGuideEditor userId={user?.id ?? ''} isPro={profile.plan === 'pro'} />

      {/* Pro tool connections */}
      <IntegrationsPanel userId={user?.id ?? ''} isPro={profile.plan === 'pro'} />

      {/* Danger zone */}
      <Card className="p-5 border-red-500/15">
        <h2 className="font-semibold text-text mb-3">Account Actions</h2>
        <Button variant="danger" size="sm" onClick={handleSignOut}>Sign Out</Button>
      </Card>
    </div>
  )
}
