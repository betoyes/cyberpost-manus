import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import * as db from "../db";

export const accountsRouter = router({
  list: adminProcedure.query(() => db.listAccounts()),

  create: adminProcedure
    .input(
      z.object({
        label: z.string().min(1),
        igUserId: z.string().optional(),
        igUsername: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await db.createAccount({
        label: input.label,
        igUserId: input.igUserId ?? null,
        igUsername: input.igUsername ?? null,
        active: true,
      });
      return { id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        label: z.string().min(1).optional(),
        igUserId: z.string().nullable().optional(),
        igUsername: z.string().nullable().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await db.updateAccount(id, rest);
      return { ok: true };
    }),

  remove: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteAccount(input.id);
      return { ok: true };
    }),
});
