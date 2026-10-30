import type { RoteiroItem } from "../types/cadastroRoteiro.types";
import { mudancasAlemDaRevisao, roteiroExistenteParaPayload, type PlanoErp } from "../utils/roteiro-payload";
import { buscarRoteiroCompletoErp } from "./cadastroRoteiro.service";

/*
 * "Roteiro continua válido": a revisão do item mudou no 3DX, mas o
 * roteiro não precisa mudar. Reenvia ao ERP as operações como estão,
 * só com a revisão nova -- primeiro simula (validar), e só grava se o
 * plano não mexer em mais nada além da revisão.
 */

/* Pelo servidor do Portal: o ERP registra o usuário logado (X-Usuario-Portal) em vez de "API". */
const API_VALIDAR_ROTEIRO = "/api/cadastro-roteiro/erp/importar?validar=1";
const API_IMPORTAR_ROTEIRO = "/api/cadastro-roteiro/erp/importar";
const COD_EMP = 2;

export type PayloadRevisao = {
  cod_emp: number;
  cod_item: string;
  roteiros: ReturnType<typeof roteiroExistenteParaPayload>[];
};

/* `retornoErp`: o que foi enviado e o que o ERP respondeu -- a tela mostra ao clicar no aviso, como no cadastro. */
export type RetornoRevisao = { enviado: PayloadRevisao; retorno: unknown };

export type PlanoRevisao =
  | { ok: true; payload: PayloadRevisao; operacoes: number }
  | { ok: false; mensagem: string; retornoErp?: RetornoRevisao };

export async function planejarAtualizacaoRevisao(codItem: string, revisaoNova: string): Promise<PlanoRevisao> {
  const atual = await buscarRoteiroCompletoErp(codItem);
  if (!atual.ok) return { ok: false, mensagem: atual.mensagem };
  if (atual.roteiros.length === 0) {
    return { ok: false, mensagem: "Este item não tem operações no ERP: não há roteiro para validar." };
  }

  const payload: PayloadRevisao = {
    cod_emp: COD_EMP,
    cod_item: codItem,
    roteiros: atual.roteiros.map((roteiro: RoteiroItem) => roteiroExistenteParaPayload(roteiro, revisaoNova)),
  };

  try {
    const response = await fetch(API_VALIDAR_ROTEIRO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const plano = (await response.json().catch(() => null)) as PlanoErp | null;

    if (!plano) return { ok: false, mensagem: `O ERP não respondeu à validação (HTTP ${response.status}).` };
    if (!response.ok || !plano.success) {
      return { ok: false, mensagem: plano.message || "O ERP recusou o roteiro.", retornoErp: { enviado: payload, retorno: plano } };
    }

    const alem = mudancasAlemDaRevisao(plano);
    if (alem.length > 0) {
      return {
        ok: false,
        mensagem: `O ERP mudaria mais do que a revisão (${alem.join("; ")}). Revise as operações pelo cadastro em vez de validar.`,
        retornoErp: { enviado: payload, retorno: plano },
      };
    }

    return { ok: true, payload, operacoes: payload.roteiros.length };
  } catch {
    return { ok: false, mensagem: "Sem comunicação com a API do ERP." };
  }
}

export async function gravarAtualizacaoRevisao(
  payload: PayloadRevisao
): Promise<{ ok: true; retornoErp: RetornoRevisao } | { ok: false; mensagem: string; retornoErp?: RetornoRevisao }> {
  try {
    const response = await fetch(API_IMPORTAR_ROTEIRO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await response.json().catch(() => null)) as { success?: boolean; message?: string; error?: string } | null;

    const retornoErp = { enviado: payload, retorno: json };
    if (!response.ok || !json?.success) {
      return { ok: false, mensagem: json?.message || json?.error || "O ERP não gravou a revisão.", retornoErp };
    }
    return { ok: true, retornoErp };
  } catch {
    return { ok: false, mensagem: "Sem comunicação com a API do ERP." };
  }
}

/* Guarda no Portal quem validou (o ERP só fica com a revisão nova). */
export async function registrarValidacaoRevisao(dados: {
  codItem: string;
  revisaoAnterior: string;
  revisaoNova: string;
  comentarioRevisao: string | null;
  operacoes: number;
}): Promise<boolean> {
  try {
    const response = await fetch("/api/cadastro-roteiro/validacoes-revisao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    return response.ok;
  } catch {
    return false;
  }
}
