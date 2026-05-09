import { useState, useEffect, useCallback } from 'react'

const COOLDOWN_KEY = 'eastern_ai_otp_last_sent'
const COOLDOWN_SECONDS = 60

export function useOtpCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    const stored = localStorage.getItem(COOLDOWN_KEY)
    if (!stored) return
    const elapsed = Math.floor((Date.now() - parseInt(stored, 10)) / 1000)
    const remaining = COOLDOWN_SECONDS - elapsed
    if (remaining > 0) setSecondsLeft(remaining)
  }, [])

  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { clearInterval(id); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [secondsLeft])

  const startCooldown = useCallback(() => {
    localStorage.setItem(COOLDOWN_KEY, Date.now().toString())
    setSecondsLeft(COOLDOWN_SECONDS)
  }, [])

  return { secondsLeft, canResend: secondsLeft === 0, startCooldown }
}
