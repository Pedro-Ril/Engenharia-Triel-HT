import type {
  BuscaTerminalFabrica,
  ConfiguracaoAd,
  PortalModulo,
  PortalPermissao,
  PortalSetor,
  PortalUsuarioAdmin,
  ResumoBuscasTerminalFabrica,
} from "../types/adminPermissoes.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json();
}

export async function listarSetores(): Promise<PortalSetor[]> {
  const response = await fetch("/api/admin/setores");
  const body = await parseResponse<PortalSetor[]>(response);
  return body.data ?? [];
}

export async function criarSetor(dados: {
  chave: string;
  nome: string;
  icone: string | null;
  ordem: number;
}): Promise<ApiEnvelope<PortalSetor>> {
  const response = await fetch("/api/admin/setores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<PortalSetor>(response);
}

export async function atualizarSetor(
  id: string,
  dados: { nome: string; icone: string | null; ordem: number; ativo: boolean }
): Promise<ApiEnvelope<PortalSetor>> {
  const response = await fetch(`/api/admin/setores/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<PortalSetor>(response);
}

export async function excluirSetor(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/setores/${id}`, {
    method: "DELETE",
  });
  return parseResponse<null>(response);
}

export async function listarModulos(): Promise<PortalModulo[]> {
  const response = await fetch("/api/admin/modulos");
  const body = await parseResponse<PortalModulo[]>(response);
  return body.data ?? [];
}

export async function criarModulo(dados: {
  setorIds: string[];
  chave: string;
  nome: string;
  path: string;
  icone: string | null;
  publicoSemLogin: boolean;
  publicoAutenticado: boolean;
  emDesenvolvimento: boolean;
  ordem: number;
}): Promise<ApiEnvelope<PortalModulo>> {
  const response = await fetch("/api/admin/modulos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<PortalModulo>(response);
}

export async function atualizarModulo(
  id: string,
  dados: {
    nome: string;
    path: string;
    icone: string | null;
    publicoSemLogin: boolean;
    publicoAutenticado: boolean;
    emDesenvolvimento: boolean;
    ativo: boolean;
    ordem: number;
    setorIds: string[];
  }
): Promise<ApiEnvelope<PortalModulo>> {
  const response = await fetch(`/api/admin/modulos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<PortalModulo>(response);
}

export async function excluirModulo(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/modulos/${id}`, {
    method: "DELETE",
  });
  return parseResponse<null>(response);
}

export async function listarUsuarios(): Promise<PortalUsuarioAdmin[]> {
  const response = await fetch("/api/admin/usuarios");
  const body = await parseResponse<PortalUsuarioAdmin[]>(response);
  return body.data ?? [];
}

export async function atualizarUsuario(
  id: string,
  dados: { codigoEmpresa: string | null; ativo: boolean }
): Promise<ApiEnvelope<PortalUsuarioAdmin>> {
  const response = await fetch(`/api/admin/usuarios/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<PortalUsuarioAdmin>(response);
}

export async function excluirUsuario(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/usuarios/${id}`, {
    method: "DELETE",
  });
  return parseResponse<null>(response);
}

export interface ResultadoImportacaoAd {
  encontrados: number;
  criados: number;
  atualizados: number;
  usuarios: PortalUsuarioAdmin[];
}

export async function importarUsuariosAd(): Promise<
  ApiEnvelope<ResultadoImportacaoAd>
> {
  const response = await fetch("/api/admin/usuarios/importar-ad", {
    method: "POST",
  });
  return parseResponse<ResultadoImportacaoAd>(response);
}

export async function listarPermissoes(): Promise<PortalPermissao[]> {
  const response = await fetch("/api/admin/permissoes");
  const body = await parseResponse<PortalPermissao[]>(response);
  return body.data ?? [];
}

export async function concederPermissao(dados: {
  usuarioId: string;
  moduloId: string;
}): Promise<ApiEnvelope<PortalPermissao>> {
  const response = await fetch("/api/admin/permissoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<PortalPermissao>(response);
}

export async function revogarPermissao(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/permissoes/${id}`, {
    method: "DELETE",
  });
  return parseResponse<null>(response);
}

export async function buscarConfiguracaoAd(): Promise<ConfiguracaoAd | null> {
  const response = await fetch("/api/admin/configuracao-ad");
  const body = await parseResponse<ConfiguracaoAd | null>(response);
  return body.data ?? null;
}

export async function salvarConfiguracaoAd(dados: {
  url: string;
  baseDn: string;
  usuarioServico: string;
  senhaServico: string | null;
  grupoAdminDn: string;
  grupoUsuariosDn: string | null;
}): Promise<ApiEnvelope<ConfiguracaoAd>> {
  const response = await fetch("/api/admin/configuracao-ad", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<ConfiguracaoAd>(response);
}

export interface BuscasTerminalFabricaData {
  buscas: BuscaTerminalFabrica[];
  resumo: ResumoBuscasTerminalFabrica;
}

export async function buscarBuscasTerminalFabrica(): Promise<BuscasTerminalFabricaData> {
  const response = await fetch("/api/admin/terminal-fabrica/buscas");
  const body = await parseResponse<BuscasTerminalFabricaData>(response);
  return (
    body.data ?? {
      buscas: [],
      resumo: { totalBuscas: 0, buscasHoje: 0, naoEncontrados: 0 },
    }
  );
}
