import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  ScrollText,
  MailQuestion,
} from "lucide-react";

const ICONS: Record<string, { icon: React.ElementType; className: string }> = {
  success: { icon: CheckCircle2, className: "text-chart-3" },
  info: { icon: Info, className: "text-chart-2" },
  warning: { icon: AlertTriangle, className: "text-chart-4" },
  error: { icon: XCircle, className: "text-destructive" },
  approval: { icon: MailQuestion, className: "text-chart-4" },
};

export default function Logs() {
  const logs = trpc.logs.list.useQuery();
  const list = logs.data ?? [];

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Logs de Atividade</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Histórico de eventos do sistema: publicações, aprovações, alertas e bloqueios.
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            {logs.isLoading ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : list.length === 0 ? (
              <div className="cc-grid relative overflow-hidden rounded-xl px-6 py-16">
                <div className="cc-signal pointer-events-none absolute inset-0 opacity-60" aria-hidden />
                <div className="relative flex flex-col items-center gap-3 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-xl border border-primary/30 bg-card">
                    <ScrollText className="h-5 w-5 text-primary" />
                  </div>
                  <p className="font-display text-base font-semibold">Sem eventos por enquanto</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Publicações, aprovações, alertas de imagem ausente e bloqueios aparecerão aqui
                    assim que a esteira começar a rodar.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((l) => {
                  const cfg = ICONS[l.kind] ?? ICONS.info;
                  const Icon = cfg.icon;
                  return (
                    <li key={l.id} className="flex items-start gap-3 px-5 py-4">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.className}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{l.message}</p>
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
