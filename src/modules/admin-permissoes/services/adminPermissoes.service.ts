import type { DownloadAdmin } from "@/modules/downloads/types/downloads.types";
import type { WikiArtigo, WikiTopico } from "@/modules/wiki/types/wiki.types";

import type {
  Atualizacao,
  AtualizacaoTag,
  BuscaTerminalFabrica,
  ConfigEstruturaSubstituicao,
  ConfigIntegraLantek,
  ConfigMateriaPrima,
  ConfiguracaoAd,
  ConfiguracaoDb,
  ConfiguracaoSmtp,
  CriptografiaSmtp,
  Empresa,
  EmpresaComCatalogo,
  ItensMateriaPrimaCachePaginados,
  LogSincronizacaoMateriaPrima,
  PortalModulo,
  PortalPermissao,
  PortalSetor,
  PortalUsuarioAdmin,
  ResultadoTesteConexaoAd,
  ResultadoTesteConexaoDb,
  ResumoBuscasTerminalFabrica,
  StatusManutencao,
  TemaPadrao,
  TipoAtualizacaoItem,
  TransferenciaAdmin,
  TransferenciaConfig,
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
  restritoAtendenteChamados?: boolean;
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
    restritoAtendenteChamados: boolean;
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

export async function forcarLogoutUsuario(
  id: string
): Promise<ApiEnvelope<PortalUsuarioAdmin>> {
  const response = await fetch(`/api/admin/usuarios/${id}/forcar-logout`, {
    method: "POST",
  });
  return parseResponse<PortalUsuarioAdmin>(response);
}

export async function forcarLogoutTodos(): Promise<ApiEnvelope<{ totalAfetados: number }>> {
  const response = await fetch("/api/admin/usuarios/forcar-logout-todos", {
    method: "POST",
  });
  return parseResponse<{ totalAfetados: number }>(response);
}

export async function buscarStatusManutencao(): Promise<StatusManutencao | null> {
  const response = await fetch("/api/admin/manutencao");
  const body = await parseResponse<StatusManutencao>(response);
  return body.data ?? null;
}

export async function salvarStatusManutencao(dados: {
  ativo: boolean;
  mensagem?: string | null;
}): Promise<ApiEnvelope<StatusManutencao>> {
  const response = await fetch("/api/admin/manutencao", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<StatusManutencao>(response);
}

export async function listarEmpresas(): Promise<Empresa[]> {
  const response = await fetch("/api/admin/empresas");
  const body = await parseResponse<Empresa[]>(response);
  return body.data ?? [];
}

export async function criarEmpresa(dados: {
  nome: string;
  codigo?: string | null;
  cnpj?: string | null;
  corPrimariaClara: string;
  corPrimariaEscura: string;
}): Promise<ApiEnvelope<Empresa>> {
  const response = await fetch("/api/admin/empresas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<Empresa>(response);
}

export async function atualizarEmpresa(
  id: string,
  dados: {
    nome?: string;
    codigo?: string | null;
    cnpj?: string | null;
    corPrimariaClara?: string;
    corPrimariaEscura?: string;
    ativa?: boolean;
  }
): Promise<ApiEnvelope<Empresa>> {
  const response = await fetch(`/api/admin/empresas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<Empresa>(response);
}

export async function buscarTemaPadrao(): Promise<TemaPadrao | null> {
  const response = await fetch("/api/admin/tema-padrao");
  const body = await parseResponse<TemaPadrao | null>(response);
  return body.data ?? null;
}

export async function salvarTemaPadrao(dados: {
  corPrimariaClara: string;
  corPrimariaEscura: string;
}): Promise<ApiEnvelope<TemaPadrao>> {
  const response = await fetch("/api/admin/tema-padrao", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<TemaPadrao>(response);
}

export async function restaurarTemaPadrao(): Promise<ApiEnvelope<null>> {
  const response = await fetch("/api/admin/tema-padrao", { method: "DELETE" });
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

export interface ResultadoAtualizacaoAd {
  verificados: number;
  atualizados: number;
  naoEncontrados: number;
  usuarios: PortalUsuarioAdmin[];
}

export async function atualizarUsuariosDoAd(): Promise<
  ApiEnvelope<ResultadoAtualizacaoAd>
> {
  const response = await fetch("/api/admin/usuarios/atualizar-ad", {
    method: "POST",
  });
  return parseResponse<ResultadoAtualizacaoAd>(response);
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

export async function testarConexaoAd(dados: {
  url: string;
  usuarioServico: string;
  senhaServico: string | null;
  grupoAdminDn: string;
  grupoUsuariosDn: string | null;
}): Promise<ApiEnvelope<ResultadoTesteConexaoAd>> {
  const response = await fetch("/api/admin/configuracao-ad/testar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<ResultadoTesteConexaoAd>(response);
}

/* =========================================================
   Configuração — Banco de dados (.env)
   ========================================================= */

export async function buscarConfiguracaoDb(): Promise<ConfiguracaoDb | null> {
  const response = await fetch("/api/admin/configuracao-db");
  const body = await parseResponse<ConfiguracaoDb | null>(response);
  return body.data ?? null;
}

export interface DadosConfiguracaoDb {
  server: string;
  database: string;
  user: string;
  senha: string | null;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

export async function testarConexaoDb(
  dados: DadosConfiguracaoDb
): Promise<ApiEnvelope<ResultadoTesteConexaoDb>> {
  const response = await fetch("/api/admin/configuracao-db/testar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<ResultadoTesteConexaoDb>(response);
}

export async function salvarConfiguracaoDb(
  dados: DadosConfiguracaoDb
): Promise<ApiEnvelope<ConfiguracaoDb>> {
  const response = await fetch("/api/admin/configuracao-db", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<ConfiguracaoDb>(response);
}

export async function reiniciarAplicacao(): Promise<ApiEnvelope<null>> {
  const response = await fetch("/api/admin/configuracao-db/reiniciar", {
    method: "POST",
  });
  return parseResponse<null>(response);
}

export interface BuscasTerminalFabricaData {
  buscas: BuscaTerminalFabrica[];
  total: number;
  resumo: ResumoBuscasTerminalFabrica;
}

export async function buscarBuscasTerminalFabrica(params: {
  pagina: number;
  porPagina: number;
}): Promise<BuscasTerminalFabricaData> {
  const query = new URLSearchParams({
    pagina: String(params.pagina),
    porPagina: String(params.porPagina),
  });
  const response = await fetch(`/api/admin/terminal-fabrica/buscas?${query.toString()}`);
  const body = await parseResponse<BuscasTerminalFabricaData>(response);
  return (
    body.data ?? {
      buscas: [],
      total: 0,
      resumo: { totalBuscas: 0, buscasHoje: 0, naoEncontrados: 0 },
    }
  );
}

export async function listarTagsAtualizacao(): Promise<AtualizacaoTag[]> {
  const response = await fetch("/api/admin/atualizacoes/tags");
  const body = await parseResponse<AtualizacaoTag[]>(response);
  return body.data ?? [];
}

export async function criarTagAtualizacao(dados: {
  chave: string;
  nome: string;
  cor: string;
  ordem: number;
}): Promise<ApiEnvelope<AtualizacaoTag>> {
  const response = await fetch("/api/admin/atualizacoes/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<AtualizacaoTag>(response);
}

export async function atualizarTagAtualizacao(
  id: string,
  dados: { nome: string; cor: string; ordem: number; ativo: boolean }
): Promise<ApiEnvelope<AtualizacaoTag>> {
  const response = await fetch(`/api/admin/atualizacoes/tags/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<AtualizacaoTag>(response);
}

export async function excluirTagAtualizacao(
  id: string
): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/atualizacoes/tags/${id}`, {
    method: "DELETE",
  });
  return parseResponse<null>(response);
}

export async function listarAtualizacoesAdmin(): Promise<Atualizacao[]> {
  const response = await fetch("/api/admin/atualizacoes");
  const body = await parseResponse<Atualizacao[]>(response);
  return body.data ?? [];
}

export interface SalvarAtualizacaoDados {
  versao: string;
  titulo: string;
  descricao: string;
  publicadoEm: string;
  publicado: boolean;
  ordem: number;
  tagIds: string[];
  itens: { tipo: TipoAtualizacaoItem; texto: string; tagIds: string[] }[];
}

export async function criarAtualizacao(
  dados: SalvarAtualizacaoDados
): Promise<ApiEnvelope<Atualizacao>> {
  const response = await fetch("/api/admin/atualizacoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<Atualizacao>(response);
}

export async function atualizarAtualizacao(
  id: string,
  dados: SalvarAtualizacaoDados
): Promise<ApiEnvelope<Atualizacao>> {
  const response = await fetch(`/api/admin/atualizacoes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<Atualizacao>(response);
}

export async function excluirAtualizacao(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/atualizacoes/${id}`, {
    method: "DELETE",
  });
  return parseResponse<null>(response);
}

export async function listarDownloadsAdmin(): Promise<DownloadAdmin[]> {
  const response = await fetch("/api/admin/downloads");
  const body = await parseResponse<DownloadAdmin[]>(response);
  return body.data ?? [];
}

/*
 * FormData (não JSON) porque o arquivo vai junto com os campos
 * de texto — quem monta o FormData (nome, descrição, arquivo,
 * instruções/funcionamento como JSON) é o próprio painel admin.
 */
export async function criarDownloadAdmin(dados: FormData): Promise<ApiEnvelope<DownloadAdmin>> {
  const response = await fetch("/api/admin/downloads", {
    method: "POST",
    body: dados,
  });
  return parseResponse<DownloadAdmin>(response);
}

export async function atualizarDownloadAdmin(
  id: string,
  dados: FormData
): Promise<ApiEnvelope<DownloadAdmin>> {
  const response = await fetch(`/api/admin/downloads/${id}`, {
    method: "PATCH",
    body: dados,
  });
  return parseResponse<DownloadAdmin>(response);
}

export async function excluirDownloadAdmin(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/downloads/${id}`, {
    method: "DELETE",
  });
  return parseResponse<null>(response);
}

/* =========================================================
   ADMIN — wiki
   ========================================================= */

export async function listarWikiArtigosAdmin(): Promise<WikiArtigo[]> {
  const response = await fetch("/api/admin/wiki");
  const body = await parseResponse<WikiArtigo[]>(response);
  return body.data ?? [];
}

export interface DadosWikiArtigo {
  titulo: string;
  conteudo: string;
  moduloId: string | null;
  topicoId: string | null;
  privadoAdmin: boolean;
  ativo: boolean;
}

export async function criarWikiArtigo(
  dados: DadosWikiArtigo
): Promise<ApiEnvelope<WikiArtigo>> {
  const response = await fetch("/api/admin/wiki", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<WikiArtigo>(response);
}

export async function atualizarWikiArtigo(
  id: string,
  dados: Partial<DadosWikiArtigo> & { ordem?: number }
): Promise<ApiEnvelope<WikiArtigo>> {
  const response = await fetch(`/api/admin/wiki/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<WikiArtigo>(response);
}

export async function excluirWikiArtigo(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/wiki/${id}`, {
    method: "DELETE",
  });
  return parseResponse<null>(response);
}

export async function listarWikiTopicos(): Promise<WikiTopico[]> {
  const response = await fetch("/api/admin/wiki/topicos");
  const body = await parseResponse<WikiTopico[]>(response);
  return body.data ?? [];
}

export async function criarWikiTopico(dados: {
  nome: string;
  icone: string | null;
}): Promise<ApiEnvelope<WikiTopico>> {
  const response = await fetch("/api/admin/wiki/topicos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<WikiTopico>(response);
}

export async function atualizarWikiTopico(
  id: string,
  dados: { nome?: string; icone?: string | null }
): Promise<ApiEnvelope<WikiTopico>> {
  const response = await fetch(`/api/admin/wiki/topicos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<WikiTopico>(response);
}

export async function excluirWikiTopico(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/wiki/topicos/${id}`, {
    method: "DELETE",
  });
  return parseResponse<null>(response);
}

export async function uploadWikiImagem(
  arquivo: File
): Promise<ApiEnvelope<{ id: string; url: string }>> {
  const formData = new FormData();
  formData.append("imagem", arquivo);

  const response = await fetch("/api/admin/wiki/imagens", {
    method: "POST",
    body: formData,
  });
  return parseResponse<{ id: string; url: string }>(response);
}

export async function buscarConfigMateriaPrima(): Promise<ConfigMateriaPrima | null> {
  const response = await fetch("/api/admin/materias-primas/config");
  const body = await parseResponse<ConfigMateriaPrima>(response);
  return body.data ?? null;
}

export async function salvarConfigMateriaPrima(dados: {
  apiBaseUrl: string;
  intervaloSincronizacaoMinutos: number | null;
}): Promise<ApiEnvelope<ConfigMateriaPrima>> {
  const response = await fetch("/api/admin/materias-primas/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<ConfigMateriaPrima>(response);
}

export async function buscarConfigEstruturaSubstituicao(): Promise<ConfigEstruturaSubstituicao | null> {
  const response = await fetch("/api/admin/estrutura-substituicao/config");
  const body = await parseResponse<ConfigEstruturaSubstituicao>(response);
  return body.data ?? null;
}

export async function salvarConfigEstruturaSubstituicao(dados: {
  urlConsultaEstrutura: string | null;
  urlValidarItens: string | null;
  urlAtualizarEstrutura: string | null;
  urlConsultaEstruturaTeste: string | null;
  urlValidarItensTeste: string | null;
  urlAtualizarEstruturaTeste: string | null;
  usarAmbienteTeste: boolean;
}): Promise<ApiEnvelope<ConfigEstruturaSubstituicao>> {
  const response = await fetch("/api/admin/estrutura-substituicao/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<ConfigEstruturaSubstituicao>(response);
}

export async function buscarConfigIntegraLantek(): Promise<ConfigIntegraLantek | null> {
  const response = await fetch("/api/admin/integra-lantek/config");
  const body = await parseResponse<ConfigIntegraLantek>(response);
  return body.data ?? null;
}

export async function salvarConfigIntegraLantek(dados: {
  foccoApiBaseUrl: string | null;
  foccoApiChave: string | null;
  foccoApiToken: string | null;
  pastaDxf: string | null;
  pastaDesenhos: string | null;
  pastaExportacaoAgro: string | null;
  pastaExportacaoVe: string | null;
}): Promise<ApiEnvelope<ConfigIntegraLantek>> {
  const response = await fetch("/api/admin/integra-lantek/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<ConfigIntegraLantek>(response);
}

export async function buscarConfiguracaoSmtp(): Promise<ConfiguracaoSmtp | null> {
  const response = await fetch("/api/admin/configuracao-smtp");
  const body = await parseResponse<ConfiguracaoSmtp | null>(response);
  return body.data ?? null;
}

export interface DadosConfiguracaoSmtp {
  host: string;
  porta: number;
  criptografia: CriptografiaSmtp;
  autenticacaoAtiva: boolean;
  usuario: string | null;
  senha: string | null;
  remetenteNome: string | null;
  remetenteEmail: string;
}

export async function salvarConfiguracaoSmtp(
  dados: DadosConfiguracaoSmtp
): Promise<ApiEnvelope<ConfiguracaoSmtp>> {
  const response = await fetch("/api/admin/configuracao-smtp", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<ConfiguracaoSmtp>(response);
}

export async function testarConfiguracaoSmtp(
  dados: DadosConfiguracaoSmtp
): Promise<ApiEnvelope<null>> {
  const response = await fetch("/api/admin/configuracao-smtp/testar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<null>(response);
}

export async function buscarConfigTransferencia(): Promise<TransferenciaConfig | null> {
  const response = await fetch("/api/admin/transferencia-arquivos/config");
  const body = await parseResponse<TransferenciaConfig>(response);
  return body.data ?? null;
}

export async function salvarConfigTransferencia(dados: {
  pastaArmazenamento: string;
  duracaoMaximaHoras: number | null;
  urlPublica: string | null;
}): Promise<ApiEnvelope<TransferenciaConfig>> {
  const response = await fetch("/api/admin/transferencia-arquivos/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse<TransferenciaConfig>(response);
}

export async function listarTransferenciasAdmin(): Promise<TransferenciaAdmin[]> {
  const response = await fetch("/api/admin/transferencia-arquivos");
  const body = await parseResponse<TransferenciaAdmin[]>(response);
  return body.data ?? [];
}

export async function excluirTransferenciaAdmin(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/transferencia-arquivos/minhas/${id}`, { method: "DELETE" });
  return parseResponse<null>(response);
}

export async function listarEmpresasComCatalogoMateriaPrima(): Promise<EmpresaComCatalogo[]> {
  const response = await fetch("/api/admin/materias-primas/empresas");
  const body = await parseResponse<EmpresaComCatalogo[]>(response);
  return body.data ?? [];
}

export async function listarLogsSincronizacaoMateriaPrima(): Promise<
  LogSincronizacaoMateriaPrima[]
> {
  const response = await fetch("/api/admin/materias-primas/logs");
  const body = await parseResponse<LogSincronizacaoMateriaPrima[]>(response);
  return body.data ?? [];
}

export async function sincronizarCatalogoMateriaPrimaAdmin(
  codEmpresa: string
): Promise<ApiEnvelope<{ totalItens: number }>> {
  const response = await fetch("/api/admin/materias-primas/sincronizar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codEmpresa }),
  });
  return parseResponse<{ totalItens: number }>(response);
}

export async function listarItensMateriaPrimaCacheAdmin(params: {
  codEmpresa: string;
  pagina: number;
  busca: string;
}): Promise<ApiEnvelope<ItensMateriaPrimaCachePaginados>> {
  const query = new URLSearchParams({
    codEmpresa: params.codEmpresa,
    pagina: String(params.pagina),
    busca: params.busca,
  });
  const response = await fetch(`/api/admin/materias-primas/itens?${query.toString()}`);
  return parseResponse<ItensMateriaPrimaCachePaginados>(response);
}

export async function cancelarSincronizacaoMateriaPrimaAdmin(
  codEmpresa: string
): Promise<ApiEnvelope<null>> {
  const response = await fetch("/api/admin/materias-primas/cancelar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codEmpresa }),
  });
  return parseResponse<null>(response);
}
