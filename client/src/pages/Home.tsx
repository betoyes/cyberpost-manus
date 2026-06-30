import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, type PostStatus } from "@/components/StatusBadge";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  Clock,
  MailQuestion,
  OctagonX,
  ArrowRight,
  ShieldCheck,
  Plug,
} from "lucide-react";
import { PipelineEmptyState } from "@/components/PipelineEmptyState";

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  tone: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${tone}`} />
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [, navigate] = useLocation();
  const posts = trpc.posts.list.useQuery();
  const config = trpc.config.get.useQuery();

  const list = posts.data ?? [];
  const count = (s: PostStatus) => list.filter((p) => p.status === s).length;

  const upcoming = [...list]
    .filter((p) => p.status === "Pendente" || p.status === "Aguardando Aprovação")
    .slice(0, 5);

  const flags = config.data?.flags;

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl space-y-8">
        {/* Hero */}
        <div className="cc-signal relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5 p-8">
          <div className="cc-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
            aria-hidden
          />
          <div className="relative">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span className="font-mono text-xs uppercase tracking-widest">CybersecCAST AutoPost</span>
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">
            Painel de Automação Editorial
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Gerencie o calendário, acompanhe o status de cada publicação e mantenha o fluxo de
            postagens no Instagram sob controle — com aprovação por e-mail e checagem automática
            diária.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => navigate("/calendar")}>
              Abrir Calendário
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="bg-card" onClick={() => navigate("/integrations")}>
              <Plug className="h-4 w-4" />
              Integrações
            </Button>
          </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Pendentes" value={count("Pendente")} icon={Clock} tone="bg-chart-2" />
          <StatCard label="Postados" value={count("Postado")} icon={CheckCircle2} tone="bg-chart-3" />
          <StatCard
            label="Aguardando Aprovação"
            value={count("Aguardando Aprovação")}
            icon={MailQuestion}
            tone="bg-chart-4"
          />
          <StatCard
            label="Fluxos Parados"
            value={count("Fluxo Parado") + count("Erro: Imagem Ausente")}
            icon={OctagonX}
            tone="bg-destructive"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Upcoming */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-display text-lg">Próximas publicações</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/calendar")}>
                Ver todas
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {posts.isLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
              ) : upcoming.length === 0 ? (
                <PipelineEmptyState
                  title="Nenhuma publicação na fila"
                  description="Cada arte percorre este fluxo até o ar. Programe um post no Calendário Editorial para iniciar a esteira."
                  action={
                    <Button size="sm" onClick={() => navigate("/calendar")}>
                      Programar publicação
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-border">
                  {upcoming.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.filename}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.theme || "Sem tema"} ·{" "}
                          <span className="cc-meta">
                            {p.scheduledAt
                              ? new Date(p.scheduledAt).toLocaleString("pt-BR")
                              : "Sem data"}
                          </span>
                        </p>
                      </div>
                      <StatusBadge status={p.status as PostStatus} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Integration health */}
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Saúde das integrações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <HealthRow label="Google (Drive/Sheets/Gmail)" ok={flags?.googleConnected} />
              <HealthRow label="Instagram (Meta Graph)" ok={flags?.metaConnected} />
              <HealthRow label="Planilha configurada" ok={flags?.sheetConfigured} />
              <HealthRow label="Checagem diária ativa" ok={flags?.cronEnabled} />
              <Button
                variant="outline"
                className="mt-2 w-full bg-card"
                size="sm"
                onClick={() => navigate("/integrations")}
              >
                Gerenciar conexões
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function HealthRow({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
      <span className="text-sm">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
          ok ? "text-chart-3" : "text-muted-foreground"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${ok ? "bg-chart-3 shadow-[0_0_8px] shadow-chart-3/60" : "bg-muted-foreground/40"}`}
        />
        {ok ? "Conectado" : "Pendente"}
      </span>
    </div>
  );
}
