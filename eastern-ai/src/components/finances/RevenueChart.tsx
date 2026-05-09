import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import type { DailyPoint } from '../../hooks/useFinances'

interface Props {
  data: DailyPoint[]
}

export function RevenueChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-[260px] flex items-center justify-center text-sm text-text-muted">
        No activity yet — orders and expenses will plot here as they come in.
      </div>
    )
  }

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            fontSize={11}
            tickFormatter={(d) => d.slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis stroke="#6b7280" fontSize={11} />
          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #1f2937',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: '#fff' }}
            formatter={(value: number, name: string) => [
              `GHS ${value.toFixed(2).replace(/\.00$/, '')}`,
              name === 'revenue' ? 'Revenue' : 'Expenses',
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="revenue" stroke="#3B82F6" fill="url(#rev)" strokeWidth={2} />
          <Area type="monotone" dataKey="expenses" stroke="#EF4444" fill="url(#exp)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
