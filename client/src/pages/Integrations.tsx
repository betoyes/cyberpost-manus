import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plug, ShieldCheck, Instagram, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";

function ConnectionPill({ ok }: { ok?: boolean }) {
  return ok ? (
    <Badge className="gap-1 bg-chart-3/15 text-chart-3 ring-1 ring-inset ring-chart-3/30 hover:bg-chart-3/15">
      <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
    </Badge>
  ) : (
    <Badge className="gap-1 bg-muted text-muted-foreground hover:bg-muted">
      <AlertCircle className="h-3.5 w-3.5" /> Não conectado
    </Badge>
  );
}

export default function Integrations() {
  const utils = trpc.useUtils();
  const config = trpc.config.get.useQuery();
  const setMut = trpc.config.set.useMutation({
    onSuccess: () => utils.config.get.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const flags = config.data?.flags;
  const values = config.data?.values ?? {};

  const [igAccount, setIgAccount] = useState("");
  const [spreadsheet, setSpreadsheet] = useState("");

  async function save(key: string, value: string, label: string) {
    if (!value.trim()) {
      toast.error(`Informe ${label}`);
      return;
    }
    await setMut.mutateAsync({ key, value: value.trim() });
    toast.success(`${label} salvo`);
  }

  function startGoogleOAuth() {
    // Redirect to backend OAuth start endpoint; backend handles the rest.
    const origin = window.location.origin;
    window.location.href = `/api/integrations/google/start?origin=${encodeURIComponent(origin)}`;
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Integrações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Conecte o Google (Drive, Sheets e Gmail) e o Instagram (Meta Graph API) para habilitar a
            automação completa.
          </p>
        </div>

        {/* Google */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="font-display text-lg">Google Workspace</CardTitle>
                <CardDescription>Drive (artes) · Sheets (calendário) · Gmail (aprovação)</CardDescription>
              </div>
            </div>
            <ConnectionPill ok={flags?.googleConnected} />
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A autorização via OAuth concede acesso de leitura ao Drive e às planilhas, e de
              leitura/envio ao Gmail (para o fluxo de aprovação por e-mail). As credenciais do app
              (Client ID/Secret) são configuradas em Configurações.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={startGoogleOAuth}>
                <Plug className="h-4 w-4" />
                {flags?.googleConnected ? "Reautorizar Google" : "Conectar Google"}
              </Button>
              <Button
                variant="outline"
                className="bg-card"
                onClick={() => window.open("https://console.cloud.google.com/apis/credentials", "_blank")}
              >
                <ExternalLink className="h-4 w-4" />
                Google Cloud Console
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>ID da Planilha (Google Sheets)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={values.spreadsheet_id || "ID da planilha do calendário"}
                    value={spreadsheet}
                    onChange={(e) => setSpreadsheet(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => save("spreadsheet_id", spreadsheet, "ID da planilha")}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Pasta de artes</Label>
                <Input value={values.drive_folder_name || "CybersecCAST"} disabled className="opacity-70" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Instagram / Meta */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-chart-5/10 p-2.5">
                <Instagram className="h-5 w-5 text-chart-5" />
              </div>
              <div>
                <CardTitle className="font-display text-lg">Instagram (Meta Graph API)</CardTitle>
                <CardDescription>Publicação de imagens e Reels</CardDescription>
              </div>
            </div>
            <ConnectionPill ok={flags?.metaConnected} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Instagram Business Account ID</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={values.ig_account_id || "ex.: 17841400000000000"}
                    value={igAccount}
                    onChange={(e) => setIgAccount(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => save("ig_account_id", igAccount, "IG Account ID")}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Access Token (longa duração)</Label>
                <p className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                  {values.meta_access_token || "Configure em Configurações → Secrets"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="bg-card"
                onClick={() => window.open("https://developers.facebook.com/apps/", "_blank")}
              >
                <ExternalLink className="h-4 w-4" />
                Meta for Developers
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => config.refetch()}>
            <RefreshCw className="h-4 w-4" />
            Atualizar status
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
