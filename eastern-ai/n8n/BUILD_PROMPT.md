# n8n Workflow Build Prompt — Eastern AI Backend

Paste the entire prompt below into your n8n AI workflow builder (or use it as a manual build spec).

---

## SYSTEM ROLE
You are an n8n workflow architect. Build a multi-tenant WhatsApp AI automation backend for "Eastern AI". The frontend is a React/Supabase SPA that calls your webhooks. You will build **7 separate workflows**: 6 outbound webhooks called by the frontend, and 1 inbound webhook called by Whapi.cloud whenever a WhatsApp message or status update arrives.

## ARCHITECTURE

```
[React frontend] ──HTTP──> [n8n webhooks] ──> [Supabase | Whapi.cloud | Twilio | Paystack | OpenAI]
                                                                ↑
[WhatsApp user] ──> [Whapi.cloud] ──webhook──> [n8n inbound] ────┘
```

All sensitive credentials (Supabase service_role key, Whapi token, Twilio key, Paystack secret, OpenAI key) live in n8n credentials only — never on the frontend.

## REQUIRED CREDENTIALS (set up first in n8n)

| Name | Type | Used by |
|---|---|---|
| `supabase_service` | Supabase API (service_role JWT) | All workflows |
| `whapi_admin` | HTTP Header Auth — header `Authorization: Bearer <WHAPI_PARTNER_TOKEN>` | whatsapp-setup |
| `twilio_main` | Twilio API | send-otp |
| `paystack_secret` | HTTP Header Auth — header `Authorization: Bearer <PAYSTACK_SECRET>` | create-payment-session |
| `openai_main` | OpenAI API | inbound-message-handler |

## SHARED ENV VARIABLES (n8n → Settings → Variables)

```
EASTERN_AI_SECRET         = <same string as VITE_N8N_SECRET on frontend>
SUPABASE_URL              = https://kabjhlkuaaavaiazmozm.supabase.co
SUPABASE_SERVICE_KEY      = <service_role JWT — NEVER expose>
WHAPI_PARTNER_TOKEN       = <from Whapi.cloud partner account>
WHAPI_WEBHOOK_URL         = <this n8n instance>/webhook/whatsapp-inbound
TWILIO_FROM               = <Twilio sending number>
PAYSTACK_PLAN_CODE        = <100 GHS plan code from Paystack>
OPENAI_MODEL              = gpt-4o-mini
```

## SHARED PATTERN (apply to every webhook)

Every webhook workflow starts with this trio:

1. **Webhook trigger** — POST, path = `/<workflow-name>`, response mode = "When last node finishes", response body = `{{$json}}`.
2. **IF node — auth gate** — condition `{{$json.headers["x-eastern-ai-secret"]}} === {{$env.EASTERN_AI_SECRET}}`. False branch → "Respond to Webhook" node returning `{ "success": false, "error": "unauthorized" }` with HTTP 401.
3. **(Workflow-specific work)** — see each section below.
4. **Respond to Webhook** — final node returning JSON.

If the request body fails validation at any point, fall through to a "Respond to Webhook" returning `{ "success": false, "error": "<reason>" }` with HTTP 400.

---

## WORKFLOW 1: send-otp

**Path:** `POST /webhook/send-otp`
**Body:** `{ "user_id": "<uuid>", "phone": "+233..." }`

Nodes after auth gate:

1. **Function — generate OTP** — `return [{ json: { otp: String(Math.floor(100000 + Math.random()*900000)), user_id: $json.body.user_id, phone: $json.body.phone } }]`
2. **Supabase — Insert row** in `otp_verifications` with `{ user_id, otp_code: {{$json.otp}}, expires_at: now() + interval '10 minutes', used: false }`. Use service_role credential.
3. **Twilio — Send SMS** — to `{{$json.phone}}`, from `{{$env.TWILIO_FROM}}`, body: `Your Eastern AI verification code is {{$json.otp}}. Valid for 10 minutes.`
4. **Respond** — `{ "success": true }`

Error path: catch any failure → respond `{ "success": false, "error": "Failed to send SMS" }`.

---

## WORKFLOW 2: verify-otp

**Path:** `POST /webhook/verify-otp`
**Body:** `{ "user_id": "<uuid>", "code": "123456" }`

Nodes after auth gate:

1. **Supabase — Select row** from `otp_verifications` where `user_id = {{$json.body.user_id}} AND otp_code = {{$json.body.code}} AND used = false AND expires_at > now()`. Limit 1.
2. **IF — row found** — false branch → respond `{ "success": false, "error": "Invalid or expired code" }`.
3. **Supabase — Update row** in `otp_verifications` set `used = true` where `id = {{$json.id}}`.
4. **Supabase — Update row** in `profiles` set `is_verified = true` where `id = {{$json.user_id}}`.
5. **Respond** — `{ "success": true }`

---

## WORKFLOW 3: whatsapp-setup (get-or-create channel)

