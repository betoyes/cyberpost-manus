#!/usr/bin/env python3
"""
CybersecCAST AutoPost — EXECUTOR (braço Manus)
===============================================

Este script é o EXECUTOR do sistema. Ele NÃO decide nada sobre legenda nem
sobre quem deve postar — quem manda é o app web (o "cérebro"):

    https://cyberpost.manus.space

Fluxo (roda no agendamento Manus, Ter/Qui 8h e 17h, horário de Brasília):

  1. Pergunta ao app: "tem uma ordem pronta para postar?"  -> GET  /api/queue/next
  2. Se houver ordem, baixa a arte da pasta CybersecCAST no Google Drive (conector nativo).
  3. Faz upload da arte para uma URL pública (manus-upload-file).
  4. Gera o comando de postagem no Instagram (manus-mcp-cli create_instagram).
     -> O comando é salvo em /home/ubuntu/post_cmd_<postId>.sh para o agente Manus executar.
  5. Após postar, o agente reporta o resultado ao app -> POST /api/queue/report
     (também salvo como /home/ubuntu/report_cmd_<postId>.sh).

Regras importantes (garantidas pelo CÉREBRO, não por este script):
  - Só chega ordem aqui se a legenda for MANUAL (escrita por você) ou
    IA APROVADA por e-mail. Nada de IA sem aprovação chega até a postagem.
  - Apenas 1 post por execução (o mais antigo devido) — evita flood.
  - Post bloqueado (sem imagem / sem aprovação) NÃO avança a fila.

Variáveis de ambiente esperadas (definidas no agendamento Manus):
  - QUEUE_API_BASE   (opcional) base do app. Padrão: https://cyberpost.manus.space
  - QUEUE_API_TOKEN  (obrigatório) token compartilhado, igual ao secret do app.

Conectores nativos usados: Google Drive (gws), Instagram e Gmail (manus-mcp-cli).
"""

import json
import os
import subprocess
import sys
import urllib.request
import urllib.error
from datetime import datetime
from PIL import Image

# ----------------------------------------------------------------------------
# Configuração
# ----------------------------------------------------------------------------
QUEUE_API_BASE = os.environ.get("QUEUE_API_BASE", "https://cyberpost.manus.space").rstrip("/")
QUEUE_API_TOKEN = os.environ.get("QUEUE_API_TOKEN", "").strip()

# Pasta CybersecCAST no Google Drive (busca por nome do arquivo dentro dela).
CYBERSECCAST_FOLDER_ID = os.environ.get("CYBERSECCAST_FOLDER_ID", "1MIOVwStbFxHSjlteflfhnCKyUCYLGBgQ")

WORKDIR = "/home/ubuntu"


# ----------------------------------------------------------------------------
# Utilidades
# ----------------------------------------------------------------------------
def run_command(command_args, cwd=None):
    """Executa um comando shell e retorna stdout (texto)."""
    result = subprocess.run(command_args, check=True, capture_output=True, text=True, cwd=cwd)
    return result.stdout.strip()


def api_get(path):
    """GET autenticado na API do app (cérebro)."""
    url = f"{QUEUE_API_BASE}{path}"
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {QUEUE_API_TOKEN}")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def write_report_command(post_id, payload):
    """
    Salva o comando de callback (curl) que o agente Manus deve executar para
    reportar o resultado ao app. Mantemos como .sh para o agente rodar via shell,
    garantindo que o token nunca apareça em logs do app indevidamente.
    """
    body = json.dumps(payload)
    # Usamos uma here-string para evitar problemas de escaping com aspas.
    cmd = (
        f"curl -s -X POST '{QUEUE_API_BASE}/api/queue/report' "
        f"-H 'Authorization: Bearer {QUEUE_API_TOKEN}' "
        f"-H 'Content-Type: application/json' "
        f"-d '{body}'"
    )
    fname = os.path.join(WORKDIR, f"report_cmd_{post_id}.sh")
    with open(fname, "w") as f:
        f.write(cmd + "\n")
    print(f"[executor] Callback de resultado salvo em {fname}")
    return fname


# ----------------------------------------------------------------------------
# Google Drive: baixar a arte
# ----------------------------------------------------------------------------
def download_art(file_name, folder_id):
    """Baixa a arte da pasta CybersecCAST. Retorna (caminho_local, mime_type) ou (None, None)."""
    drive_query = f"name = '{file_name}' and '{folder_id}' in parents"
    search_params = json.dumps({"q": drive_query, "fields": "files(id, name, mimeType)"})
    output = run_command(["gws", "drive", "files", "list", "--params", search_params])
    files_data = json.loads(output)

    if not files_data.get("files"):
        print(f"[executor] AVISO: arquivo '{file_name}' não encontrado na pasta {folder_id}")
        return None, None

    file_id = files_data["files"][0]["id"]
    mime_type = files_data["files"][0]["mimeType"]

    extension = "." + mime_type.split("/")[-1] if "/" in mime_type else ""
    if file_name.endswith(extension):
        local_path = os.path.join(WORKDIR, file_name)
    else:
        local_path = os.path.join(WORKDIR, f"{file_name}{extension}")

    relative_output = os.path.basename(local_path)
    subprocess.run(
        [
            "gws", "drive", "files", "get",
            "--params", json.dumps({"fileId": file_id, "alt": "media"}),
            "--output", relative_output,
        ],
        check=True, capture_output=True, cwd=os.path.dirname(local_path),
    )

    if not os.path.exists(local_path):
        for f in os.listdir(os.path.dirname(local_path)):
            if file_name in f and f != os.path.basename(local_path):
                os.rename(os.path.join(os.path.dirname(local_path), f), local_path)
                break

    # PNG -> JPG para compatibilidade com o Instagram.
    if local_path.lower().endswith(".png"):
        img = Image.open(local_path)
        rgb_im = img.convert("RGB")
        new_path = local_path.rsplit(".", 1)[0] + ".jpg"
        rgb_im.save(new_path)
        os.remove(local_path)
        local_path = new_path
        mime_type = "image/jpeg"
        print(f"[executor] Imagem convertida para JPG: {local_path}")

    return local_path, mime_type


