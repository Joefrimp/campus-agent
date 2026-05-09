/**
 * Email delivery via Resend. Lazy-loaded so the agent boots without
 * RESEND_API_KEY (in which case email features are simply disabled).
 */
import { config } from '../config.js';
import { logger } from './logger.js';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  reply_to?: string;
}

let cachedClient: { send: (args: SendEmailArgs) => Promise<{ ok: boolean; id?: string; error?: string }> } | null = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  if (!config.RESEND_API_KEY) return null;
  const { Resend } = await import('resend');
  const resend = new Resend(config.RESEND_API_KEY);
  const fromAddr = 'Eastern AI <reports@easternai.dev>';
  cachedClient = {
    async send(args) {
      const { data, error } = await resend.emails.send({
        from: fromAddr,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        replyTo: args.reply_to,
        attachments: args.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: data?.id };
    },
  };
  return cachedClient;
}

export async function sendEmail(args: SendEmailArgs): Promise<{ sent: boolean; reason?: string }> {
  const client = await getClient();
  if (!client) {
    logger.debug('email skipped: RESEND_API_KEY not configured');
    return { sent: false, reason: 'not_configured' };
  }
  const result = await client.send(args);
  if (!result.ok) {
    logger.error({ err: result.error, to: args.to }, 'email send failed');
    return { sent: false, reason: result.error };
  }
  return { sent: true };
}
