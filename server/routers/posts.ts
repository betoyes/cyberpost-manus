import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import * as db from "../db";

const modeEnum = z.enum(["manual", "aprovar", "auto"]);
const mediaEnum = z.enum(["image", "reel"]);
const statusEnum = z.enum([
  "Pendente",
  "Postado",
  "Aguardando Aprovação",
  "Erro: Imagem Ausente",
  "Fluxo Parado",
]);

export const postsRouter = router({
  list: adminProcedure.query(() => db.listPosts()),

  get: adminProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getPost(input.id)),

  create: adminProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        theme: z.string().optional(),
        mode: modeEnum.default("aprovar"),
        mediaType: mediaEnum.default("image"),
        scheduledAt: z.number().nullable().optional(),
        captionManual: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const id = await db.createPost({
        filename: input.filename,
        theme: input.theme ?? null,
        mode: input.mode,
        mediaType: input.mediaType,
        scheduledAt: input.scheduledAt ?? null,
        captionManual: input.captionManual ?? null,
        status: "Pendente",
      });
      await db.addLog({ postId: id, kind: "criado", message: `Post criado: ${input.filename}` });
      return { id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        filename: z.string().min(1).optional(),
        theme: z.string().nullable().optional(),
        mode: modeEnum.optional(),
        mediaType: mediaEnum.optional(),
        scheduledAt: z.number().nullable().optional(),
        captionManual: z.string().nullable().optional(),
        status: statusEnum.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await db.updatePost(id, rest);
      await db.addLog({ postId: id, kind: "editado", message: `Post atualizado` });
      return { ok: true };
    }),

  remove: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.deletePost(input.id);
    return { ok: true };
  }),

  /** Reset a halted/errored post back to Pendente so the cron retries it. */
  reactivate: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.updatePost(input.id, { status: "Pendente", note: null });
    await db.addLog({ postId: input.id, kind: "reativado", message: "Post reativado para Pendente" });
    return { ok: true };
  }),

  /**
   * Prioritize a post for immediate publication.
   * Sets scheduledAt = now so getNextReadyToExecute returns it on the next executor poll.
   * Does NOT publish to Instagram — that is the executor's job.
   */
  postNow: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const post = await db.getPost(input.id);
    if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post não encontrado" });
    if (post.status === "Postado") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Post já foi publicado" });
    }
    if (post.status === "Aguardando Aprovação") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Post aguarda aprovação de legenda por e-mail — não é possível forçar publicação",
      });
    }
    await db.updatePost(input.id, { scheduledAt: Date.now(), status: "Pendente", note: null });
    await db.addLog({
      postId: input.id,
      kind: "priorizado",
      message: `Post "${post.filename}" priorizado para publicação imediata via painel.`,
    });
    return { ok: true };
  }),
});
