import type {
  ApiEnvelope,
  CertificadoImpressora,
  ConfigRotaAvulsa,
  DadosImpressora,
  EscopoToken,
  Impressora,
  PaginaLogs,
  ResultadoLog,
  SituacaoImpressora,
  TokenRotaAvulsa,
} from "../types/rotasAvulsas.types";

/* Falha de rede ou resposta que não é JSON viram { ok: false } com mensagem, nunca exceção na tela. */
async function requisitar<T>(url: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, message: "Sem conexão com o Portal. Confira a rede e tente de novo." };
  }
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    return { ok: false, message: `Resposta inesperada do servidor (HTTP ${response.status}).` };
  }
}

function json(metodo: string, corpo?: unknown): RequestInit {
  return {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  };
}

const base = (chave: string) => `/api/admin/rotas-avulsas/${encodeURIComponent(chave)}`;

/* ---------- configuração ---------- */

export async function buscarConfigRota(chave: string): Promise<ApiEnvelope<ConfigRotaAvulsa>> {
  return requisitar(base(chave));
}

export async function salvarConfigRota(
  chave: string,
  dados: Pick<ConfigRotaAvulsa, "ativo" | "limitePorSegundo" | "rajada" | "limitePorMinuto" | "config">
): Promise<ApiEnvelope<ConfigRotaAvulsa>> {
  return requisitar(base(chave), json("PATCH", dados));
}

/* ---------- tokens ---------- */

export async function listarTokens(chave: string): Promise<ApiEnvelope<TokenRotaAvulsa[]>> {
  return requisitar(`${base(chave)}/tokens`);
}

export interface DadosToken {
  nome: string;
  escopo: EscopoToken;
  expiraEm: string | null;
}

export async function criarToken(
  chave: string,
  dados: DadosToken
): Promise<ApiEnvelope<{ token: TokenRotaAvulsa; valor: string }>> {
  return requisitar(`${base(chave)}/tokens`, json("POST", dados));
}

export async function atualizarToken(chave: string, id: string, dados: DadosToken): Promise<ApiEnvelope<TokenRotaAvulsa>> {
  return requisitar(`${base(chave)}/tokens/${id}`, json("PATCH", dados));
}

export async function revogarToken(chave: string, id: string): Promise<ApiEnvelope<TokenRotaAvulsa>> {
  return requisitar(`${base(chave)}/tokens/${id}`, { method: "DELETE" });
}

/* ---------- logs ---------- */

export async function listarLogs(
  chave: string,
  filtros: { resultado: ResultadoLog | null; tokenId: string | null; busca: string; pagina: number; porPagina: number }
): Promise<ApiEnvelope<PaginaLogs>> {
  const params = new URLSearchParams({ pagina: String(filtros.pagina), porPagina: String(filtros.porPagina) });
  if (filtros.resultado) params.set("resultado", filtros.resultado);
  if (filtros.tokenId) params.set("token", filtros.tokenId);
  if (filtros.busca) params.set("busca", filtros.busca);
  return requisitar(`${base(chave)}/logs?${params}`);
}

/* ---------- impressoras (rota impressao-pdf) ---------- */

export async function listarImpressoras(): Promise<ApiEnvelope<Impressora[]>> {
  return requisitar("/api/admin/impressao/impressoras");
}

export async function criarImpressora(dados: DadosImpressora): Promise<ApiEnvelope<Impressora>> {
  return requisitar("/api/admin/impressao/impressoras", json("POST", dados));
}

export async function atualizarImpressora(id: string, dados: DadosImpressora): Promise<ApiEnvelope<Impressora>> {
  return requisitar(`/api/admin/impressao/impressoras/${id}`, json("PATCH", dados));
}

export async function excluirImpressora(id: string): Promise<ApiEnvelope<null>> {
  return requisitar(`/api/admin/impressao/impressoras/${id}`, { method: "DELETE" });
}

export async function testarImpressora(id: string): Promise<ApiEnvelope<SituacaoImpressora>> {
  return requisitar(`/api/admin/impressao/impressoras/${id}/testar`, { method: "POST" });
}

export async function imprimirPaginaTeste(id: string): Promise<ApiEnvelope<null>> {
  return requisitar(`/api/admin/impressao/impressoras/${id}/pagina-teste`, { method: "POST" });
}

export async function lerCertificadoImpressora(endereco: string, porta: number): Promise<ApiEnvelope<CertificadoImpressora>> {
  return requisitar("/api/admin/impressao/certificado", json("POST", { endereco, porta }));
}
