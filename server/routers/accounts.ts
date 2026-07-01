import { z } from "zod";
import { router, adminProcedure, ownerProcedure } from "../_core/trpc";
import * as db from "../db";
import { testInstagramConnection } from "../instagramGraph";

const META_TOKEN_KEY = "meta_access_token";

export const accountsRouter = router({
  list: adminProcedure.query(() => db.listAccounts()),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        handle: z.string().optional(),
        igUserId: z.string().optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await db.createAccount({
        name: input.name,
        handle: input.handle ?? null,
        igUserId: input.igUserId ?? null,
        platform: "instagram",
        isDefault: input.isDefault ?? false,
        active: true,
      });
      return { id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        handle: z.string().nullable().optional(),
        igUserId: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await db.updateAccount(id, rest);
      return { ok: true };
    }),

  setDefault: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.setDefaultAccount(input.id);
      return { ok: true };
    }),

  remove: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteAccount(input.id);
      return { ok: true };
    }),

  /**
   * Status of the Meta/Instagram connection — never returns the token
   * itself, only booleans + an approximate last-updated date.
   */
  metaStatus: adminProcedure.query(async () => {
    const defaultAccount = await db.getDefaultAccount();
    const tokenMeta = await db.getSettingMeta(META_TOKEN_KEY);
    return {
      hasDefaultAccount: Boolean(defaultAccount),
      igUserIdConfigured: Boolean(defaultAccount?.igUserId),
      tokenSaved: tokenMeta.isSet,
      tokenUpdatedAt: tokenMeta.updatedAt,
    };
  }),

  /** Owner-only: persist the Meta long-lived access token. Rejects empty values. */
  saveMetaToken: ownerProcedure
    .input(
      z.object({ token: z.string().trim().min(1, "Token não pode ser vazio") })
    )
    .mutation(async ({ input }) => {
      await db.setSetting(META_TOKEN_KEY, input.token);
      await db.addLog({
        postId: null,
        kind: "config",
        message: "Token do Meta atualizado.",
      });
      return { ok: true };
    }),

  /** Owner-only: remove the saved Meta access token. */
  removeMetaToken: ownerProcedure.mutation(async () => {
    await db.deleteSetting(META_TOKEN_KEY);
    await db.addLog({
      postId: null,
      kind: "config",
      message: "Token do Meta removido.",
    });
    return { ok: true };
  }),

  /**
   * Read-only connectivity check — never publishes. Uses the saved token and
   * the default account's igUserId; returns a sanitized success/failure
   * message only (no token, no raw Graph API payload).
   */
  testMetaConnection: adminProcedure.mutation(async () => {
    const defaultAccount = await db.getDefaultAccount();
    if (!defaultAccount?.igUserId) {
      return {
        ok: false as const,
        message: "Nenhuma conta padrão com IG User ID configurada.",
      };
    }
    const token = await db.getSetting(META_TOKEN_KEY);
    if (!token) {
      return { ok: false as const, message: "Token do Meta não configurado." };
    }
    return testInstagramConnection({
      igUserId: defaultAccount.igUserId,
      accessToken: token,
    });
  }),
});
