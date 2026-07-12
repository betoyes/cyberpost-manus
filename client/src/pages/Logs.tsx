import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  ScrollText,
  MailQuestion,
  Sparkles,
  Send,
  Search,
} from "lucide-react";

/** Categoria semântica de um evento — dá cor, ícone e rótulo humano ao `kind`. */
type Tone = "success" | "error" | "warning" | "info" | "neutral";

const KIND: Record<
  string,
  { label: string; tone: Tone; icon: React.ElementType }
> = {
  posted: { label: "Publicado", tone: "success", icon: CheckCircle2 },
  reativado: { label: "Reativado", tone: "success", icon: CheckCircle2 },
  error: { label: "Erro", tone: "error", icon: XCircle },
  halt: { label: "Bloqueio", tone: "error", icon: XCircle },
  warning: { label: "Alerta", tone: "warning", icon: AlertTriangle },
  approval: { label: "Aprovação", tone: "info", icon: MailQuestion },
  ia: { label: "IA", tone: "info", icon: Sparkles },
  bridge: { label: "Ponte", tone: "info", icon: Send },
  config: { label: "Config", tone: "neutral", icon: Info },
  criado: { label: "Criado", tone: "neutral", icon: Info },
  editado: { label: "Editado", tone: "neutral", icon: Info },
  disparo: { label: "Disparo", tone: "neutral", icon: Send },
  priorizado: { label: "Priorizado", tone: "neutral", icon: Info },
  manual: { label: "Manual", tone: "neutral", icon: Info },
  info: { label: "Info", tone: "neutral", icon: Info },
};

const TONE_ICON: Record<Tone, string> = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  info: "text-primary",
  neutral: "text-muted-foreground",
};

const TONE_CHIP: Record<Tone, string> = {
  success: "bg-success/12 text-success ring-success/25",
  error: "bg-destructive/12 text-destructive ring-destructive/25",
  warning: "bg-warning/12 text-warning ring-warning/25",
  info: "bg-primary/12 text-primary ring-primary/25",
  neutral: "bg-muted text-muted-foreground ring-border",
};

/** Filtros de topo — agrupam vários `kind` numa categoria acionável. */
const FILTERS: { key: string; label: string; match: (k: string) => boolean }[] =
  [
    { key: "all", label: "Todos", match: () => true },
    { key: "posted", label: "Publicações", match: (k) => k === "posted" },
    {
      key: "problem",
      label: "Erros / Bloqueios",
      match: (k) => k === "error" || k === "halt" || k === "warning",
    },
    { key: "approval", label: "Aprovações", match: (k) => k === "approval" },
    {
      key: "system",
      label: "Sistema",
      match: (k) =>
        !["posted", "error", "halt", "warning", "approval"].includes(k),
    },
  ];

function cfgFor(kind: string) {
  return KIND[kind] ?? KIND.info;
}

export default function Logs() {
  const logs = trpc.logs.list.useQuery();
  const accounts = trpc.accounts.list.useQuery();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  // Mapa IG User ID -> nome da conta, pra trocar o id cru pelo nome legível.
  const idToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts.data ?? []) {
      if (a.igUserId) m.set(a.igUserId, a.name);
    }
    return m;
  }, [accounts.data]);

  const humanize = (message: string | null) => {
    let out = message ?? "";
    idToName.forEach((name, id) => {
      out = out.split(id).join(name);
    });
    return out;
  };

  const list = logs.data ?? [];
  const activeFilter =
    FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const q = query.trim().toLowerCase();
  const filtered = list.filter((l) => {
    if (!activeFilter.match(l.kind)) return false;
    if (q && !humanize(l.message).toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Logs de Atividade
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Histórico de eventos do sistema: publicações, aprovações, alertas e
            bloqueios.
          </p>
        </div>

        {/* Filtros + busca */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? "default" : "outline"}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <div className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nos eventos…"
              className="pl-9"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {logs.isLoading ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Carregando…
              </p>
            ) : list.length === 0 ? (
              <div className="cc-grid relative overflow-hidden rounded-xl px-6 py-16">
                <div
                  className="cc-signal pointer-events-none absolute inset-0 opacity-60"
                  aria-hidden
                />
                <div className="relative flex flex-col items-center gap-3 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-xl border border-primary/30 bg-card">
                    <ScrollText className="h-5 w-5 text-primary" />
                  </div>
                  <p className="font-display text-base font-semibold">
                    Sem eventos por enquanto
                  </p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Publicações, aprovações, alertas de imagem ausente e
                    bloqueios aparecerão aqui assim que a esteira começar a
                    rodar.
                  </p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Nenhum evento para este filtro.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((l) => {
                  const cfg = cfgFor(l.kind);
                  const Icon = cfg.icon;
                  return (
                    <li
                      key={l.id}
                      className="flex items-start gap-3 px-5 py-4"
                    >
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_ICON[cfg.tone]}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONE_CHIP[cfg.tone]}`}
                          >
                            {cfg.label}
                          </span>
                          <p className="min-w-0 flex-1 break-words text-sm">
                            {humanize(l.message)}
                          </p>
                        </div>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {new Date(l.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
