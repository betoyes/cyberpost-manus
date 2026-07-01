import { Resend } from "resend";
import { ENV } from "./_core/env";

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

let cachedClient: Resend | null = null;

const getClient = (): Resend => {
  if (!ENV.resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  if (!cachedClient) {
    cachedClient = new Resend(ENV.resendApiKey);
  }
  return cachedClient;
};

/**
 * Own transactional email provider (Resend). Replaces the Manus Notification
 * Service dependency — see HANDOFF_INDEPENDENCIA_MANUS.md §3.
 * Returns false (instead of throwing) on delivery failure so callers can
 * decide how to degrade, matching the previous notifyOwner contract.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const { to, subject, html, text } = params;

  if (!ENV.emailFrom) {
    throw new Error("EMAIL_FROM is not configured");
  }

  const client = getClient();

  try {
    const { error } = await client.emails.send({
      from: ENV.emailFrom,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.warn("[Email] Failed to send:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[Email] Error sending email:", error);
    return false;
  }
}
