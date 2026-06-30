import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import * as db from "../db";

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
});
