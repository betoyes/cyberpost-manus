import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { sendEmail } from "../email";
import * as db from "../db";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const contentToHtml = (content: string): string =>
  `<pre style="font-family: inherit; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(content)}</pre>`;

/**
 * Dispatches a project-owner notification by email (own provider — see
 * HANDOFF_INDEPENDENCIA_MANUS.md §3). Replaces the former Manus Notification
 * Service call. Recipient comes from `settings.approval_email` first, falling
 * back to `EMAIL_OWNER`. Returns `true` if the email was accepted by the
 * provider, `false` on delivery failure. Validation/config errors bubble up
 * as TRPC errors so callers can fix the payload/setup.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  const to = (await db.getSetting("approval_email")) || ENV.emailOwner;
  if (!to) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Owner email is not configured (set settings.approval_email or EMAIL_OWNER).",
    });
  }

  return sendEmail({
    to,
    subject: title,
    html: contentToHtml(content),
    text: content,
  });
}
