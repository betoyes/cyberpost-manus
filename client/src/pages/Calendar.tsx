import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, ModeBadge, type PostStatus } from "@/components/StatusBadge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CalendarPlus, Pencil, Trash2, RotateCcw, Image, Film } from "lucide-react";
import { PipelineEmptyState } from "@/components/PipelineEmptyState";

type Mode = "manual" | "aprovar";
type Media = "image" | "reel";

interface FormState {
  id?: number;
  filename: string;
  theme: string;
  mode: Mode;
  mediaType: Media;
  scheduledLocal: string; // datetime-local string
  captionManual: string;
}

const EMPTY: FormState = {
  filename: "",
  theme: "",
  mode: "aprovar",
  mediaType: "image",
  scheduledLocal: "",
  captionManual: "",
};

function toLocalInput(ms?: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Calendar() {
  const utils = trpc.useUtils();
  const posts = trpc.posts.list.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [filter, setFilter] = useState<string>("all");

  const createMut = trpc.posts.create.useMutation({
    onSuccess: () => {
      utils.posts.list.invalidate();
      toast.success("Post criado");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.posts.update.useMutation({
    onSuccess: () => {
      utils.posts.list.invalidate();
      toast.success("Post atualizado");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = trpc.posts.remove.useMutation({
    onSuccess: () => {
      utils.posts.list.invalidate();
      toast.success("Post removido");
    },
    onError: (e) => toast.error(e.message),
  });
  const reactivateMut = trpc.posts.reactivate.useMutation({
    onSuccess: () => {
      utils.posts.list.invalidate();
      toast.success("Post reativado para Pendente");
    },
    onError: (e) => toast.error(e.message),
  });

  const list = posts.data ?? [];
  const filtered = useMemo(() => {
    if (filter === "all") return list;
    return list.filter((p) => p.status === filter);
  }, [list, filter]);

  function openCreate() {
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(p: (typeof list)[number]) {
    setForm({
      id: p.id,
      filename: p.filename,
      theme: p.theme ?? "",
      mode: (p.mode === "auto" ? "aprovar" : p.mode) as Mode,
      mediaType: p.mediaType as Media,
      scheduledLocal: toLocalInput(p.scheduledAt),
      captionManual: p.captionManual ?? "",
    });
    setOpen(true);
  }

  function submit() {
    if (!form.filename.trim()) {
      toast.error("Informe o nome do arquivo no Drive");
      return;
    }
    const scheduledAt = form.scheduledLocal ? new Date(form.scheduledLocal).getTime() : null;
    if (form.id) {
      updateMut.mutate({
        id: form.id,
        filename: form.filename.trim(),
        theme: form.theme || null,
        mode: form.mode,
        mediaType: form.mediaType,
        scheduledAt,
        captionManual: form.captionManual || null,
      });
    } else {
      createMut.mutate({
        filename: form.filename.trim(),
        theme: form.theme || undefined,
        mode: form.mode,
        mediaType: form.mediaType,
        scheduledAt,
        captionManual: form.captionManual || undefined,
      });
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Calendário Editorial
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Programe as artes da pasta <span className="font-mono text-primary">CybersecCAST</span>{" "}
              e acompanhe o status de cada publicação.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[200px] bg-card">
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Postado">Postado</SelectItem>
                <SelectItem value="Aguardando Aprovação">Aguardando Aprovação</SelectItem>
                <SelectItem value="Erro: Imagem Ausente">Erro: Imagem Ausente</SelectItem>
                <SelectItem value="Fluxo Parado">Fluxo Parado</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openCreate}>
              <CalendarPlus className="h-4 w-4" />
              Novo post
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {posts.isLoading ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : filtered.length === 0 ? (
              <div className="p-4">
                <PipelineEmptyState
                  title={filter !== "all" ? "Nenhum post com esse status" : "Seu calendário está vazio"}
                  description={
                    filter !== "all"
                      ? "Ajuste o filtro de status ou programe novos posts para preencher a esteira."
                      : "Programe a primeira arte da pasta CybersecCAST e o sistema cuida do resto: legenda, aprovação e publicar."
                  }
                  action={
                    <Button size="sm" onClick={openCreate}>
                      <CalendarPlus className="h-4 w-4" />
                      Novo post
                    </Button>
                  }
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Tema / Palavras-chave</TableHead>
                    <TableHead>Modo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Agendado</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {p.mediaType === "reel" ? (
                            <Film className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Image className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-mono text-xs">{p.filename}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <span className="line-clamp-1 text-sm text-muted-foreground">
                          {p.theme || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ModeBadge mode={p.mode} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.mediaType === "reel" ? "Reel" : "Imagem"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {p.scheduledAt ? new Date(p.scheduledAt).toLocaleString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status as PostStatus} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {(p.status === "Fluxo Parado" || p.status === "Erro: Imagem Ausente") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Reativar"
                              onClick={() => reactivateMut.mutate({ id: p.id })}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remover"
                            className="text-destructive hover:text-destructive"
                            onClick={() => removeMut.mutate({ id: p.id })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              {form.id ? "Editar post" : "Novo post"}
            </DialogTitle>
            <DialogDescription>
              O nome do arquivo deve corresponder exatamente à arte na pasta CybersecCAST.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do arquivo no Drive</Label>
              <Input
                placeholder="ex.: post-phishing.png"
                value={form.filename}
                onChange={(e) => setForm({ ...form, filename: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tema / Palavras-chave</Label>
              <Input
                placeholder="ex.: phishing e como se proteger"
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Modo da legenda</Label>
                <Select
                  value={form.mode}
                  onValueChange={(v) => setForm({ ...form, mode: v as Mode })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="aprovar">IA + Aprovação por e-mail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de mídia</Label>
                <Select
                  value={form.mediaType}
                  onValueChange={(v) => setForm({ ...form, mediaType: v as Media })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Imagem</SelectItem>
                    <SelectItem value="reel">Reel (vídeo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Data e hora de publicação</Label>
              <Input
                type="datetime-local"
                value={form.scheduledLocal}
                onChange={(e) => setForm({ ...form, scheduledLocal: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Legenda manual{" "}
                <span className="text-xs text-muted-foreground">
                  (prioridade máxima — se preenchida, ignora a IA)
                </span>
              </Label>
              <Textarea
                rows={4}
                placeholder="Deixe em branco para usar a IA (modo aprovar)…"
                value={form.captionManual}
                onChange={(e) => setForm({ ...form, captionManual: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="bg-card" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>
              {form.id ? "Salvar alterações" : "Criar post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
