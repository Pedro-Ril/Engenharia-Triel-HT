import "server-only";

import { NextResponse } from "next/server";

import { cabecalhoUsuarioErp } from "@/lib/erp/usuario-erp";

/*
 * Gravações do Roteiro de Fabricação no ERP (API Oracle v2), feitas pelo
 * servidor do Portal em nome do usuário logado -- o ERP registra quem fez
 * (X-Usuario-Portal) em vez de "API". A resposta do ERP volta para a tela
 * como veio (status e JSON), então as telas não mudam.
 */
const API_ROTEIRO_V2 = "http://proserver.trielht.com.br:1000/api/v2/roteiro";

export type CaminhoRoteiroErp = "importar" | "importar/validar" | "operacao" | "";

export async function encaminharRoteiroErp(params: {
  caminho: CaminhoRoteiroErp;
  metodo: "POST" | "DELETE";
  corpo: unknown;
  samAccountName: string;
}): Promise<{ resposta: NextResponse; status: number; json: Record<string, unknown> | null }> {
  const url = params.caminho ? `${API_ROTEIRO_V2}/${params.caminho}` : API_ROTEIRO_V2;
  let status: number;
  let json: Record<string, unknown> | null;
  try {
    const r = await fetch(url, {
      method: params.metodo,
      headers: { "Content-Type": "application/json", ...cabecalhoUsuarioErp(params.samAccountName) },
      body: JSON.stringify(params.corpo ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
    });
    status = r.status;
    json = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  } catch (erro) {
    console.error("Erro ao falar com a API do ERP (roteiro):", erro);
    status = 502;
    json = { success: false, message: "Não foi possível falar com a API do ERP. Tente novamente." };
  }
  return { resposta: NextResponse.json(json ?? { success: false, message: `O ERP respondeu ${status}.` }, { status }), status, json };
}
