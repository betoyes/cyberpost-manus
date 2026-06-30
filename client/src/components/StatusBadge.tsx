import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, MailQuestion, ImageOff, OctagonX } from "lucide-react";

export type PostStatus =
  | "Pendente"
  | "Postado"
  | "Aguardando Aprovação"
  | "Erro: Imagem Ausente"
  | "Fluxo Parado";

const MAP: Record<
  PostStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  Pendente: {
    label: "Pendente",
    icon: Clock,
    className: "bg-chart-2/15 text-chart-2 ring-1 ring-inset ring-chart-2/30",
  },
  Postado: {
    label: "Postado",
    icon: CheckCircle2,
    className: "bg-chart-3/15 text-chart-3 ring-1 ring-inset ring-chart-3/30",
  },
  "Aguardando Aprovação": {
    label: "Aguardando Aprovação",
    icon: MailQuestion,
    className: "bg-chart-4/15 text-chart-4 ring-1 ring-inset ring-chart-4/30",
  },
  "Erro: Imagem Ausente": {
    label: "Erro: Imagem Ausente",
    icon: ImageOff,
    className: "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/30",
  },
  "Fluxo Parado": {
    label: "Fluxo Parado",
    icon: OctagonX,
    className: "bg-destructive/20 text-destructive ring-1 ring-inset ring-destructive/40",
  },
};

export function StatusBadge({ status, className }: { status: PostStatus; className?: string }) {
  const cfg = MAP[status] ?? MAP["Pendente"];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        cfg.className,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {cfg.label}
    </span>
  );
}

const MODE_MAP: Record<string, { label: string; className: string }> = {
  manual: { label: "Manual", className: "bg-secondary text-secondary-foreground" },
  aprovar: { label: "IA + Aprovação", className: "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30" },
  auto: { label: "IA + Aprovação", className: "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30" },
};

export function ModeBadge({ mode, className }: { mode: string; className?: string }) {
  const cfg = MODE_MAP[mode] ?? MODE_MAP["manual"];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        cfg.className,
        className,
      )}
    >
      {cfg.label}
    </span>
  );
}
