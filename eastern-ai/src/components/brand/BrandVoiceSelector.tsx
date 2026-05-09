import { useState } from 'react'
import { Card } from '../ui/Card'
import { updateBrandVoice } from '../../lib/webhooks'
import type { BrandVoice } from '../../types/profile.types'
import { cn } from '../../lib/utils'

interface VoiceOption {
  key: BrandVoice
  title: string
  tagline: string
  description: string
  emoji: string
}

const VOICES: VoiceOption[] = [
  {
    key: 'professional_executive',
    title: 'Professional Executive',
    tagline: 'Polished & authoritative',
    description: 'Formal, concise responses that build credibility and trust with corporate clients.',
    emoji: '💼',
  },
  {
    key: 'hype_man',
    title: 'Hype-Man',
    tagline: 'Energetic & persuasive',
    description: 'High-energy, enthusiastic responses that create excitement and urgency around your offers.',
    emoji: '🔥',
  },
  {
    key: 'problem_solver',
    title: 'Problem Solver',
    tagline: 'Empathetic & solution-focused',
    description: 'Listens carefully, identifies pain points, and guides leads toward the perfect solution.',
    emoji: '🎯',
  },
]

interface BrandVoiceSelectorProps {
  currentVoice: BrandVoice
  userId: string
  onUpdate: (voice: BrandVoice) => void
}

export function BrandVoiceSelector({ currentVoice, userId, onUpdate }: BrandVoiceSelectorProps) {
  const [saving, setSaving] = useState<BrandVoice | null>(null)

  const handleSelect = async (voice: BrandVoice) => {
    if (voice === currentVoice || saving) return
    setSaving(voice)
    onUpdate(voice)
    try {
      await updateBrandVoice(userId, voice)
    } catch {
      // Best-effort webhook; profile already updated via onUpdate → parent updates DB
    }
    setSaving(null)
  }

  return (
    <div className="space-y-3" data-tour="brand-voice">
      {VOICES.map(v => {
        const selected = v.key === currentVoice
        const loading = saving === v.key
        return (
          <Card
            key={v.key}
            selected={selected}
            hoverable
            onClick={() => handleSelect(v.key)}
            className={cn('p-4 relative', loading && 'opacity-70 cursor-wait')}
          >
            <div className="flex items-start gap-4">
              <div className={cn(
                'h-12 w-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 transition-colors',
                selected ? 'bg-accent/15' : 'bg-white/5'
              )}>
                {v.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-text text-sm">{v.title}</p>
                  {selected && (
                    <span className="text-xs text-accent font-medium bg-accent/10 px-2 py-0.5 rounded-full">Active</span>
                  )}
                </div>
                <p className="text-xs text-accent mb-1">{v.tagline}</p>
                <p className="text-xs text-text-muted leading-relaxed">{v.description}</p>
              </div>
              {selected && (
                <div className="flex-shrink-0 h-5 w-5 rounded-full bg-accent flex items-center justify-center">
                  <svg className="h-3 w-3 text-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
