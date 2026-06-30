import { and, asc, desc, eq, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  posts,
  settings,
  activityLogs,
  type InsertPost,
  type InsertActivityLog,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/* ------------------------------------------------------------------ */
/* Posts                                                              */
/* ------------------------------------------------------------------ */

export async function listPosts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(posts).orderBy(asc(posts.scheduledAt), desc(posts.createdAt));
}

export async function getPost(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return rows[0];
}

export async function getPostByApprovalToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(posts).where(eq(posts.approvalToken, token)).limit(1);
  return rows[0];
}

export async function createPost(data: InsertPost) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const res = await db.insert(posts).values(data).$returningId();
  return res[0]?.id;
}

export async function updatePost(id: number, data: Partial<InsertPost>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(posts).set(data).where(eq(posts.id, id));
}

export async function deletePost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(posts).where(eq(posts.id, id));
}

/**
 * The oldest "Pendente" or "Erro: Imagem Ausente" post whose scheduled time has passed.
 * Used by the cron to process exactly one item per run (queue logic).
 */
export async function getOldestDuePost(nowMs: number) {
  const db = await getDb();
  if (!db) return undefined;
  // Pending due posts only; "Fluxo Parado" must not advance the queue.
  const rows = await db
    .select()
    .from(posts)
    .where(and(lte(posts.scheduledAt, nowMs)))
    .orderBy(asc(posts.scheduledAt));
  // filter in JS for status set, keep oldest due that is actionable
  const actionable = rows.filter(
    (r) => r.status === "Pendente" || r.status === "Erro: Imagem Ausente" || r.status === "Aguardando Aprovação",
  );
  return actionable[0];
}

/**
 * The oldest actionable due post that is READY for the Manus executor to act on.
 * Returns posts that are due and in 'Pendente' or 'Erro: Imagem Ausente'
 * (executor will (re)attempt image download + posting). 'Aguardando Aprovação'
 * and 'Fluxo Parado' are NOT returned — they are blocked until resolved.
 */
export async function getNextReadyToExecute(nowMs: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(posts)
    .where(lte(posts.scheduledAt, nowMs))
    .orderBy(asc(posts.scheduledAt));
  const actionable = rows.filter(
    (r) => r.status === "Pendente" || r.status === "Erro: Imagem Ausente",
  );
  return actionable[0];
}

/* ------------------------------------------------------------------ */
/* Settings (key/value)                                               */
/* ------------------------------------------------------------------ */

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(settings).where(eq(settings.settingKey, key)).limit(1);
  return rows[0]?.settingValue ?? null;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(settings);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.settingKey] = r.settingValue ?? "";
  return out;
}

export async function setSetting(key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(settings)
    .values({ settingKey: key, settingValue: value })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

/* ------------------------------------------------------------------ */
/* Activity logs                                                      */
/* ------------------------------------------------------------------ */

export async function addLog(entry: InsertActivityLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(activityLogs).values(entry);
}

export async function listLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(limit);
}
