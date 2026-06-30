import { bigint, int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Editorial calendar posts.
 * Status uses the exact Portuguese strings required by the spec.
 * Mode: auto (IA -> requires email approval), aprovar (alias of auto with approval), manual.
 */
export const posts = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  /** Filename of the art in the CybersecCAST Drive folder. */
  filename: varchar("filename", { length: 512 }).notNull(),
  /** Theme / keywords used to generate the AI caption. */
  theme: text("theme"),
  /** Caption modes: 'manual' | 'aprovar' (AI + email approval) | 'auto' (alias, still needs approval per spec). */
  mode: mysqlEnum("mode", ["manual", "aprovar", "auto"]).default("aprovar").notNull(),
  /** Exact status strings required by the spec. */
  status: mysqlEnum("status", [
    "Pendente",
    "Postado",
    "Aguardando Aprovação",
    "Erro: Imagem Ausente",
    "Fluxo Parado",
  ])
    .default("Pendente")
    .notNull(),
  /** Scheduled publish time, stored as UTC unix ms. */
  scheduledAt: bigint("scheduledAt", { mode: "number" }),
  /** Media type to post. */
  mediaType: mysqlEnum("mediaType", ["image", "reel"]).default("image").notNull(),

  /** Manual caption (highest priority). */
  captionManual: text("captionManual"),
  /** AI generated caption (used only when approved). */
  captionAi: text("captionAi"),
  /** Whether the AI caption was approved via email. */
  captionApproved: boolean("captionApproved").default(false).notNull(),

  /** Storage key/url of the downloaded+converted media (public for Instagram). */
  imageStorageKey: varchar("imageStorageKey", { length: 512 }),
  imageUrl: varchar("imageUrl", { length: 1024 }),

  /** Instagram media id + permalink after posting. */
  instagramId: varchar("instagramId", { length: 128 }),
  permalink: varchar("permalink", { length: 512 }),

  /** Drive file id once located. */
  driveFileId: varchar("driveFileId", { length: 256 }),

  /** Approval email tracking. */
  approvalToken: varchar("approvalToken", { length: 64 }),
  approvalEmailSentAt: bigint("approvalEmailSentAt", { mode: "number" }),
  /** Last time a 'missing image' alert email was sent (for the 6h cadence). */
  lastMissingAlertAt: bigint("lastMissingAlertAt", { mode: "number" }),

  /** Free-form note for the latest error/skip reason. */
  note: text("note"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;

/**
 * Key/value settings store (singleton-ish): Google tokens, Meta token, IG account id,
 * spreadsheetId, driveFolderId, approvalEmail, llmModel, cron task uid, etc.
 */
export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 128 }).notNull().unique(),
  settingValue: text("settingValue"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;

/**
 * Activity log for observability (posted / rejected / blocked / errors / cron runs).
 */
export const activityLogs = mysqlTable("activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId"),
  kind: varchar("kind", { length: 64 }).notNull(),
  message: text("message"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;
