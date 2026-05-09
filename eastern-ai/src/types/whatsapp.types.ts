export type ChannelStatus = 'pending' | 'initializing' | 'authorized' | 'disconnected'

export interface WhapiChannel {
  id: string
  user_id: string
  whapi_channel_id: string | null
  status: ChannelStatus
  qr_code_url: string | null
  created_at: string
  updated_at: string
}
