import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'
import { useTrialStatus } from '../../hooks/useTrialStatus'
import { FullPageSpinner } from '../ui/Spinner'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, loading: authLoading } = useAuth()
  const { profile, loading: profileLoading } = useProfile(session?.user?.id)
  const { isGated } = useTrialStatus(profile, session?.user?.id)

  if (authLoading || (session && profileLoading)) {
    return <FullPageSpinner />
  }

  if (!session) {
    return <Navigate to="/signin" replace />
  }

  // Profile not yet completed → go to onboarding
  if (profile && !profile.first_name) {
    return <Navigate to="/onboarding" replace />
  }

  // Verified check — but only after profile loads
  if (profile && !profile.is_verified) {
    return <Navigate to="/verify" replace />
  }

  // Trial gate
  if (isGated) {
    return <Navigate to="/dashboard/payment" replace />
  }

  return <>{children}</>
}

// Lighter gate — only needs auth (for onboarding/verify pages)
export function AuthRoute({ children }: ProtectedRouteProps) {
  const { session, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/signin" replace />
  return <>{children}</>
}
