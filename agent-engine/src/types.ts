/**
 * Shared types — narrow projections of Supabase rows.
 * These mirror the columns in supabase/migrations/002_agent_engine.sql.
 */

export type BrandVoice = 'professional_executive' | 'hype_man' | 'problem_solver';
export type OrderState =
  | 'inquiry'
  | 'quoted'
  | 'confirmed'
  | 'paid'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'reviewed'
  | 'cancelled';
export type Lang = 'en' | 'twi' | 'pidgin';
export type Intent =
  | 'greeting'
  | 'smalltalk'
  | 'inquiry'
  | 'order_intent'
  | 'complaint'
  | 'refund_request'
  | 'delivery_status'
  | 'review'
  | 'spam'
  | 'forwarded_blast'
  | 'unknown';
export type ChannelStatus = 'healthy' | 'warning' | 'paused' | 'disconnected';

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  phone: string | null;
  brand_voice: BrandVoice;
  human_in_loop: boolean;
  plan: 'trial' | 'pro';
  message_count?: number;
}

export interface BusinessSettings {
  user_id: string;
  business_hours: Record<string, string>;
  delivery_zones: string[];
  momo_number: string | null;
  momo_name: string | null;
  payment_methods: string[];
  status_posting: boolean;
  group_marketing: boolean;
  followups_enabled: boolean;
  digest_enabled: boolean;
  timezone: string;
  /** Owner-authored style guide appended to the brain prompt. Pro plan only. */
  tenant_style_guide?: string | null;
  /** Auto-extracted style summary (v2). */
  learned_style_summary?: string | null;
  /** 'product' | 'service' | 'both' — drives per-tenant tool catalogue. */
  business_kind?: 'product' | 'service' | 'both' | null;
  /** JSON [{from,to,label,...}] — daily/holiday blocks. */
  schedule_blocks?: unknown[];
}

export interface Customer {
  id: string;
  user_id: string;
  phone: string;
  display_name: string | null;
  preferred_lang: Lang;
  hostel: string | null;
  lifetime_value: number;
  total_orders: number;
  is_blocked: boolean;
  last_contact_at: string | null;
  /** When we last sent a smalltalk soft-opener to this customer. Null = never. */
  soft_reply_sent_at: string | null;
}

export interface ChannelHealth {
  user_id: string;
  status: ChannelStatus;
  paused_until: string | null;
  consecutive_errors: number;
  panic_paused: boolean;
}

export interface ClassifierOutput {
  intent: Intent;
  language: Lang;
  requires_owner: boolean;
  confidence: number;
  sentiment: 'positive' | 'neutral' | 'negative' | 'abusive';
}

/** Inbound payload Whapi sends to /whapi/inbound. Exact shape per Whapi docs. */
export interface WhapiInbound {
  messages?: Array<{
    id: string;
    from: string;
    from_name?: string;
    /** True when the OWNER sent this from their own phone (we observe, don't reply). */
    from_me?: boolean;
    /** When from_me=true, who they sent it TO. */
    chat_id?: string;
    type: string;
    text?: { body: string };
    /** Voice note (push-to-talk). */
    voice?: { id: string; mime_type?: string; link?: string };
    /** Audio file (uploaded). */
    audio?: { id: string; mime_type?: string; link?: string };
    /** Image (photo / payment screenshot). */
    image?: { id: string; mime_type?: string; link?: string; caption?: string };
    timestamp: number;
  }>;
  channel_id?: string;
  event?: { type: string };
}
