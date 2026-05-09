import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean
  hoverable?: boolean
  /** Use 'flat' to drop the shadow (e.g. inside other cards). */
  variant?: 'default' | 'flat' | 'elevated'
}

export function Card({ className, selected, hoverable, variant = 'default', children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-surface border transition-all duration-150',
        variant === 'default' && 'shadow-card',
        variant === 'elevated' && 'shadow-elev',
        selected ? 'border-accent ring-2 ring-accent/20' : 'border-border',
        hoverable && 'cursor-pointer hover:border-accent/40 hover:bg-surface-2 hover:-translate-y-px',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
