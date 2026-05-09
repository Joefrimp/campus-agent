/**
 * W3 Business Onboarding — called by React app after signup.
 * For v1 (single tenant), this just patches the existing profile +
 * sends the welcome message. Channel creation via Whapi Partner API
 * is gated until WHAPI_PARTNER_KEY is set.
 */
import type { Context } from 'hono';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { models } from '../lib/gemini.js';
import { generateText } from 'ai';
import { audit, deadLetter } from '../lib/audit.js';
import { logger } from '../lib/logger.js';

const Schema = z.object({
  user_id: z.string().uuid(),
  business_name: z.string().min(1),
  owner_phone: z.string().min(8),
  brand_voice: z.enum(['professional_executive', 'hype_man', 'problem_solver']),
  business_type: z.string().optional(),
  delivery_zones: z.array(z.string()).optional(),
});

export async function handleOnboarding(c: Context): Promise<Response> {
  const body = await c.req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: 'invalid payload', issues: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  try {
    await supabase
      .from('profiles')
      .update({
        business_name: input.business_name,
        phone: input.owner_phone,
        brand_voice: input.brand_voice,
      })
      .eq('id', input.user_id);

    if (input.delivery_zones && input.delivery_zones.length > 0) {
      await supabase
        .from('business_settings')
        .update({ delivery_zones: input.delivery_zones })
        .eq('user_id', input.user_id);
    }

    // Generate welcome message
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, business_name')
      .eq('id', input.user_id)
      .single();
    const firstName = profile?.first_name ?? 'there';

    const welcome = await generateWelcome(firstName, input.business_name);

    await send({
      user_id: input.user_id,
      to: input.owner_phone,
      message: welcome,
      type: 'text',
      force: true,
      idempotency_key: `welcome-${input.user_id}`,
    });

    await audit({ user_id: input.user_id, workflow: 'W3-onboarding', input, output: { welcome } });

    return c.json({ success: true, business_id: input.user_id });
  } catch (err) {
    logger.error({ err }, 'onboarding failed');
    await deadLetter({ source: 'webhook', payload: input, error: (err as Error).message });
    return c.json({ success: false, error: (err as Error).message }, 200);
  }
}

async function generateWelcome(firstName: string, businessName: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: models.agent,
      system:
        'Generate a 3-sentence WhatsApp welcome to a new Eastern AI customer who just signed up. Tell them their 1st Employee is now active. Tell them to upload their menu / price list in the dashboard so quotes are accurate. End with a single emoji. Tone: warm, confident, founder-to-founder. Max 60 words. Plain text only.',
      prompt: `Owner first name: ${firstName}\nBusiness name: ${businessName}`,
      temperature: 0.7,
      maxTokens: 120,
    });
    return text.trim();
  } catch {
    return `${firstName}, welcome to Eastern AI! Your 1st Employee for "${businessName}" is now live and ready to help your customers 24/7. Head over to the dashboard and upload your menu/price list so I can quote accurately for every order 🚀`;
  }
}
