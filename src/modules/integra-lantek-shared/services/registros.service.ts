/* Espelho de src/lib/integra-lantek/eventos.ts (registros da Integra Lantek, botão "Registros"). */

export type ModuloLantek = "agro" | "ve";
export type TipoEventoLantek = "pesquisa_erp" | "validacao_dxf" | "exportacao";

export interface EventoLantekResumo {
  id: string;
  modulo: ModuloLantek | null;
  tipo: TipoEventoLantek;
  sucesso: boolean;
  resumo: string;
  total: number | null;
  duracaoMs: number | null;
  usuarioNome: string | null;
  criadoEm: string;
  totalAlertas: number | null;
}

export interface ItemExportadoLantek {
  linha: number;
  numOrdem: string | null;
  numLote: string | null;
  codItem: string | null;
  codDesenho: string | null;
  qtde: string | null;
  dxfExportado: string | null;
  dxfServidor: string | null;
  origemServidor: string | null;
  candidatosCodigo: string[];
  candidatosDesenho: string[];
  dxfModificadoEm: string | null;
  dxfTamanho: number | null;
  alertas: string | null;
}

export interface EventoLantekDetalhe extends EventoLantekResumo {
  parametros: unknown;
  resultado: unknown;
  erro: string | null;
  itensExportados: ItemExportadoLantek[];
}

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!body) return { ok: false, message: "Resposta inválida do servidor." };
  return body;
}

export async function listarRegistrosLantek(filtros: {
  modulo: ModuloLantek;
  busca: string;
  pagina: number;
  porPagina: number;
}): Promise<ApiEnvelope<{ itens: EventoLantekResumo[]; total: number }>> {
  const params = new URLSearchParams({
    modulo: filtros.modulo,
    pagina: String(filtros.pagina),
    porPagina: String(filtros.porPagina),
  });
  if (filtros.busca.trim()) params.set("busca", filtros.busca.trim());
  try {
    const response = await fetch(`/api/integra-lantek/registros?${params.toString()}`, { cache: "no-store" });
    return await parseResponse(response);
  } catch {
    return { ok: false, message: "Sem conexão com o Portal." };
  }
}

export async function buscarRegistroLantek(id: string): Promise<ApiEnvelope<EventoLantekDetalhe>> {
  try {
    const response = await fetch(`/api/integra-lantek/registros/${id}`, { cache: "no-store" });
    return await parseResponse(response);
  } catch {
    return { ok: false, message: "Sem conexão com o Portal." };
  }
}
