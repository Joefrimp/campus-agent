export type Plan = 'trial' | 'pro'

export type BrandVoice = 'professional_executive' | 'hype_man' | 'problem_solver'

export interface Profile {
  id: string
  first_name: string
  last_name: string
  business_name: string
  phone: string | null
  is_verified: boolean
  trial_expires_at: string
  plan: Plan
  brand_voice: BrandVoice
  human_in_loop: boolean
  onboarding_done: boolean
  created_at: string
  updated_at: string
}
