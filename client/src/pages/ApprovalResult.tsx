import { useSearch } from "wouter";
import { CheckCircle, XCircle, AlertCircle, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Status = "approved" | "rejected" | "error";

const CONFIG: Record<Status, { icon: React.ElementType; iconClass: string; bgClass: string; title: string }> = {
  approved: {
    icon: CheckCircle,
    iconClass: "text-green-600",
    bgClass: "bg-green-600/10",
    title: "Legenda aprovada!",
  },
  rejected: {
    icon: XCircle,
    iconClass: "text-destructive",
    bgClass: "bg-destructive/10",
    title: "Legenda reprovada",
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-yellow-500",
    bgClass: "bg-yellow-500/10",
    title: "Link inválido ou já usado",
  },
};

const REASON_MESSAGES: Record<string, string> = {
  "invalid-token": "Este link já foi usado ou expirou. Acesse o painel para gerenciar o post.",
  "invalid-request": "O link está malformado. Verifique o e-mail original.",
  "server-error": "Erro interno ao processar a ação. Tente novamente ou acesse o painel.",
};

export default function ApprovalResult() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const rawStatus = params.get("status") ?? "error";
  const status: Status = ["approved", "rejected", "error"].includes(rawStatus)
    ? (rawStatus as Status)
    : "error";
  const file = params.get("file") ?? "";
  const reason = params.get("reason") ?? "";

  const cfg = CONFIG[status];
  const Icon = cfg.icon;

  const bodyText =
    status === "approved"
      ? `"${file}" foi aprovada e voltou para a fila de publicação. Será publicada na próxima execução do executor.`
      : status === "rejected"
      ? `"${file}" foi reprovada. Acesse o painel para editar a legenda manualmente e reativar o post.`
      : (REASON_MESSAGES[reason] ?? "Ocorreu um erro inesperado.");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className={`mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full ${cfg.bgClass}`}>
            <Icon className={`h-6 w-6 ${cfg.iconClass}`} />
          </div>
          <CardTitle className="font-display">{cfg.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{bodyText}</p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { window.location.href = "/"; }}
          >
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Abrir painel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
