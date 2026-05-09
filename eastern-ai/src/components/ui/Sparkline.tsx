/**
 * Tiny inline SVG sparkline. No chart library dep.
 * Renders a smooth area-under-line at the size you give it.
 */
import { useMemo } from 'react'
import { cn } from '../../lib/utils'

interface Props {
  data: number[]
  width?: number
  height?: number
  className?: string
  /** css variable or color string. Defaults to accent. */
  color?: string
  /** Show a subtle gradient fill under the line. */
  filled?: boolean
}

export function Sparkline({ data, width = 100, height = 32, className, color = 'var(--color-accent)', filled = true }: Props) {
  const { linePath, fillPath } = useMemo(() => {
    if (data.length === 0) return { linePath: '', fillPath: '' }
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const stepX = data.length > 1 ? width / (data.length - 1) : width
    const points = data.map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / range) * (height - 2) - 1
      return [x, y] as const
    })
    const line = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ')
    const fill =
      points.length === 0
        ? ''
        : `${line} L${width},${height} L0,${height} Z`
    return { linePath: line, fillPath: fill }
  }, [data, width, height])

  if (!linePath) return <div className={cn('inline-block', className)} style={{ width, height }} />

  const gradId = useMemo(() => `spark-grad-${Math.random().toString(36).slice(2, 8)}`, [])

  return (
    <svg
      className={cn('inline-block', className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {filled && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.30} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {filled && <path d={fillPath} fill={`url(#${gradId})`} />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
