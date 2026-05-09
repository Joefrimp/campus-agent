import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AnimatedBackground } from './AnimatedBackground'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useProfile } from '../../hooks/useProfile'
import { useAuth } from '../../hooks/useAuth'
import { setHumanInLoop } from '../../lib/webhooks'

export function AppShell() {
  const { user } = useAuth()
  const { profile, updateProfile } = useProfile(user?.id)
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleHitlChange = async (enabled: boolean) => {
    if (!user) return
    await updateProfile({ human_in_loop: enabled })
    try {
      await setHumanInLoop(user.id, enabled)
    } catch {
      // n8n call is best-effort; DB is source of truth
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col md:flex-row">
      <AnimatedBackground />

      {/* Mobile top bar */}
      <TopBar profile={profile} onMenuToggle={() => setMobileOpen(o => !o)} />

      {/* Sidebar */}
      <Sidebar
        profile={profile}
        userId={user?.id ?? ''}
        onHitlChange={handleHitlChange}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main content */}
      <main className="relative z-10 flex-1 overflow-y-auto min-h-screen md:min-h-0">
        <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-8 pb-24 md:pb-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
