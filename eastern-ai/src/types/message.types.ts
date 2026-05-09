export interface MessageLog {
  id: string
  user_id: string
  direction: 'inbound' | 'outbound'
  contact_phone: string | null
  content: string | null
  ai_generated: boolean
  created_at: string
}

export interface AgentLog {
  id: string
  user_id: string
  contact_phone: string | null
  inbound_message: string | null
  ai_response: string | null
  brand_voice: string | null
  was_overridden: boolean
  created_at: string
}

export type LeadStatus = 'new' | 'active' | 'closed'

export interface SalesLead {
  id: string
  user_id: string
  contact_phone: string
  contact_name: string | null
  last_message: string | null
  status: LeadStatus
  created_at: string
  updated_at: string
}