def upload_media_to_public(local_file_path):
    """Faz upload da mídia e retorna a URL pública (manus-upload-file)."""
    output = run_command(["manus-upload-file", local_file_path])
    for line in output.split("\n"):
        if line.startswith("CDN URL:"):
            return line.split("CDN URL:")[1].strip()
    return output.strip()


def write_instagram_command(post_id, public_media_url, caption, mime_type):
    """Salva o comando manus-mcp-cli de postagem para o agente executar."""
    media_type = "image" if "image" in (mime_type or "") else "video"
    ig_input = {
        "type": "reels" if media_type == "video" else "post",
        "caption": caption,
        "media": [{"media_url": public_media_url, "type": media_type}],
    }
    cmd = (
        "manus-mcp-cli tool call create_instagram --server instagram "
        f"--input '{json.dumps(ig_input)}'"
    )
    fname = os.path.join(WORKDIR, f"post_cmd_{post_id}.sh")
    with open(fname, "w") as f:
        f.write(cmd + "\n")
    print(f"[executor] Comando de postagem salvo em {fname}")
    return fname


# ----------------------------------------------------------------------------
# Fluxo principal
# ----------------------------------------------------------------------------
def main():
    print("=== CybersecCAST AutoPost — EXECUTOR ===")
    if not QUEUE_API_TOKEN:
        print("[executor] ERRO: variável QUEUE_API_TOKEN não definida. Aborte e configure o token.")
        sys.exit(1)

    # 1. Pergunta ao cérebro se há ordem pronta.
    try:
        data = api_get("/api/queue/next")
    except urllib.error.HTTPError as e:
        print(f"[executor] ERRO HTTP ao consultar a fila: {e.code} {e.reason}")
        sys.exit(1)
    except Exception as e:
        print(f"[executor] ERRO ao consultar a fila: {e}")
        sys.exit(1)

    order = data.get("order")
    if not order:
        blocked = data.get("blocked")
        if blocked:
            print(f"[executor] Post bloqueado no cérebro (postId={blocked.get('postId')}): {blocked.get('reason')}")
            print("[executor] Nada a postar agora. A fila NÃO avança até resolver o bloqueio.")
        else:
            print("[executor] Nenhuma ordem pronta para esta janela. Nada a fazer.")
        return

    post_id = order["postId"]
    filename = order["filename"]
    caption = order["caption"]
    media_type_hint = order.get("mediaType", "image")
    print(f"[executor] Ordem recebida: postId={post_id}, arquivo='{filename}', tipo='{media_type_hint}'")

    # 2. Baixa a arte do Drive.
    try:
        local_path, mime_type = download_art(filename, CYBERSECCAST_FOLDER_ID)
    except Exception as e:
        print(f"[executor] ERRO ao baixar a arte: {e}")
        write_report_command(post_id, {"postId": post_id, "result": "error", "message": f"Falha no download da arte: {e}"})
        return

    if not local_path:
        # Imagem ausente -> reporta e NÃO avança a fila.
        print(f"[executor] Imagem '{filename}' ausente no Drive. Reportando ao cérebro.")
        write_report_command(post_id, {
            "postId": post_id,
            "result": "missing-image",
            "message": f"Arte '{filename}' não encontrada na pasta CybersecCAST.",
        })
        return

    # 3. Upload público.
    try:
        public_url = upload_media_to_public(local_path)
        print(f"[executor] Mídia pública em: {public_url}")
    except Exception as e:
        print(f"[executor] ERRO no upload público: {e}")
        write_report_command(post_id, {"postId": post_id, "result": "error", "message": f"Falha no upload: {e}"})
        return

    # 4. Comando de postagem (o agente Manus executa o .sh).
    write_instagram_command(post_id, public_url, caption, mime_type)

    # 5. Comando de callback de sucesso (o agente preenche o permalink após postar).
    #    O agente deve substituir PERMALINK_AQUI pelo link retornado pelo Instagram.
    write_report_command(post_id, {
        "postId": post_id,
        "result": "posted",
        "permalink": "PERMALINK_AQUI",
        "imageUrl": public_url,
    })

    # Limpeza do arquivo temporário.
    try:
        os.remove(local_path)
    except OSError:
        pass

    print("\n--- INSTRUÇÕES PARA O AGENTE MANUS ---")
    print(f"1) Execute o comando em /home/ubuntu/post_cmd_{post_id}.sh para POSTAR no Instagram.")
    print("2) Pegue o permalink retornado pelo Instagram.")
    print(f"3) Edite /home/ubuntu/report_cmd_{post_id}.sh, troque PERMALINK_AQUI pelo link real,")
    print("   e execute para REPORTAR o sucesso ao app (status 'Postado').")
    print("4) Se a postagem falhar, reporte 'error' com a mensagem ao app.")
    print("5) Apague os arquivos .sh processados.")
    print("--------------------------------------")


if __name__ == "__main__":
    main()
