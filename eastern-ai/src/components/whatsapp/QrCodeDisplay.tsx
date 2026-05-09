import { Spinner } from '../ui/Spinner'
import type { ChannelStatus } from '../../types/whatsapp.types'

interface QrCodeDisplayProps {
  qrUrl: string | null
  status: ChannelStatus
}

export function QrCodeDisplay({ qrUrl, status }: QrCodeDisplayProps) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  if (status === 'authorized') {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm text-green-400 font-medium">WhatsApp Connected</p>
      </div>
    )
  }

  if (status === 'initializing' && qrUrl) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="p-3 bg-white rounded-xl shadow-lg">
          <img
            src={qrUrl}
            alt="WhatsApp QR Code"
            className="h-48 w-48 object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
        {isMobile && (
          <p className="text-xs text-amber-400 text-center max-w-xs">
            Open WhatsApp on another device and scan this code
          </p>
        )}
        {!isMobile && (
          <p className="text-xs text-text-muted text-center">
            Open WhatsApp → Linked Devices → Link a Device
          </p>
        )}
      </div>
    )
  }

  if (status === 'initializing' && !qrUrl) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Spinner size="lg" />
        <p className="text-sm text-text-muted">Generating QR code…</p>
      </div>
    )
  }

  return null
}
