import { useAuth } from '../hooks/useAuth'
import { AgentLogsView } from '../components/logs/AgentLogsView'

export function AgentLogsPage() {
  const { user } = useAuth()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text">Agent Logs</h1>
        <p className="text-sm text-text-muted mt-1">Every AI response your agent has sent, in real-time.</p>
      </div>
      <AgentLogsView userId={user?.id ?? ''} />
    </div>
  )
}
