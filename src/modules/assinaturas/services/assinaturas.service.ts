import type {
  AssinaturaGerada,
  CamposAssinaturaConfig,
  ItemLogAssinatura,
  ModeloAssinatura,
  ModeloAssinaturaAdmin,
} from "../types/assinaturas.types";

export interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json();
}

/* Usuário */

export async function listarModelosAssinatura(): Promise<ModeloAssinatura[]> {
  try {
    const response = await fetch("/api/assinaturas/modelos");
    const body = await parseResponse<ModeloAssinatura[]>(response);
    return body.ok && body.data ? body.data : [];
  } catch {
    return [];
  }
}

export function urlImagemModelo(id: string): string {
  return `/api/assinaturas/modelos/${id}/imagem`;
}

export async function gerarAssinatura(dados: {
  modeloId: string;
  nome: string;
  sobrenome: string;
  setor: string;
  email: string;
  celular: string;
  imagemBase64: string;
}): Promise<ApiEnvelope<AssinaturaGerada>> {
  const response = await fetch("/api/assinaturas/gerar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function atualizarAssinatura(
  id: string,
  dados: {
    modeloId: string;
    nome: string;
    sobrenome: string;
    setor: string;
    email: string;
    celular: string;
    imagemBase64: string;
  }
): Promise<ApiEnvelope<AssinaturaGerada>> {
  const response = await fetch(`/api/assinaturas/geradas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

/* Lista compartilhada -- todo usuário com acesso ao módulo vê todas as assinaturas geradas, paginada e com busca. */
export async function listarAssinaturasGeradas(params: {
  pagina: number;
  porPagina: number;
  busca?: string;
}): Promise<{ itens: AssinaturaGerada[]; total: number } | null> {
  try {
    const query = new URLSearchParams({ pagina: String(params.pagina), porPagina: String(params.porPagina) });
    if (params.busca) query.set("busca", params.busca);

    const response = await fetch(`/api/assinaturas/geradas?${query.toString()}`);
    const body = await parseResponse<{ itens: AssinaturaGerada[]; total: number }>(response);
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

export function urlArquivoAssinaturaGerada(id: string): string {
  return `/api/assinaturas/geradas/${id}/arquivo`;
}

export async function excluirAssinatura(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/assinaturas/geradas/${id}`, { method: "DELETE" });
  return parseResponse(response);
}

/* Admin */

export async function listarModelosAssinaturaAdmin(): Promise<ModeloAssinaturaAdmin[]> {
  try {
    const response = await fetch("/api/admin/assinaturas/modelos");
    const body = await parseResponse<ModeloAssinaturaAdmin[]>(response);
    return body.ok && body.data ? body.data : [];
  } catch {
    return [];
  }
}

export function urlImagemModeloAdmin(id: string): string {
  return `/api/admin/assinaturas/modelos/${id}/imagem`;
}

export async function criarModeloAssinaturaAdmin(dados: {
  nome: string;
  imagem: File;
  camposConfig: CamposAssinaturaConfig;
}): Promise<ApiEnvelope<ModeloAssinaturaAdmin>> {
  const formData = new FormData();
  formData.set("nome", dados.nome);
  formData.set("imagem", dados.imagem);
  formData.set("camposConfig", JSON.stringify(dados.camposConfig));

  const response = await fetch("/api/admin/assinaturas/modelos", {
    method: "POST",
    body: formData,
  });
  return parseResponse(response);
}

export async function atualizarModeloAssinaturaAdmin(
  id: string,
  dados: {
    nome?: string;
    imagem?: File;
    camposConfig?: CamposAssinaturaConfig;
    ativo?: boolean;
    ordem?: number;
  }
): Promise<ApiEnvelope<ModeloAssinaturaAdmin>> {
  const formData = new FormData();
  if (dados.nome !== undefined) formData.set("nome", dados.nome);
  if (dados.imagem !== undefined) formData.set("imagem", dados.imagem);
  if (dados.camposConfig !== undefined) formData.set("camposConfig", JSON.stringify(dados.camposConfig));
  if (dados.ativo !== undefined) formData.set("ativo", String(dados.ativo));
  if (dados.ordem !== undefined) formData.set("ordem", String(dados.ordem));

  const response = await fetch(`/api/admin/assinaturas/modelos/${id}`, {
    method: "PATCH",
    body: formData,
  });
  return parseResponse(response);
}

export async function excluirModeloAssinaturaAdmin(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/assinaturas/modelos/${id}`, { method: "DELETE" });
  return parseResponse(response);
}

export async function listarLogAssinaturasAdmin(params: {
  pagina: number;
  porPagina: number;
  busca?: string;
  modeloNome?: string;
}): Promise<{ itens: ItemLogAssinatura[]; total: number } | null> {
  try {
    const query = new URLSearchParams({
      pagina: String(params.pagina),
      porPagina: String(params.porPagina),
    });
    if (params.busca) query.set("busca", params.busca);
    if (params.modeloNome) query.set("modeloNome", params.modeloNome);

    const response = await fetch(`/api/admin/assinaturas/log?${query.toString()}`);
    const body = await parseResponse<{ itens: ItemLogAssinatura[]; total: number }>(response);
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}
