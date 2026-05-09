import { useAuth } from '../hooks/useAuth'
import { SalesStream } from '../components/sales/SalesStream'

export function SalesPage() {
  const { user } = useAuth()

  return (
    <div>
      <div className="mb-6" data-tour="sales-stream">
        <h1 className="text-2xl font-bold text-text">Sales Stream</h1>
        <p className="text-sm text-text-muted mt-1">Incoming leads and conversations — updated in real-time.</p>
      </div>
      <SalesStream userId={user?.id ?? ''} />
    </div>
  )
}
