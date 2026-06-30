import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star } from "lucide-react";

interface FormState {
  id?: number;
  name: string;
  handle: string;
  igUserId: string;
}

const EMPTY: FormState = { name: "", handle: "", igUserId: "" };

export default function Accounts() {
  const utils = trpc.useUtils();
  const accounts = trpc.accounts.list.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const createMut = trpc.accounts.create.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Conta criada"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const updateMut = trpc.accounts.update.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Conta atualizada"); setOpen(false); },
    onError: e => toast.error(e.message),
  });
  const removeMut = trpc.accounts.remove.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Conta removida"); },
    onError: e => toast.error(e.message),
  });
  const setDefaultMut = trpc.accounts.setDefault.useMutation({
    onSuccess: () => { utils.accounts.list.invalidate(); toast.success("Conta padrão definida"); },
    onError: e => toast.error(e.message),
  });

  const list = accounts.data ?? [];

  function openCreate() { setForm(EMPTY); setOpen(true); }
  function openEdit(a: (typeof list)[number]) {
    setForm({ id: a.id, name: a.name, handle: a.handle ?? "", igUserId: a.igUserId ?? "" });
    setOpen(true);
  }

  function submit() {
    if (!form.name.trim()) { toast.error("Informe o nome da conta"); return; }
    const payload = {
      name: form.name.trim(),
      handle: form.handle.trim() || undefined,
      igUserId: form.igUserId.trim() || undefined,
    };
    if (form.id) {
      updateMut.mutate({ id: form.id, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Contas do Instagram
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gerencie as contas disponíveis para publicação. A conta marcada
              como padrão <span className="text-yellow-500">★</span> é usada
              quando um post não especifica uma conta.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nova conta
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {accounts.isLoading ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Carregando…
              </p>
            ) : list.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Nenhuma conta cadastrada. Clique em{" "}
                <button
                  onClick={openCreate}
                  className="text-primary underline underline-offset-4"
                >
                  Nova conta
                </button>{" "}
                para começar.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nome</TableHead>
                    <TableHead>@handle</TableHead>
                    <TableHead>IG User ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {a.isDefault && (
                            <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                          )}
                          {a.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {a.handle ? `@${a.handle}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {a.igUserId || "—"}
                      </TableCell>
                      <TableCell>
                        {a.active ? (
                          <Badge variant="outline" className="text-green-600 border-green-600/30">
                            Ativa
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inativa
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {!a.isDefault && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Definir como padrão"
                              onClick={() => setDefaultMut.mutate({ id: a.id })}
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar"
                            onClick={() => openEdit(a)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remover"
                            className="text-destructive hover:text-destructive"
                            onClick={() => removeMut.mutate({ id: a.id })}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {form.id ? "Editar conta" : "Nova conta"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome da conta</Label>
              <Input
                placeholder="ex.: CybersecCAST"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                @handle{" "}
                <span className="text-xs text-muted-foreground">(sem o @)</span>
              </Label>
              <Input
                placeholder="ex.: cyberseccast"
                value={form.handle}
                onChange={e => setForm({ ...form, handle: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Instagram User ID{" "}
                <span className="text-xs text-muted-foreground">
                  (opcional — preenchido pelo Manus ao conectar)
                </span>
              </Label>
              <Input
                placeholder="ex.: 17841400000000000"
                value={form.igUserId}
                onChange={e => setForm({ ...form, igUserId: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-card" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {form.id ? "Salvar" : "Criar conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
