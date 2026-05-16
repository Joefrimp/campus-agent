import { useEffect, useRef } from 'react'

/**
 * Adds `reveal-in` class once the element enters the viewport.
 * Pair with `reveal-init` baseline. Pure IntersectionObserver — no deps.
 */
export function useScrollReveal<T extends HTMLElement>(
  options: { delayMs?: number; threshold?: number } = {},
) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement
            if (options.delayMs) target.style.animationDelay = `${options.delayMs}ms`
            target.classList.add('reveal-in')
            obs.unobserve(target)
          }
        })
      },
      { threshold: options.threshold ?? 0.15, rootMargin: '0px 0px -40px 0px' },
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [options.delayMs, options.threshold])

  return ref
}
