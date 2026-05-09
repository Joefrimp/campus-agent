import { Link, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { ThemeToggle } from './ThemeToggle'
import type { Profile } from '../../types/profile.types'

interface TopBarProps {
  profile: Profile | null
  onMenuToggle: () => void
}

const navItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Setup', href: '/dashboard/setup' },
  { label: 'Sales', href: '/dashboard/sales' },
  { label: 'Logs', href: '/dashboard/logs' },
  { label: 'Settings', href: '/dashboard/settings' },
]

export function TopBar({ profile, onMenuToggle }: TopBarProps) {
  const location = useLocation()

  return (
    <header className="sticky top-0 z-30 glass border-b border-border md:hidden">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuToggle}
            className="text-text-muted hover:text-text p-1.5 -ml-1.5 rounded-lg"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-text truncate max-w-[160px]">
            {profile?.business_name || 'Eastern AI'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
        </div>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="fixed bottom-0 left-0 right-0 glass border-t border-border z-30 md:hidden">
        <div className="flex">
          {navItems.map(item => {
            const active = location.pathname === item.href || (item.href !== '/dashboard' && location.pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center h-16 text-[10px] font-medium gap-1 transition-colors',
                  active ? 'text-accent' : 'text-text-muted hover:text-text'
                )}
              >
                <NavIcon href={item.href} active={active} />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </header>
  )
}

function NavIcon({ href, active }: { href: string; active: boolean }) {
  const cls = cn('h-5 w-5', active ? 'text-accent' : 'text-text-muted')
  if (href === '/dashboard') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
  if (href === '/dashboard/setup') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  )
  if (href === '/dashboard/sales') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
    </svg>
  )
  if (href === '/dashboard/logs') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
