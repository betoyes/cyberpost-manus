import { useSearch } from "wouter";
import { CheckCircle, XCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ApprovalConfirm() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const postId = params.get("postId") ?? "";
  const token = params.get("token") ?? "";
  const decision = params.get("decision") ?? "";

  const isApprove = decision === "approve";
  const isReject = decision === "reject";
  const isValid = (isApprove || isReject) && postId && token;

  const actionUrl = isValid
    ? `/api/approval/${encodeURIComponent(postId)}/${encodeURIComponent(token)}?decision=${decision}`
    : null;

  if (!isValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Link inválido</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Este link é inválido ou está incompleto. Verifique o e-mail
            original.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="font-display">
            {isApprove ? "Aprovar legenda" : "Reprovar legenda"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            {isApprove
              ? "Você está prestes a aprovar a legenda gerada por IA. O post voltará para a fila e será publicado na próxima execução."
              : "Você está prestes a reprovar a legenda gerada por IA. O fluxo será parado e você poderá editar a legenda manualmente no painel."}
          </p>
          <p className="text-xs text-muted-foreground">
            Esta ação é irreversível. O link expirará após o uso.
          </p>
          {/* Button navigates to the API action endpoint — server processes and redirects to /aprovacao */}
          <Button
            className="w-full"
            variant={isApprove ? "default" : "destructive"}
            onClick={() => {
              window.location.href = actionUrl!;
            }}
          >
            {isApprove ? (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Confirmar aprovação
              </>
            ) : (
              <>
                <XCircle className="mr-2 h-4 w-4" />
                Confirmar reprovação
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
