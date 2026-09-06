import type { Transferencia, TransferenciaCriada } from "../types/transferencia.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

export async function listarMinhasTransferencias(): Promise<Transferencia[]> {
  const response = await fetch("/api/transferencia-arquivos/minhas");
  const body: ApiEnvelope<Transferencia[]> = await response.json();
  return body.data ?? [];
}

export async function excluirTransferencia(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/transferencia-arquivos/minhas/${id}`, { method: "DELETE" });
  return response.json();
}

export async function editarExpiracaoTransferencia(
  id: string,
  dados: { duracaoQuantidade: number; duracaoUnidade: "horas" | "dias" }
): Promise<ApiEnvelope<Transferencia>> {
  const response = await fetch(`/api/transferencia-arquivos/minhas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return response.json();
}

export async function expirarTransferenciaAgora(id: string): Promise<ApiEnvelope<Transferencia>> {
  const response = await fetch(`/api/transferencia-arquivos/minhas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expirarAgora: true }),
  });
  return response.json();
}

export async function reenviarLinkTransferencia(id: string): Promise<ApiEnvelope<Transferencia>> {
  const response = await fetch(`/api/transferencia-arquivos/minhas/${id}/reenviar`, {
    method: "POST",
  });
  return response.json();
}

export interface DadosEnvioTransferencia {
  arquivos: File[];
  duracaoQuantidade: number;
  duracaoUnidade: "horas" | "dias";
  mensagem: string;
  enviarEmail: boolean;
  destinatarioEmail: string;
  onProgresso?: (percentual: number) => void;
}

/*
 * Único upload do portal feito via `XMLHttpRequest` em vez de
 * `fetch` — é o único jeito padrão de ter progresso real de upload no
 * navegador (fetch não expõe isso), necessário aqui porque os arquivos
 * podem ser bem grandes. Os campos de metadado são anexados ao
 * FormData ANTES dos arquivos de propósito: a ordem de `append()` é
 * preservada na codificação multipart, e a rota do servidor só começa
 * a gravar o primeiro arquivo depois de já ter lido (e validado) os
 * campos anteriores.
 */
export function enviarTransferencia(
  dados: DadosEnvioTransferencia
): Promise<ApiEnvelope<TransferenciaCriada>> {
  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append("duracaoQuantidade", String(dados.duracaoQuantidade));
    formData.append("duracaoUnidade", dados.duracaoUnidade);
    formData.append("mensagem", dados.mensagem);
    formData.append("enviarEmail", String(dados.enviarEmail));
    formData.append("destinatarioEmail", dados.destinatarioEmail);
    for (const arquivo of dados.arquivos) {
      formData.append("arquivo", arquivo);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/transferencia-arquivos/upload");

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        dados.onProgresso?.(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({ ok: false, message: "Resposta inválida do servidor." });
      }
    });

    xhr.addEventListener("error", () => {
      resolve({ ok: false, message: "Falha de conexão durante o envio." });
    });

    xhr.send(formData);
  });
}
