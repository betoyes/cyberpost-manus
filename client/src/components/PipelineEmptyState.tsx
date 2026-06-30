import { HardDrive, Sparkles, MailCheck, Instagram, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

const STEPS = [
  { icon: HardDrive, label: "Drive", hint: "CybersecCAST" },
  { icon: Sparkles, label: "Legenda IA", hint: "ou manual" },
  { icon: MailCheck, label: "Aprovação", hint: "por e-mail" },
  { icon: Instagram, label: "Instagram", hint: "publicado" },
] as const;

/**
 * Branded empty/low-data state that renders the CybersecCAST automation pipeline
 * (Drive -> AI/manual caption -> email approval -> Instagram) as a visual cue,
 * instead of a bare icon + message. Used across Home, Calendar and Logs.
 */
export function PipelineEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="cc-grid relative overflow-hidden rounded-xl border border-dashed bg-muted/10 px-6 py-12">
      <div className="cc-signal pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
        {/* Pipeline */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center gap-1.5 sm:gap-3">
              <div className="flex flex-col items-center gap-2">
                <div className="grid h-12 w-12 place-items-center rounded-xl border border-primary/30 bg-card shadow-sm">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="leading-tight">
                  <p className="text-xs font-medium">{step.label}</p>
                  <p className="cc-meta text-[10px] text-muted-foreground">{step.hint}</p>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight className="mb-6 h-4 w-4 shrink-0 text-muted-foreground/50" />
              )}
            </div>
          ))}
        </div>

        <h3 className="mt-8 font-display text-lg font-semibold">{title}</h3>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