**Path:** `POST /webhook/whatsapp-setup`
**Body:** `{ "user_id": "<uuid>" }`

Nodes after auth gate:

1. **Supabase — Select** from `whapi_channels` where `user_id = {{$json.body.user_id}}`. Use `.maybeSingle()`.
2. **IF — channel exists AND status = 'authorized'** — true branch → respond `{ "success": true, "status": "authorized" }`.
3. **IF — channel exists AND status != 'authorized'** — true branch → poll Whapi for fresh QR, update row's `qr_code_url`, respond `{ "success": true, "status": "<current>" }`.
4. **HTTP Request — create Whapi channel** — `POST https://manager.whapi.cloud/channels` with header `Authorization: Bearer {{$env.WHAPI_PARTNER_TOKEN}}`. Body: `{ "name": "eastern_ai_{{$json.user_id}}", "projectId": "<your project>" }`. Returns `{ id, token }`.
5. **HTTP Request — get QR** — `GET https://gate.whapi.cloud/users/login` with header `Authorization: Bearer {{channel_token}}`. Returns `{ qr: "data:image/png;base64,..." }`.
6. **HTTP Request — register webhook for the new channel** — `PATCH https://gate.whapi.cloud/settings` with `Authorization: Bearer {{channel_token}}` and body:
   ```json
   {
     "webhooks": [{
       "url": "{{$env.WHAPI_WEBHOOK_URL}}",
       "events": [
         { "type": "messages", "method": "post" },
         { "type": "statuses", "method": "post" },
         { "type": "channel", "method": "post" }
       ]
     }]
   }
   ```
7. **Supabase — Storage upload** — decode the base64 QR and upload to bucket `whatsapp-qr` at path `{{user_id}}.png`. Get the public URL.
8. **Supabase — Insert row** in `whapi_channels` with `{ user_id, whapi_channel_id, status: 'initializing', qr_code_url, channel_token }` (store `channel_token` in a separate `whapi_channel_secrets` table — NEVER expose to frontend).
9. **Respond** — `{ "success": true, "status": "initializing" }`

> **Note:** Add a `whapi_channel_secrets` table via migration: `(user_id uuid pk, channel_token text not null)` with RLS denying all SELECT — service_role only. Frontend reads QR from `whapi_channels.qr_code_url`, never the token.

---

## WORKFLOW 4: update-brand-voice

**Path:** `POST /webhook/update-brand-voice`
**Body:** `{ "user_id": "<uuid>", "brand_voice": "professional_executive" | "hype_man" | "problem_solver" }`

Nodes after auth gate:

1. **Supabase — Update** `profiles` set `brand_voice = {{$json.body.brand_voice}}` where `id = {{$json.body.user_id}}`.
2. **Respond** — `{ "success": true }`

(The actual prompt switching happens in WORKFLOW 7 by reading `profiles.brand_voice` per-message — no need to push to a separate AI config.)

---

## WORKFLOW 5: set-hitl (Human-in-the-Loop toggle)

**Path:** `POST /webhook/set-hitl`
**Body:** `{ "user_id": "<uuid>", "enabled": true }`

Nodes after auth gate:

1. **Supabase — Update** `profiles` set `human_in_loop = {{$json.body.enabled}}` where `id = {{$json.body.user_id}}`.
2. **Respond** — `{ "success": true }`

(WORKFLOW 7 reads `profiles.human_in_loop` per inbound message and skips AI generation when true.)

---

## WORKFLOW 6: create-payment-session

**Path:** `POST /webhook/create-payment-session`
**Body:** `{ "user_id": "<uuid>", "plan": "pro" }`

Nodes after auth gate:

1. **Supabase — Select** `email` from `auth.users` where `id = {{$json.body.user_id}}` (via service_role).
2. **HTTP Request — Paystack initialize** — `POST https://api.paystack.co/transaction/initialize` with credential `paystack_secret`. Body:
   ```json
   {
     "email": "{{$json.email}}",
     "amount": 10000,
     "currency": "GHS",
     "plan": "{{$env.PAYSTACK_PLAN_CODE}}",
     "callback_url": "https://yourdomain.com/dashboard?payment=success",
     "metadata": { "user_id": "{{$json.user_id}}" }
   }
   ```
3. **Respond** — `{ "success": true, "payment_url": "{{$json.data.authorization_url}}" }`

Add a separate **paystack-webhook** workflow that listens for Paystack's `charge.success` event, verifies the signature, and updates `profiles.plan = 'pro'` for the matching `user_id`.

---

## WORKFLOW 7: whatsapp-inbound (the brain)

**Path:** `POST /webhook/whatsapp-inbound`
**Body:** Whapi.cloud webhook payload — varies by event type.

This is the most complex workflow — it handles three event types:

### Branch A: `event.type === "channel"` (status update)

1. **Supabase — Update** `whapi_channels` set `status = {{$json.channel.status}}` where `whapi_channel_id = {{$json.channel.id}}`.
2. End.

