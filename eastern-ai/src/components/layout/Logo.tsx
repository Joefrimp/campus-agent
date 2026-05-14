import { useState } from 'react'
import { cn } from '../../lib/utils'

/**
 * Logo lookup order for each variant — tries SVG first (sharpest), falls
 * back to PNG, then to a coloured initials badge:
 *   vector       → /vector-logo.svg → /vector-logo.png → "V" badge
 *   eastern-ai   → /eastern-ai-logo.svg → /eastern-ai-logo.png → "EA" badge
 *
 * To use your custom artwork: save EITHER format under eastern-ai/public/
 *   vector-logo.svg     or  vector-logo.png
 *   eastern-ai-logo.svg or  eastern-ai-logo.png
 *   favicon.svg         or  favicon.png   (referenced from index.html)
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
  vector: {
    sources: ['/vector-logo.svg', '/vector-logo.png'],
    fallback: 'V',
    alt: 'Vector',
    textLabel: 'Vector',
  },
  'eastern-ai': {
    sources: ['/eastern-ai-logo.svg', '/eastern-ai-logo.png'],
    fallback: 'EA',
    alt: 'Eastern AI',
    textLabel: 'Eastern AI',
  },
} as const

export function Logo({ size = 'sm', variant = 'vector', className, showText, textClassName }: Props) {
  const v = VARIANTS[variant]
  const [srcIdx, setSrcIdx] = useState(0)
  const [allFailed, setAllFailed] = useState(false)

  const handleError = () => {
    if (srcIdx + 1 < v.sources.length) {
      setSrcIdx(srcIdx + 1)        // try next format (.svg → .png)
    } else {
      setAllFailed(true)            // both missing → show initials
    }
  }

  return (
    <div className={cn('inline-flex items-center gap-2.5', className)}>
      {allFailed ? (
        <span
          className={cn(
            SIZES[size],
            'rounded-xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm shadow-accent/40',
            size === 'sm' ? 'text-sm' : size === 'md' ? 'text-lg' : 'text-3xl',
          )}
        >
          {v.fallback}
        </span>
      ) : (
        <img
          src={v.sources[srcIdx]}
          alt={v.alt}
          onError={handleError}
          className={cn(SIZES[size], 'rounded-xl object-contain flex-shrink-0')}
        />
      )}
      {showText && (
        <span className={cn('font-bold text-text', textClassName)}>{v.textLabel}</span>
      )}
    </div>
  )
}
