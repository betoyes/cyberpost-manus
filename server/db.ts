import { and, asc, desc, eq, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  posts,
  settings,
  activityLogs,
  accounts,
  type Post,
  type InsertPost,
  type InsertActivityLog,
  type InsertAccount,
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
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/* ------------------------------------------------------------------ */
/* Posts                                                              */
/* ------------------------------------------------------------------ */

export async function listPosts() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(posts)
    .orderBy(asc(posts.scheduledAt), desc(posts.createdAt));
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
  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.approvalToken, token))
    .limit(1);
  return rows[0];
}

export async function getPostByScheduleUid(uid: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.scheduleCronTaskUid, uid))
    .limit(1);
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
    r =>
      r.status === "Pendente" ||
      r.status === "Erro: Imagem Ausente" ||
      r.status === "Aguardando Aprovação"
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
    r => r.status === "Pendente" || r.status === "Erro: Imagem Ausente"
  );
  return actionable[0];
}

/* ------------------------------------------------------------------ */
/* Accounts                                                           */
/* ------------------------------------------------------------------ */

export async function listAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accounts).orderBy(asc(accounts.id));
}

export async function getAccount(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  return rows[0];
}

export async function getDefaultAccount() {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.isDefault, true))
    .limit(1);
  return rows[0];
}

export type ResolvedAccount = {
  id: number;
  name: string;
  handle: string | null;
  igUserId: string | null;
};

/**
 * Resolve which Instagram account a post publishes to: post.accountId if
 * set, otherwise the default account. Wrapped so callers keep working if the
 * accounts table hasn't been migrated yet. Shared by queueNextHandler
 * (Manus executor bridge) and the own executor (HANDOFF_INDEPENDENCIA_MANUS.md §2).
 */
export async function resolvePostAccount(
  post: Pick<Post, "accountId">
): Promise<ResolvedAccount | null> {
  try {
    if (post.accountId) {
      const acc = await getAccount(post.accountId);
      if (acc) {
        return {
          id: acc.id,
          name: acc.name,
          handle: acc.handle ?? null,
          igUserId: acc.igUserId ?? null,
        };
      }
    }
    const def = await getDefaultAccount();
    if (def) {
      return {
        id: def.id,
        name: def.name,
        handle: def.handle ?? null,
        igUserId: def.igUserId ?? null,
      };
    }
  } catch {
    // accounts table not yet migrated — continue without account info
  }
  return null;
}

export async function createAccount(data: InsertAccount) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const res = await db.insert(accounts).values(data).$returningId();
  return res[0]?.id;
}

export async function updateAccount(id: number, data: Partial<InsertAccount>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(accounts).set(data).where(eq(accounts.id, id));
}

export async function deleteAccount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(accounts).where(eq(accounts.id, id));
}

export async function setDefaultAccount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(accounts).set({ isDefault: false });
  await db.update(accounts).set({ isDefault: true }).where(eq(accounts.id, id));
}

/* ------------------------------------------------------------------ */
/* Settings (key/value)                                               */
/* ------------------------------------------------------------------ */

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.settingKey, key))
    .limit(1);
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
  return db
    .select()
    .from(activityLogs)
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
}
