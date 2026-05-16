import { Link, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Toggle } from '../ui/Toggle'
import { Logo } from './Logo'
import { ProfileMenu } from './ProfileMenu'
import type { Profile } from '../../types/profile.types'
import { useTrialStatus } from '../../hooks/useTrialStatus'
import { useSidebarCollapse } from '../../hooks/useSidebarCollapse'

interface SidebarProps {
  profile: Profile | null
  userId: string
  onHitlChange: (enabled: boolean) => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

const navItems = [
  {
    href: '/dashboard', label: 'Dashboard', exact: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    tour: 'sidebar-dashboard',
  },
  {
    href: '/dashboard/setup', label: 'WhatsApp Setup',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    tour: 'whatsapp-setup',
  },
  {
    href: '/dashboard/sales', label: 'Sales Stream',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
      </svg>
    ),
    tour: 'sales-stream',
  },
  {
    href: '/dashboard/logs', label: 'Agent Logs',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    tour: 'agent-logs',
  },
  {
    href: '/dashboard/orders', label: 'Orders',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    tour: 'orders',
  },
  {
    href: '/dashboard/catalogue', label: 'Catalogue',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14l-8 4m8-4v14m-8-10v10l8 4" />
      </svg>
    ),
    tour: 'catalogue',
  },
  {
    href: '/dashboard/catalogue/import', label: 'Import from web',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
      </svg>
    ),
  },
  {
    href: '/dashboard/finances', label: 'Finances',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.5l4.5-4.5 4 4 6-6m0 0V11m0-4H13" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18" />
      </svg>
    ),
    tour: 'finances',
  },
  {
    href: '/dashboard/settings', label: 'Settings',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    tour: 'sidebar-settings',
  },
  {
    href: '/dashboard/help', label: 'Help & Support',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    tour: 'sidebar-help',
  },
]

export function Sidebar({ profile, userId, onHitlChange, mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation()
  const { daysLeft, messagesUsed, messageLimit } = useTrialStatus(profile, userId)
  const { collapsed, toggle } = useSidebarCollapse()

  const trialUrgent = daysLeft <= 3
  const msgPct = Math.min(100, (messagesUsed / messageLimit) * 100)

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onMobileClose} />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-full flex flex-col bg-surface border-r border-border z-40 transition-[width,transform] duration-200',
          'md:translate-x-0 md:static md:z-auto',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Width: always 64 on mobile (full drawer), collapses to 16 on md+
          collapsed ? 'w-64 md:w-[72px]' : 'w-64',
        )}
      >
        {/* Vector logo + business name + collapse toggle */}
        <div className={cn(
          'flex items-center gap-3 px-5 border-b border-border min-h-[68px]',
          collapsed && 'md:px-2 md:justify-center',
        )}>
          <Logo variant="vector" size="md" className="flex-shrink-0" />
          <div className={cn('min-w-0 flex-1', collapsed && 'md:hidden')}>
            <p className="text-sm font-semibold text-text truncate">Vector</p>
            <p className="text-[11px] text-text-muted truncate">
              {profile?.plan === 'pro' ? 'Pro Plan' : 'Free Trial'}
            </p>
          </div>
          <button
            onClick={toggle}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-surface-2 flex-shrink-0"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <svg className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-none px-3 py-4 space-y-1">
          {navItems.map(item => {
            const active = item.exact
              ? location.pathname === item.href
              : location.pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                to={item.href}
                data-tour={item.tour}
                onClick={onMobileClose}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
                  collapsed ? 'md:justify-center md:px-0 px-3 py-2.5' : 'px-3 py-2.5',
                  active
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-muted hover:text-text hover:bg-surface-2',
                )}
              >
                {item.icon}
                <span className={cn(collapsed && 'md:hidden')}>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Trial card — hidden when collapsed on desktop */}
        {profile?.plan === 'trial' && (
          <div className={cn('px-4 py-3 border-t border-border space-y-3', collapsed && 'md:hidden')} data-tour="sidebar-trial">
            <div className={cn('rounded-lg p-3 text-xs', trialUrgent ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-surface-2 border border-border')}>
              <div className="flex items-center justify-between mb-1">
                <span className={trialUrgent ? 'text-amber-500 font-medium' : 'text-text-muted'}>Free Trial</span>
                <span className={cn('font-semibold', trialUrgent ? 'text-amber-500' : 'text-text')}>{daysLeft}d left</span>
              </div>
              <div className="flex items-center justify-between text-text-muted mb-1.5">
                <span>Messages</span>
                <span className={messagesUsed >= messageLimit * 0.8 ? 'text-amber-500' : ''}>{messagesUsed}/{messageLimit}</span>
              </div>
              <div className="h-1 rounded-full bg-border overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', msgPct >= 80 ? 'bg-amber-500' : 'bg-accent')}
                  style={{ width: `${msgPct}%` }}
                />
              </div>
            </div>
            <Link
              to="/dashboard/payment"
              className="flex items-center justify-center gap-1.5 w-full h-9 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
              </svg>
              Upgrade to Pro
            </Link>
          </div>
        )}

        {/* HITL toggle — hidden when collapsed on desktop */}
        <div className={cn('px-4 py-3 border-t border-border', collapsed && 'md:hidden')}>
          <Toggle
            checked={profile?.human_in_loop ?? false}
            onChange={onHitlChange}
            label="Manual mode"
            description="Pause Vector — reply to customers yourself"
          />
        </div>

        {/* Profile menu — bottom-left, Claude style */}
        <div className="px-2 py-2 border-t border-border">
          <ProfileMenu profile={profile} collapsed={collapsed} />
        </div>
      </aside>
    </>
  )
}
