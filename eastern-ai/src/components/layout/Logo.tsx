import { cn } from '../../lib/utils'

/**
 * Logo lookup order for each variant:
 *   vector       → /vector-logo.png      → fallback "V" badge
 *   eastern-ai   → /eastern-ai-logo.png  → fallback "EA" badge
 *
 * To use your custom artwork:
 *   1. Save the Vector logo as `eastern-ai/public/vector-logo.png` (or .svg)
 *   2. Save the Eastern AI logo as `eastern-ai/public/eastern-ai-logo.png` (or .svg)
 *   3. Replace `eastern-ai/public/favicon.svg` with the Vector mark too
 */

interface Props {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'vector' | 'eastern-ai'
  className?: string
  showText?: boolean
  textClassName?: string
}

const SIZES: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-10 w-10',
  md: 'h-12 w-12',
  lg: 'h-24 w-24',
}

const VARIANTS = {
  vector:       { src: '/vector-logo.png',     fallback: 'V',  alt: 'Vector', textLabel: 'Vector' },
  'eastern-ai': { src: '/eastern-ai-logo.png', fallback: 'EA', alt: 'Eastern AI', textLabel: 'Eastern AI' },
} as const

export function Logo({ size = 'sm', variant = 'vector', className, showText, textClassName }: Props) {
  const v = VARIANTS[variant]
  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      <picture className={cn('inline-block', SIZES[size])}>
        <img
          src={v.src}
          alt={v.alt}
          className={cn(SIZES[size], 'rounded-xl object-contain')}
          onError={(e) => {
            const img = e.currentTarget
            img.style.display = 'none'
            const fb = img.nextElementSibling as HTMLElement | null
            if (fb) fb.style.display = 'flex'
          }}
        />
        <span
          className={cn(
            SIZES[size],
            'rounded-xl bg-gradient-to-br from-accent to-accent-hover items-center justify-center text-white font-bold flex-shrink-0 shadow-sm shadow-accent/40',
            size === 'sm' ? 'text-sm' : size === 'md' ? 'text-lg' : 'text-3xl',
          )}
          style={{ display: 'none' }}
        >
          {v.fallback}
        </span>
      </picture>
      {showText && (
        <span className={cn('font-bold text-text', textClassName)}>{v.textLabel}</span>
      )}
    </div>
  )
}
