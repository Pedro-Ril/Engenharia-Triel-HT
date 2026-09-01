import type {
  AmbienteEstruturaSubstituicao,
  EmpresaEstruturaSubstituicao,
  EstruturaCompleta,
  HistoricoSubstituicaoPaginado,
  ResultadoNivelSubstituicao,
  ResultadoValidacaoItem,
} from "../types/estruturaSubstituicao.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json();
}

export async function listarEmpresasParaSubstituicao(): Promise<EmpresaEstruturaSubstituicao[]> {
  try {
    const response = await fetch("/api/estrutura-substituicao/empresas");
    const body = await parseResponse<EmpresaEstruturaSubstituicao[]>(response);
    return body.ok && body.data ? body.data : [];
  } catch {
    return [];
  }
}

export async function obterAmbienteAtivo(): Promise<AmbienteEstruturaSubstituicao | null> {
  try {
    const response = await fetch("/api/estrutura-substituicao/ambiente");
    const body = await parseResponse<{ ambiente: AmbienteEstruturaSubstituicao }>(response);
    return body.ok && body.data ? body.data.ambiente : null;
  } catch {
    return null;
  }
}

export async function buscarEstruturaCompleta(
  codPai: string
): Promise<ApiEnvelope<EstruturaCompleta>> {
  const response = await fetch(`/api/estrutura-substituicao/nivel/${encodeURIComponent(codPai)}`);
  return parseResponse(response);
}

export async function validarCodigosNoErp(
  empresaId: string,
  codigos: string[]
): Promise<ApiEnvelope<ResultadoValidacaoItem[]>> {
  const response = await fetch("/api/estrutura-substituicao/validar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ empresaId, codigos }),
  });
  return parseResponse(response);
}

export async function buscarHistoricoSubstituicao(
  pagina: number,
  codPai?: string
): Promise<ApiEnvelope<HistoricoSubstituicaoPaginado>> {
  const params = new URLSearchParams({ pagina: String(pagina) });
  if (codPai?.trim()) params.set("codPai", codPai.trim());

  const response = await fetch(`/api/estrutura-substituicao/historico?${params.toString()}`);
  return parseResponse(response);
}

export async function substituirItemNaEstrutura(params: {
  empresaId: string;
  codPai: string;
  codigoAntigo: string;
  codigoNovo: string;
}): Promise<ApiEnvelope<{ niveis: ResultadoNivelSubstituicao[] }>> {
  const response = await fetch("/api/estrutura-substituicao/substituir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return parseResponse(response);
}
