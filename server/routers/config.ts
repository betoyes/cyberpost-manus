import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import * as db from "../db";

/** Keys that hold secrets — masked when read back to the UI. */
const SECRET_KEYS = new Set([
  "google_refresh_token",
  "google_client_secret",
  "meta_access_token",
]);

const PUBLIC_KEYS = [
  "google_client_id",
  "google_client_secret",
  "google_refresh_token",
  "meta_access_token",
  "ig_account_id",
  "spreadsheet_id",
  "drive_folder_name",
  "approval_email",
  "llm_model",
  "cron_task_uid",
  "cron_enabled",
] as const;

function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export const configRouter = router({
  /** Returns settings with secrets masked + connection flags. */
  get: adminProcedure.query(async () => {
    const all = await db.getAllSettings();
    const out: Record<string, string> = {};
    for (const k of PUBLIC_KEYS) {
      const v = all[k] ?? "";
      out[k] = SECRET_KEYS.has(k) ? mask(v) : v;
    }
    return {
      values: out,
      flags: {
        googleConnected: Boolean(all["google_refresh_token"]),
        metaConnected: Boolean(all["meta_access_token"] && all["ig_account_id"]),
        sheetConfigured: Boolean(all["spreadsheet_id"]),
        cronEnabled: all["cron_enabled"] === "true",
      },
    };
  }),

  /** Update non-secret config values (approval email, model, ids, folder). */
  set: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      await db.setSetting(input.key, input.value);
      return { ok: true };
    }),
});

export const logsRouter = router({
  list: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(500).default(100) }).optional())
    .query(({ input }) => db.listLogs(input?.limit ?? 100)),
});
