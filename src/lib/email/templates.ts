import type { Locale } from '@/i18n/routing';

/**
 * Notification templates, stored in code rather than the database for Phase 1.
 *
 * Each template is a pure function of its payload, returns both languages'
 * subject and body, and is unit-tested for placeholder completeness. Moving
 * these into `notification_templates` later is a data change, not a redesign.
 */

export type TemplateCode = 'customer.welcome' | 'customer.password_reset';

export type TemplatePayload = Record<string, string | number | undefined>;

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

type Template = {
  en: (payload: TemplatePayload) => RenderedEmail;
  ar: (payload: TemplatePayload) => RenderedEmail;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Wraps body content in the shared email shell.
 *
 * `heading` and `footer` are escaped here, so callers pass raw values. The
 * `body` argument is trusted HTML built by the template itself (and any dynamic
 * value inside it is escaped before interpolation).
 */
function layout(direction: 'ltr' | 'rtl', heading: string, body: string, footer: string): string {
  return `<!doctype html>
<html lang="${direction === 'rtl' ? 'ar' : 'en'}" dir="${direction}">
  <body style="margin:0;padding:24px;background:#f5f6f8;font-family:system-ui,'Segoe UI',Tahoma,sans-serif;color:#1f2430">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px">
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 16px;font-size:20px;font-weight:600">${escapeHtml(heading)}</h1>
        <div style="font-size:15px;line-height:1.7">${body}</div>
        <p style="margin-top:28px;font-size:12px;color:#6b7280">${escapeHtml(footer)}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#2456c9;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
}

export const TEMPLATES: Record<TemplateCode, Template> = {
  'customer.welcome': {
    en: (p) => {
      const name = String(p.name ?? 'there');
      const url = String(p.confirmUrl ?? '');
      return {
        subject: 'Confirm your Customer Ticketing System account',
        text: `Hello ${name},\n\nConfirm your email address to activate your account:\n${url}\n\nIf you did not create this account, ignore this message.`,
        html: layout(
          'ltr',
          `Welcome, ${name}`,
          `<p>Confirm your email address to activate your account.</p>${button(url, 'Confirm email')}<p>If you did not create this account, ignore this message.</p>`,
          'Customer Ticketing System',
        ),
      };
    },
    ar: (p) => {
      const name = String(p.name ?? 'عزيزنا');
      const url = String(p.confirmUrl ?? '');
      return {
        subject: 'تأكيد حسابك في نظام تذاكر العملاء',
        text: `مرحبًا ${name}،\n\nيرجى تأكيد بريدك الإلكتروني لتفعيل حسابك:\n${url}\n\nإذا لم تقم بإنشاء هذا الحساب، تجاهل هذه الرسالة.`,
        html: layout(
          'rtl',
          `مرحبًا، ${name}`,
          `<p>يرجى تأكيد بريدك الإلكتروني لتفعيل حسابك.</p>${button(url, 'تأكيد البريد الإلكتروني')}<p>إذا لم تقم بإنشاء هذا الحساب، تجاهل هذه الرسالة.</p>`,
          'نظام تذاكر العملاء',
        ),
      };
    },
  },

  'customer.password_reset': {
    en: (p) => {
      const url = String(p.resetUrl ?? '');
      return {
        subject: 'Reset your Customer Ticketing System password',
        text: `Use this link to choose a new password:\n${url}\n\nThe link expires shortly. If you did not request a reset, ignore this message.`,
        html: layout(
          'ltr',
          'Reset your password',
          `<p>Use the button below to choose a new password. The link expires shortly.</p>${button(url, 'Choose a new password')}<p>If you did not request a reset, ignore this message.</p>`,
          'Customer Ticketing System',
        ),
      };
    },
    ar: (p) => {
      const url = String(p.resetUrl ?? '');
      return {
        subject: 'إعادة تعيين كلمة المرور في نظام تذاكر العملاء',
        text: `استخدم هذا الرابط لاختيار كلمة مرور جديدة:\n${url}\n\nتنتهي صلاحية الرابط قريبًا. إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة.`,
        html: layout(
          'rtl',
          'إعادة تعيين كلمة المرور',
          `<p>استخدم الزر أدناه لاختيار كلمة مرور جديدة. تنتهي صلاحية الرابط قريبًا.</p>${button(url, 'اختيار كلمة مرور جديدة')}<p>إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة.</p>`,
          'نظام تذاكر العملاء',
        ),
      };
    },
  },
};

export function renderEmail(
  templateCode: TemplateCode,
  locale: Locale,
  payload: TemplatePayload,
): RenderedEmail {
  const template = TEMPLATES[templateCode];
  if (!template) {
    throw new Error(`Unknown email template: ${templateCode}`);
  }
  return template[locale](payload);
}