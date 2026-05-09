import { useState, useEffect } from 'react'
import { Joyride, STATUS, type EventData } from 'react-joyride'

const TOUR_DONE_KEY = 'eastern_ai_tour_done'

const steps = [
  {
    target: '[data-tour="sidebar-dashboard"]',
    content: 'This is your Dashboard — your command center for the AI agent.',
    disableBeacon: true,
  },
  {
    target: '[data-tour="whatsapp-setup"]',
    content: 'Go here to connect your WhatsApp and generate your QR code.',
  },
  {
    target: '[data-tour="sales-stream"]',
    content: 'Your Sales Stream shows all incoming leads and conversations in real-time.',
  },
  {
    target: '[data-tour="agent-logs"]',
    content: 'Agent Logs records every AI response — review and audit anytime.',
  },
  {
    target: '[data-tour="sidebar-trial"]',
    content: 'Track your trial days and message usage here. Upgrade when ready.',
    placement: 'right' as const,
  },
]

export function OnboardingTutorial() {
  const [run, setRun] = useState(false)

  useEffect(() => {
    const done = localStorage.getItem(TOUR_DONE_KEY)
    if (!done) {
      const t = setTimeout(() => setRun(true), 800)
      return () => clearTimeout(t)
    }
  }, [])

  const handleEvent = (data: EventData) => {
    const { status } = data
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      localStorage.setItem(TOUR_DONE_KEY, '1')
      setRun(false)
    }
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      options={{
        primaryColor: '#6366F1',
        overlayColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 9999,
        backgroundColor: '#111111',
        textColor: '#9CA3AF',
        showProgress: true,
        buttons: ['back', 'close', 'primary', 'skip'],
      }}
      styles={{
        tooltip: {
          borderRadius: 12,
          border: '1px solid #1F1F1F',
        },
        buttonPrimary: {
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 13,
        },
        buttonBack: {
          color: '#9CA3AF',
          fontSize: 13,
        },
        buttonSkip: {
          color: '#6B7280',
          fontSize: 12,
        },
        tooltipTitle: {
          color: '#F9FAFB',
        },
      }}
    />
  )
}
