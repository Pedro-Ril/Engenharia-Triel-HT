import type {
  Compartilhamento,
  Pagina,
  PaginaCompartilhadaComigo,
  PaginaLixeira,
  PaginaResumo,
  PasseColaboracao,
  PessoaParaCompartilhar,
  ResultadoBusca,
} from "../types/blocoNotas.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T> & { status: number }> {
  const corpo = (await response.json().catch(() => ({ ok: false, message: "Resposta inválida do servidor." }))) as ApiEnvelope<T>;
  return { ...corpo, status: response.status };
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function listarPaginas() {
  return parseResponse<{ paginas: PaginaResumo[]; naLixeira: number }>(
    await fetch("/api/bloco-notas/paginas", { cache: "no-store" })
  );
}

export async function criarPagina(dados: { paiId: string | null; titulo?: string }) {
  return parseResponse<PaginaResumo>(
    await fetch("/api/bloco-notas/paginas", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(dados) })
  );
}

export async function abrirPagina(id: string) {
  return parseResponse<Pagina>(await fetch(`/api/bloco-notas/paginas/${id}`, { cache: "no-store" }));
}

export async function salvarPagina(
  id: string,
  dados: {
    titulo?: string;
    conteudo?: string;
    favorita?: boolean;
    versao?: number;
    forcar?: boolean;
    /* Gravação do HTML de uma página que está ao vivo (sem conferir versão). */
    colaborativo?: boolean;
  }
) {
  return parseResponse<{ versao: number; atualizadoEm: string; titulo: string }>(
    await fetch(`/api/bloco-notas/paginas/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(dados) })
  );
}

export async function moverPagina(id: string, paiId: string | null) {
  return parseResponse<null>(
    await fetch(`/api/bloco-notas/paginas/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ paiId }) })
  );
}

export async function reordenarPaginas(paiId: string | null, ids: string[]) {
  return parseResponse<null>(
    await fetch("/api/bloco-notas/paginas/ordem", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ paiId, ids }) })
  );
}

export async function enviarParaLixeira(id: string) {
  return parseResponse<{ total: number }>(await fetch(`/api/bloco-notas/paginas/${id}`, { method: "DELETE" }));
}

export async function listarLixeira() {
  return parseResponse<PaginaLixeira[]>(await fetch("/api/bloco-notas/lixeira", { cache: "no-store" }));
}

export async function restaurarPagina(id: string) {
  return parseResponse<null>(await fetch(`/api/bloco-notas/lixeira/${id}`, { method: "POST" }));
}

export async function excluirDefinitivamente(id: string) {
  return parseResponse<null>(await fetch(`/api/bloco-notas/lixeira/${id}`, { method: "DELETE" }));
}

export async function esvaziarLixeira() {
  return parseResponse<null>(await fetch("/api/bloco-notas/lixeira", { method: "DELETE" }));
}

export async function buscarNasNotas(termo: string) {
  return parseResponse<ResultadoBusca[]>(
    await fetch(`/api/bloco-notas/busca?q=${encodeURIComponent(termo)}`, { cache: "no-store" })
  );
}

/*
 * Print colado/arrastado no editor -> URL para inserir no conteúdo (o
 * editor espera a URL ou um erro). A página vai junto: quem tem acesso a
 * ela (compartilhada) passa a poder ver a imagem.
 */
export async function enviarImagemNota(arquivo: File, paginaId: string): Promise<string> {
  const formData = new FormData();
  formData.append("imagem", arquivo);
  formData.append("paginaId", paginaId);
  const resultado = await parseResponse<{ id: string; url: string }>(
    await fetch("/api/bloco-notas/imagens", { method: "POST", body: formData })
  );
  if (!resultado.ok || !resultado.data) throw new Error(resultado.message ?? "Não foi possível enviar a imagem.");
  return resultado.data.url;
}

/* ---------- compartilhamento / edição ao vivo ---------- */

export async function listarCompartilhadasComigo() {
  return parseResponse<PaginaCompartilhadaComigo[]>(
    await fetch("/api/bloco-notas/compartilhadas", { cache: "no-store" })
  );
}

export async function listarCompartilhamentos(paginaId: string) {
  return parseResponse<Compartilhamento[]>(
    await fetch(`/api/bloco-notas/paginas/${paginaId}/compartilhamentos`, { cache: "no-store" })
  );
}

export async function compartilharPagina(paginaId: string, usuarioId: string, permissao: "ver" | "editar") {
  return parseResponse<Compartilhamento[]>(
    await fetch(`/api/bloco-notas/paginas/${paginaId}/compartilhamentos`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ usuarioId, permissao }),
    })
  );
}

export async function removerCompartilhamento(paginaId: string, usuarioId: string) {
  return parseResponse<null>(
    await fetch(`/api/bloco-notas/paginas/${paginaId}/compartilhamentos/${usuarioId}`, { method: "DELETE" })
  );
}

export async function buscarPessoas(termo: string) {
  return parseResponse<PessoaParaCompartilhar[]>(
    await fetch(`/api/bloco-notas/pessoas?q=${encodeURIComponent(termo)}`, { cache: "no-store" })
  );
}

export async function pedirPasseColaboracao(paginaId: string) {
  return parseResponse<PasseColaboracao>(
    await fetch(`/api/bloco-notas/paginas/${paginaId}/colaboracao`, { cache: "no-store" })
  );
}
