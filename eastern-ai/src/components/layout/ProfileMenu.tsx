import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { cn, getInitials } from '../../lib/utils'
import type { Profile } from '../../types/profile.types'

interface Props {
  profile: Profile | null
  collapsed?: boolean
}

export function ProfileMenu({ profile, collapsed }: Props) {
  const { user } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Close on click outside / escape
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ??
    (user?.user_metadata?.picture as string | undefined) ??
    null
  const initials = profile ? getInitials(profile.first_name || 'E', profile.last_name || 'A') : 'EA'
  const displayName = profile
    ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || (user?.email ?? 'Account')
    : 'Account'
  const email = user?.email ?? ''

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-surface-2 transition-colors',
          collapsed && 'md:justify-center md:px-1',
        )}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-accent/30 flex-shrink-0" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 shadow-sm shadow-accent/40">
            {initials}
          </div>
        )}
        <div className={cn('min-w-0 flex-1 text-left', collapsed && 'md:hidden')}>
          <p className="text-sm font-medium text-text truncate">{displayName}</p>
          <p className="text-[11px] text-text-muted truncate">{email}</p>
        </div>
        {!collapsed && (
          <svg className={cn('h-4 w-4 text-text-muted transition-transform', open && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        )}
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-surface border border-border shadow-elev py-1.5 z-50 overflow-hidden"
          role="menu"
        >
          {/* Header */}
          <div className="px-3 pt-2 pb-2 border-b border-border">
            <p className="text-xs text-text-muted">Signed in as</p>
            <p className="text-sm font-medium text-text truncate">{email}</p>
          </div>

          <MenuLink to="/dashboard/settings" onClick={() => setOpen(false)}>
            <Icon path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            Settings
          </MenuLink>

          <MenuLink to="/dashboard/help" onClick={() => setOpen(false)}>
            <Icon path="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01 M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            Help & Support
          </MenuLink>

          {profile?.plan !== 'pro' && (
            <MenuLink to="/dashboard/payment" onClick={() => setOpen(false)} highlight>
              <Icon path="M5 3l14 9-14 9V3z" />
              Upgrade to Pro
            </MenuLink>
          )}

          {/* Theme switcher inline */}
          <button
            type="button"
            onClick={() => { toggleTheme(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text hover:bg-surface-2 transition-colors"
          >
            {theme === 'dark' ? (
              <Icon path="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            ) : (
              <Icon path="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364l-1.414 1.414M6.05 17.95l-1.414 1.414m0-13.728l1.414 1.414M17.95 17.95l1.414 1.414M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            )}
            {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          </button>

          <div className="h-px bg-border my-1" />

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger hover:bg-danger/10 transition-colors"
          >
            <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function MenuLink({ to, onClick, children, highlight }: { to: string; onClick: () => void; children: React.ReactNode; highlight?: boolean }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
        highlight
          ? 'text-amber-500 hover:bg-amber-500/10 font-medium'
          : 'text-text hover:bg-surface-2',
      )}
    >
      {children}
    </Link>
  )
}

function Icon({ path }: { path: string }) {
  return (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d={path} />
    </svg>
  )
}
