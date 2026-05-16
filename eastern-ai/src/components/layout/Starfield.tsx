import { useMemo } from 'react'

/**
 * Twinkling-star background. Lightweight: just CSS-animated divs.
 * No canvas, no deps, ~80 stars total.
 */
export function Starfield({ count = 80 }: { count?: number }) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() * 2 + 0.5,
        delay: Math.random() * 3,
        duration: Math.random() * 3 + 2,
      })),
    [count],
  )

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map(s => (
        <span
          key={s.id}
          className="absolute rounded-full bg-white animate-twinkle"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
            boxShadow: '0 0 4px rgba(255,255,255,0.4)',
          }}
        />
      ))}
    </div>
  )
}