### Branch B: `event.type === "messages"` AND `messages[0].from_me === false` (inbound user message)

1. **Function — extract** `{ channel_id, contact_phone, message_text, contact_name }` from payload.
2. **Supabase — Select** `whapi_channels` joined with `profiles` on `user_id` where `whapi_channel_id = {{channel_id}}`. Need: `user_id, brand_voice, human_in_loop, plan, trial_expires_at`.
3. **Supabase — Insert** `message_logs` row: `{ user_id, direction: 'inbound', contact_phone, content: message_text, ai_generated: false }`.
4. **Supabase — Upsert** `sales_leads` row: `{ user_id, contact_phone, contact_name, last_message: message_text, status: 'active' }` ON CONFLICT (user_id, contact_phone) DO UPDATE.
5. **IF — `human_in_loop === true` OR (trial expired AND plan = 'trial') OR (messages_used >= 50 AND plan = 'trial')** — true branch → end (no AI response).
6. **Function — pick system prompt by brand_voice:**
   ```js
   const prompts = {
     professional_executive: "You are a professional executive assistant for {{business_name}}. Respond formally, concisely, and helpfully. Address the customer with respect.",
     hype_man: "You are an enthusiastic hype-man for {{business_name}}. Be high-energy, use Ghanaian slang sparingly, get the customer excited about products/services. Keep it under 3 sentences.",
     problem_solver: "You are a sharp problem-solver for {{business_name}}. Diagnose the customer's need in one question, then propose a clear next step. No fluff."
   }
   return [{ json: { systemPrompt: prompts[$json.brand_voice], userMessage: $json.message_text } }]
   ```
7. **OpenAI — Chat completion** — model `{{$env.OPENAI_MODEL}}`, system: `{{$json.systemPrompt}}`, user: `{{$json.userMessage}}`, max_tokens: 250, temperature: 0.7.
8. **HTTP Request — send WhatsApp reply** — `POST https://gate.whapi.cloud/messages/text` with `Authorization: Bearer {{channel_token}}`. Body: `{ "to": "{{contact_phone}}", "body": "{{ai_response}}" }`. (Look up the channel_token from `whapi_channel_secrets` first.)
9. **Supabase — Insert** `message_logs`: `{ user_id, direction: 'outbound', contact_phone, content: ai_response, ai_generated: true }`.
10. **Supabase — Insert** `agent_logs`: `{ user_id, contact_phone, inbound_message: message_text, ai_response, brand_voice, was_overridden: false }`.
11. End.

### Branch C: `event.type === "statuses"` (delivery receipts) — log only or ignore.

---

## ROUTING IN n8n

Use a single **Switch** node right after the auth gate that branches on `{{$json.body.event.type}}`:
- `channel` → Branch A
- `messages` → IF `from_me === false` → Branch B; else end
- `statuses` → Branch C / end

---

## TESTING CHECKLIST

After building, test in this order:

1. **send-otp** — call with valid `user_id` and your phone. Confirm SMS arrives and `otp_verifications` row appears.
2. **verify-otp** — call with the SMS code. Confirm `profiles.is_verified = true`.
3. **whatsapp-setup** — call once. Confirm `whapi_channels` row created with `qr_code_url`. Scan QR with WhatsApp on your phone.
4. **whatsapp-inbound (channel event)** — confirm `whapi_channels.status` flips to `authorized` after scan.
5. **whatsapp-inbound (message event)** — text the connected number from another phone. Confirm an AI reply arrives within 5s and `message_logs` + `agent_logs` rows appear.
6. **set-hitl** — toggle on, send another message. Confirm NO AI reply. Toggle off, confirm reply resumes.
7. **update-brand-voice** — change voice, send a message, confirm response style changes accordingly.
8. **create-payment-session** — confirm a valid Paystack URL is returned. Test the full payment in Paystack test mode and confirm `profiles.plan` flips to `pro` via the webhook listener.

## SECURITY HARDENING (do these before production)

- Rotate `EASTERN_AI_SECRET` to a 64-char random string. Update both n8n and frontend `.env`.
- Verify Paystack webhook signatures (HMAC SHA512 of body using your secret key).
- Verify Whapi webhooks via the `X-Hub-Signature` header if Whapi supports it (check current docs).
- Rate-limit `/send-otp` per `user_id` to 1/minute server-side.
- Add a `Retry on Fail` policy to all Supabase nodes (3 attempts, exponential backoff).
- Set the n8n workflow timeout to 30s — kill stuck OpenAI calls.

## NOTES

- The frontend already implements a 60-second OTP resend cooldown client-side, but enforce it server-side too as a defense-in-depth measure.
- The frontend's `isDevMode()` (when `VITE_N8N_WEBHOOK_BASE_URL` is the placeholder) bypasses these webhooks entirely — useful for local development without hitting your n8n instance.
- All tables already have RLS configured. The service_role key bypasses RLS, which is why n8n can write to `otp_verifications` and `message_logs` even though the frontend cannot.
