import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Mail, Bot, Clock, ShieldAlert, Save } from "lucide-react";

export default function Settings() {
  const utils = trpc.useUtils();
  const config = trpc.config.get.useQuery();
  const setMut = trpc.config.set.useMutation({
    onSuccess: () => utils.config.get.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const values = config.data?.values ?? {};
  const flags = config.data?.flags;

  const [approvalEmail, setApprovalEmail] = useState("");
  const [llmModel, setLlmModel] = useState("");

  useEffect(() => {
    if (config.data) {
      setApprovalEmail(values.approval_email || "betoyes@gmail.com");
      setLlmModel(values.llm_model || "gpt-5-mini");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.data]);

  async function saveAll() {
    await setMut.mutateAsync({ key: "approval_email", value: approvalEmail.trim() });
    await setMut.mutateAsync({ key: "llm_model", value: llmModel.trim() });
    toast.success("Configurações salvas");
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Configurações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Defina o e-mail de aprovação, o modelo de IA para legendas e revise o agendamento.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="font-display text-lg">E-mail de aprovação e alertas</CardTitle>
                <CardDescription>
                  Para onde enviar legendas para aprovação e alertas de imagem ausente.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Endereço de e-mail</Label>
            <Input
              type="email"
              value={approvalEmail}
              onChange={(e) => setApprovalEmail(e.target.value)}
              placeholder="betoyes@gmail.com"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-chart-2/10 p-2.5">
                <Bot className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <CardTitle className="font-display text-lg">Geração de legenda (IA)</CardTitle>
                <CardDescription>Modelo usado para gerar legendas a partir do tema.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Modelo LLM</Label>
            <Input
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              placeholder="gpt-5-mini"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              O uso da IA consome créditos do projeto, apenas quando há um post a gerar — nunca nas
              checagens de rotina do cron.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-chart-4/10 p-2.5">
                <Clock className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <CardTitle className="font-display text-lg">Agendamento</CardTitle>
                <CardDescription>Checagem automática e alertas.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
              <span>Cron de verificação</span>
              <span className="font-mono text-muted-foreground">a cada 30 minutos</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
              <span>Alerta de imagem ausente</span>
              <span className="font-mono text-muted-foreground">a cada 6 horas</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
              <span>Status do cron</span>
              <span className={`font-medium ${flags?.cronEnabled ? "text-chart-3" : "text-muted-foreground"}`}>
                {flags?.cronEnabled ? "Ativo" : "Inativo (registrado após o deploy)"}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-start gap-3 rounded-xl border border-chart-4/30 bg-chart-4/5 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-chart-4" />
          <p className="text-sm text-muted-foreground">
            As credenciais sensíveis (tokens do Google e Meta) são armazenadas com segurança e
            exibidas mascaradas. Use a página de Integrações para reautorizar quando necessário.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveAll} disabled={setMut.isPending}>
            <Save className="h-4 w-4" />
            Salvar configurações
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
