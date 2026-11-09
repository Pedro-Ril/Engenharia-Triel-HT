import type { PerfilTempo } from "@/lib/tempos-maquina/tipos";

import type { MaquinaTempo, MaterialTempo, MetodoTempo, PerfilTempoCadastro } from "../types/temposMaquina.types";

/* Painel admin "Tempos de Máquina" (rotas /api/admin/tempos-maquina/**). */

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json().catch(() => ({ ok: false, message: `Erro ${response.status} no servidor.` }));
}

async function enviar<T>(url: string, method: string, corpo?: unknown): Promise<ApiEnvelope<T>> {
  try {
    const response = await fetch(url, {
      method,
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
    });
    return parseResponse<T>(response);
  } catch {
    return { ok: false, message: "Sem conexão com o Portal." };
  }
}

const BASE = "/api/admin/tempos-maquina";

export const listarPerfisTempo = () => enviar<PerfilTempoCadastro[]>(`${BASE}/perfis`, "GET");

export const criarPerfilTempo = (dados: { nome: string; metodo: MetodoTempo; parametros: unknown; observacao: string | null }) =>
  enviar<PerfilTempoCadastro>(`${BASE}/perfis`, "POST", dados);

export const atualizarPerfilTempo = (
  id: string,
  dados: { nome?: string; parametros?: PerfilTempo | unknown; observacao?: string | null; ativo?: boolean }
) => enviar<PerfilTempoCadastro>(`${BASE}/perfis/${id}`, "PATCH", dados);

export const excluirPerfilTempo = (id: string) => enviar<null>(`${BASE}/perfis/${id}`, "DELETE");

export const listarMaquinasTempo = () => enviar<MaquinaTempo[]>(`${BASE}/maquinas`, "GET");

export const definirPerfilDaMaquina = (dados: { codRecurso: string; descRecurso: string | null; perfilId: string | null }) =>
  enviar<MaquinaTempo[]>(`${BASE}/maquinas`, "PUT", dados);

export const listarMateriaisTempo = () => enviar<MaterialTempo[]>(`${BASE}/materiais`, "GET");

export const salvarMaterialTempo = (id: string | null, dados: Omit<MaterialTempo, "id">) =>
  enviar<MaterialTempo>(id ? `${BASE}/materiais/${id}` : `${BASE}/materiais`, id ? "PATCH" : "POST", dados);

export const excluirMaterialTempo = (id: string) => enviar<null>(`${BASE}/materiais/${id}`, "DELETE");

/* Máquinas ativas do ERP (todas as do centro de trabalho, como no cadastro de operação do Roteiro). */
export type RecursoErp = {
  COD_RECURSO: string;
  DESC_RECURSO: string | null;
  COD_CENTRO_TRAB: string | null;
  DESC_CENTRO_TRAB: string | null;
};

const API_RECURSOS_ERP = "http://proserver.trielht.com.br:1000/api/v2/recursos?cod_emp=2";

export async function listarRecursosErp(): Promise<{ ok: true; data: RecursoErp[] } | { ok: false; message: string }> {
  try {
    const response = await fetch(API_RECURSOS_ERP, { cache: "no-store" });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) return { ok: false, message: json?.message || "O ERP não devolveu as máquinas." };
    return { ok: true, data: Array.isArray(json.data) ? (json.data as RecursoErp[]) : [] };
  } catch {
    return { ok: false, message: "Sem conexão com a API do ERP." };
  }
}
