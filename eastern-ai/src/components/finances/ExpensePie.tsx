import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { CategorySlice } from '../../hooks/useFinances'

interface Props {
  data: CategorySlice[]
}

const COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#A855F7']

export function ExpensePie({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-[260px] flex items-center justify-center text-sm text-text-muted text-center px-6">
        No expenses logged yet.<br />
        Use <code className="px-1 py-0.5 rounded bg-white/10 text-xs">EXPENSE 50 supplier</code> via WhatsApp.
      </div>
    )
  }

  const total = data.reduce((s, d) => s + d.amount, 0)

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            cx="40%"
            cy="50%"
            innerRadius={50}
            outerRadius={85}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #1f2937',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => `GHS ${value.toFixed(2).replace(/\.00$/, '')}`}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconSize={10}
            wrapperStyle={{ fontSize: 12, color: '#9ca3af' }}
            formatter={(value) => {
              const slice = data.find(d => d.category === value)
              if (!slice) return value
              const pct = total > 0 ? Math.round((slice.amount / total) * 100) : 0
              return `${value} ${pct}%`
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
