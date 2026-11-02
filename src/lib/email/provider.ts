/**
 * Transactional email.
 *
 * Providers are interchangeable behind this interface so the send mechanism can
 * change (Resend → SES → Microsoft Graph) without touching a service. Locally a
 * console provider is used, which preserves the exact payload in the outbox row
 * rather than pretending an email was delivered.
 */

import 'server-only';

export type EmailMessage = {
  to: string;
  locale: 'en' | 'ar';
  templateCode: string;
  subject: string;
  text: string;
  html: string;
  /** Business-event key used to prevent duplicate sends. */
  dedupeKey?: string;
};

export type EmailResult =
  | { ok: true; providerId?: string }
  | { ok: false; error: string; retryable: boolean };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}

class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<EmailResult> {
    console.info(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        event: 'email.console',
        to: message.to,
        template: message.templateCode,
        locale: message.locale,
        subject: message.subject,
        dedupeKey: message.dedupeKey,
      }),
    );
    return { ok: true, providerId: 'console' };
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
    private readonly fromName: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      // Imported lazily so the SDK is never loaded in a console-only environment.
      const { Resend } = await import('resend');
      const client = new Resend(this.apiKey);

      const { data, error } = await client.emails.send({
        from: `${this.fromName} <${this.fromAddress}>`,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      if (error) {
        const retryable = (error as { statusCode?: number }).statusCode !== 422;
        return { ok: false, error: String(error.message ?? 'send failed'), retryable };
      }

      return { ok: true, providerId: data?.id };
    } catch (cause) {
      return {
        ok: false,
        error: cause instanceof Error ? cause.message : 'unknown email error',
        retryable: true,
      };
    }
  }
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;
  const fromName = process.env.EMAIL_FROM_NAME ?? 'Customer Support';

  if (apiKey && fromAddress) {
    cached = new ResendEmailProvider(apiKey, fromAddress, fromName);
  } else {
    cached = new ConsoleEmailProvider();
  }

  return cached;
}

/** Test seam: lets unit tests assert against a deterministic provider. */
export function setEmailProviderForTests(provider: EmailProvider | null) {
  cached = provider;
}