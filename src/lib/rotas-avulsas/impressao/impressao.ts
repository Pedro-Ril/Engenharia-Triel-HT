import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { colunasSql } from "../sql";

import {
  consultarImpressoraIpp,
  consultarTrabalhoIpp,
  descreverStatus,
  estadoDoTrabalho,
  imprimirPdf,
  statusOk,
  type DestinoIpp,
  type EstadoTrabalhoIpp,
} from "./ipp";

/*
 * Impressoras da rota de impressão e os trabalhos enviados a elas. O PDF
 * não é guardado: o trabalho registra só o hash, o tamanho e os dados do
 * envio.
 */

export const ROTA_IMPRESSAO = "impressao-pdf";

export type EstadoTrabalho = "enviando" | EstadoTrabalhoIpp;

export interface Impressora {
  id: string;
  codigo: string;
  nome: string;
  endereco: string;
  porta: number;
  caminhoIpp: string;
  usarTls: boolean;
  certificadoSha256: string | null;
  frenteVersoPadrao: boolean;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface TrabalhoImpressao {
  id: string;
  tokenId: string;
  chaveIdempotencia: string | null;
  impressoraId: string;
  impressoraCodigo: string;
  nomeArquivo: string | null;
  copias: number;
  frenteVerso: boolean;
  paginas: number;
  tamanhoBytes: number;
  sha256: string;
  ippJobId: number | null;
  estado: EstadoTrabalho;
  estadoDetalhe: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/* ---------- impressoras ---------- */

interface ImpressoraRow {
  id: string;
  codigo: string;
  nome: string;
  endereco: string;
  porta: number;
  caminho_ipp: string;
  usar_tls: boolean;
  certificado_sha256: string | null;
  frente_verso_padrao: boolean;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date | null;
  atualizado_por: string | null;
}

const LISTA_IMPRESSORA = [
  "id", "codigo", "nome", "endereco", "porta", "caminho_ipp", "usar_tls", "certificado_sha256",
  "frente_verso_padrao", "ativo", "criado_em", "atualizado_em", "atualizado_por",
];
const COLUNAS_IMPRESSORA = colunasSql(LISTA_IMPRESSORA, ["criado_em", "atualizado_em"]);
const COLUNAS_IMPRESSORA_INSERTED = colunasSql(LISTA_IMPRESSORA, ["criado_em", "atualizado_em"], "INSERTED.");

function mapearImpressora(row: ImpressoraRow): Impressora {
  return {
    id: row.id,
    codigo: row.codigo,
    nome: row.nome,
    endereco: row.endereco,
    porta: row.porta,
    caminhoIpp: row.caminho_ipp,
    usarTls: row.usar_tls,
    certificadoSha256: row.certificado_sha256,
    frenteVersoPadrao: row.frente_verso_padrao,
    ativo: row.ativo,
    criadoEm: row.criado_em.toISOString(),
    atualizadoEm: row.atualizado_em?.toISOString() ?? null,
    atualizadoPor: row.atualizado_por,
  };
}

export function destinoDaImpressora(impressora: Impressora): DestinoIpp {
  return {
    endereco: impressora.endereco,
    porta: impressora.porta,
    caminho: impressora.caminhoIpp,
    usarTls: impressora.usarTls,
    certificadoSha256: impressora.certificadoSha256,
  };
}

export async function listarImpressoras(): Promise<Impressora[]> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .query<ImpressoraRow>(`SELECT ${COLUNAS_IMPRESSORA} FROM dbo.portal_impressao_impressoras ORDER BY [codigo];`);
  return resultado.recordset.map(mapearImpressora);
}

export async function buscarImpressora(id: string): Promise<Impressora | null> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<ImpressoraRow>(`SELECT ${COLUNAS_IMPRESSORA} FROM dbo.portal_impressao_impressoras WHERE [id] = @id;`);
  const row = resultado.recordset[0];
  return row ? mapearImpressora(row) : null;
}

export async function buscarImpressoraPorCodigo(codigo: string): Promise<Impressora | null> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("codigo", sql.VarChar(40), codigo)
    .query<ImpressoraRow>(`SELECT ${COLUNAS_IMPRESSORA} FROM dbo.portal_impressao_impressoras WHERE [codigo] = @codigo;`);
  const row = resultado.recordset[0];
  return row ? mapearImpressora(row) : null;
}

export interface DadosImpressora {
  codigo: string;
  nome: string;
  endereco: string;
  porta: number;
  caminhoIpp: string;
  usarTls: boolean;
  certificadoSha256: string | null;
  frenteVersoPadrao: boolean;
  ativo: boolean;
}

function entradasImpressora(request: ReturnType<Awaited<ReturnType<typeof getSqlServerPool>>["request"]>, dados: DadosImpressora) {
  return request
    .input("codigo", sql.VarChar(40), dados.codigo)
    .input("nome", sql.NVarChar(120), dados.nome)
    .input("endereco", sql.VarChar(255), dados.endereco)
    .input("porta", sql.Int, dados.porta)
    .input("caminho", sql.VarChar(100), dados.caminhoIpp)
    .input("tls", sql.Bit, dados.usarTls)
    .input("cert", sql.VarChar(100), dados.certificadoSha256)
    .input("fv", sql.Bit, dados.frenteVersoPadrao)
    .input("ativo", sql.Bit, dados.ativo);
}

/* Código repetido vira null (o índice único barra); quem chama transforma em mensagem. */
function ehChaveDuplicada(erro: unknown): boolean {
  const numero = (erro as { number?: number; originalError?: { info?: { number?: number } } })?.number
    ?? (erro as { originalError?: { info?: { number?: number } } })?.originalError?.info?.number;
  return numero === 2601 || numero === 2627;
}

export async function criarImpressora(dados: DadosImpressora, por: string): Promise<Impressora | null> {
  const pool = await getSqlServerPool();
  try {
    const resultado = await entradasImpressora(pool.request(), dados)
      .input("por", sql.NVarChar(100), por)
      .query<ImpressoraRow>(`
        INSERT INTO dbo.portal_impressao_impressoras
          ([codigo], [nome], [endereco], [porta], [caminho_ipp], [usar_tls], [certificado_sha256], [frente_verso_padrao], [ativo], [atualizado_em], [atualizado_por])
        OUTPUT ${COLUNAS_IMPRESSORA_INSERTED}
        VALUES (@codigo, @nome, @endereco, @porta, @caminho, @tls, @cert, @fv, @ativo, SYSDATETIME(), @por);
      `);
    return mapearImpressora(resultado.recordset[0]);
  } catch (erro) {
    if (ehChaveDuplicada(erro)) return null;
    throw erro;
  }
}

export async function atualizarImpressora(
  id: string,
  dados: DadosImpressora,
  por: string
): Promise<Impressora | "duplicada" | null> {
  const pool = await getSqlServerPool();
  try {
    const resultado = await entradasImpressora(pool.request(), dados)
      .input("id", sql.UniqueIdentifier, id)
      .input("por", sql.NVarChar(100), por)
      .query<ImpressoraRow>(`
        UPDATE dbo.portal_impressao_impressoras
        SET [codigo] = @codigo, [nome] = @nome, [endereco] = @endereco, [porta] = @porta, [caminho_ipp] = @caminho,
            [usar_tls] = @tls, [certificado_sha256] = @cert, [frente_verso_padrao] = @fv, [ativo] = @ativo,
            [atualizado_em] = SYSDATETIME(), [atualizado_por] = @por
        OUTPUT ${COLUNAS_IMPRESSORA_INSERTED}
        WHERE [id] = @id;
      `);
    const row = resultado.recordset[0];
    return row ? mapearImpressora(row) : null;
  } catch (erro) {
    if (ehChaveDuplicada(erro)) return "duplicada";
    throw erro;
  }
}

/* Os trabalhos já enviados guardam o código da impressora, então o histórico fica. */
export async function excluirImpressora(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query(`DELETE FROM dbo.portal_impressao_impressoras WHERE [id] = @id;`);
  return (resultado.rowsAffected[0] ?? 0) > 0;
}

export interface SituacaoImpressora {
  modelo: string | null;
  estado: "ociosa" | "imprimindo" | "parada" | "desconhecido";
  motivos: string[];
  mensagem: string | null;
  aceitandoTrabalhos: boolean | null;
  aceitaPdf: boolean;
  frenteVersoSuportado: boolean;
  /* Validate-Job: a impressora aceitaria um PDF com estes parâmetros (nada é impresso). */
  validacao: { ok: boolean; detalhe: string };
}

export async function consultarSituacaoImpressora(impressora: Impressora): Promise<SituacaoImpressora> {
  const destino = destinoDaImpressora(impressora);
  const atributos = (await consultarImpressoraIpp(destino)).atributos;
  const validacao = await imprimirPdf(destino, {
    pdf: Buffer.alloc(0),
    usuario: "Portal Triel-HT",
    nomeTrabalho: "Validação do Portal",
    copias: 1,
    frenteVerso: impressora.frenteVersoPadrao,
    validarSomente: true,
  });

  const estado = atributos["printer-state"]?.[0];
  const formatos = (atributos["document-format-supported"] ?? []).map(String);
  const lados = (atributos["sides-supported"] ?? []).map(String);

  return {
    modelo: (atributos["printer-make-and-model"]?.[0] as string | undefined) ?? null,
    estado: estado === 3 ? "ociosa" : estado === 4 ? "imprimindo" : estado === 5 ? "parada" : "desconhecido",
    motivos: (atributos["printer-state-reasons"] ?? []).map(String).filter((m) => m !== "none"),
    mensagem: (atributos["printer-state-message"]?.[0] as string | undefined) || null,
    aceitandoTrabalhos: typeof atributos["printer-is-accepting-jobs"]?.[0] === "boolean"
      ? (atributos["printer-is-accepting-jobs"][0] as boolean)
      : null,
    aceitaPdf: formatos.includes("application/pdf"),
    frenteVersoSuportado: lados.some((l) => l.startsWith("two-sided")),
    validacao: statusOk(validacao.status)
      ? { ok: true, detalhe: "A impressora aceitaria um PDF com essa configuração." }
      : { ok: false, detalhe: `A impressora recusaria: ${descreverStatus(validacao.status)}.` },
  };
}

/* ---------- trabalhos ---------- */

interface TrabalhoRow {
  id: string;
  token_id: string;
  chave_idempotencia: string | null;
  impressora_id: string;
  impressora_codigo: string;
  nome_arquivo: string | null;
  copias: number;
  frente_verso: boolean;
  paginas: number;
  tamanho_bytes: number;
  sha256: string;
  ipp_job_id: number | null;
  estado: EstadoTrabalho;
  estado_detalhe: string | null;
  criado_em: Date;
  atualizado_em: Date;
}

const LISTA_TRABALHO = [
  "id", "token_id", "chave_idempotencia", "impressora_id", "impressora_codigo", "nome_arquivo", "copias",
  "frente_verso", "paginas", "tamanho_bytes", "sha256", "ipp_job_id", "estado", "estado_detalhe", "criado_em", "atualizado_em",
];
const COLUNAS_TRABALHO = colunasSql(LISTA_TRABALHO, ["criado_em", "atualizado_em"]);
const COLUNAS_TRABALHO_INSERTED = colunasSql(LISTA_TRABALHO, ["criado_em", "atualizado_em"], "INSERTED.");

function mapearTrabalho(row: TrabalhoRow): TrabalhoImpressao {
  return {
    id: row.id,
    tokenId: row.token_id,
    chaveIdempotencia: row.chave_idempotencia,
    impressoraId: row.impressora_id,
    impressoraCodigo: row.impressora_codigo,
    nomeArquivo: row.nome_arquivo,
    copias: row.copias,
    frenteVerso: row.frente_verso,
    paginas: row.paginas,
    tamanhoBytes: row.tamanho_bytes,
    sha256: row.sha256,
    ippJobId: row.ipp_job_id,
    estado: row.estado,
    estadoDetalhe: row.estado_detalhe,
    criadoEm: row.criado_em.toISOString(),
    atualizadoEm: row.atualizado_em.toISOString(),
  };
}

/* O que o sistema que chamou recebe sobre o trabalho (sem ids internos). */
export function trabalhoPublico(trabalho: TrabalhoImpressao) {
  return {
    id: trabalho.id,
    estado: trabalho.estado,
    detalhe: trabalho.estadoDetalhe,
    impressora: trabalho.impressoraCodigo,
    paginas: trabalho.paginas,
    copias: trabalho.copias,
    frenteVerso: trabalho.frenteVerso,
    criadoEm: trabalho.criadoEm,
    atualizadoEm: trabalho.atualizadoEm,
  };
}

export async function buscarTrabalhoDoToken(id: string, tokenId: string): Promise<TrabalhoImpressao | null> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("token", sql.UniqueIdentifier, tokenId)
    .query<TrabalhoRow>(`SELECT ${COLUNAS_TRABALHO} FROM dbo.portal_impressao_trabalhos WHERE [id] = @id AND [token_id] = @token;`);
  const row = resultado.recordset[0];
  return row ? mapearTrabalho(row) : null;
}

export async function buscarTrabalhoPorChave(tokenId: string, chave: string): Promise<TrabalhoImpressao | null> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("token", sql.UniqueIdentifier, tokenId)
    .input("chave", sql.VarChar(100), chave)
    .query<TrabalhoRow>(`
      SELECT ${COLUNAS_TRABALHO} FROM dbo.portal_impressao_trabalhos
      WHERE [token_id] = @token AND [chave_idempotencia] = @chave;
    `);
  const row = resultado.recordset[0];
  return row ? mapearTrabalho(row) : null;
}

/*
 * Registra o trabalho antes de imprimir. Com Idempotency-Key, o índice
 * único (token, chave) garante que dois envios simultâneos iguais não
 * imprimem duas vezes: o segundo cai aqui e recebe o trabalho do primeiro.
 */
export async function registrarTrabalho(dados: {
  tokenId: string;
  chaveIdempotencia: string | null;
  impressora: Impressora;
  nomeArquivo: string | null;
  copias: number;
  frenteVerso: boolean;
  paginas: number;
  tamanhoBytes: number;
  sha256: string;
}): Promise<{ trabalho: TrabalhoImpressao; repetido: boolean }> {
  const pool = await getSqlServerPool();
  try {
    const resultado = await pool
      .request()
      .input("token", sql.UniqueIdentifier, dados.tokenId)
      .input("chave", sql.VarChar(100), dados.chaveIdempotencia)
      .input("impId", sql.UniqueIdentifier, dados.impressora.id)
      .input("impCodigo", sql.VarChar(40), dados.impressora.codigo)
      .input("nome", sql.NVarChar(255), dados.nomeArquivo)
      .input("copias", sql.Int, dados.copias)
      .input("fv", sql.Bit, dados.frenteVerso)
      .input("paginas", sql.Int, dados.paginas)
      .input("tamanho", sql.Int, dados.tamanhoBytes)
      .input("sha", sql.Char(64), dados.sha256)
      .query<TrabalhoRow>(`
        INSERT INTO dbo.portal_impressao_trabalhos
          ([token_id], [chave_idempotencia], [impressora_id], [impressora_codigo], [nome_arquivo], [copias], [frente_verso],
           [paginas], [tamanho_bytes], [sha256], [estado])
        OUTPUT ${COLUNAS_TRABALHO_INSERTED}
        VALUES (@token, @chave, @impId, @impCodigo, @nome, @copias, @fv, @paginas, @tamanho, @sha, 'enviando');
      `);
    return { trabalho: mapearTrabalho(resultado.recordset[0]), repetido: false };
  } catch (erro) {
    if (dados.chaveIdempotencia && ehChaveDuplicada(erro)) {
      const existente = await buscarTrabalhoPorChave(dados.tokenId, dados.chaveIdempotencia);
      if (existente) return { trabalho: existente, repetido: true };
    }
    throw erro;
  }
}

export async function atualizarTrabalho(
  id: string,
  dados: { estado: EstadoTrabalho; estadoDetalhe: string | null; ippJobId?: number | null }
): Promise<TrabalhoImpressao | null> {
  const pool = await getSqlServerPool();
  const resultado = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("estado", sql.VarChar(20), dados.estado)
    .input("detalhe", sql.NVarChar(400), dados.estadoDetalhe?.slice(0, 400) ?? null)
    .input("job", sql.Int, dados.ippJobId ?? null)
    .input("mudaJob", sql.Bit, dados.ippJobId !== undefined)
    .query<TrabalhoRow>(`
      UPDATE dbo.portal_impressao_trabalhos
      SET [estado] = @estado, [estado_detalhe] = @detalhe,
          [ipp_job_id] = CASE WHEN @mudaJob = 1 THEN @job ELSE [ipp_job_id] END,
          [atualizado_em] = SYSDATETIME()
      OUTPUT ${COLUNAS_TRABALHO_INSERTED}
      WHERE [id] = @id;
    `);
  const row = resultado.recordset[0];
  return row ? mapearTrabalho(row) : null;
}

/*
 * Um envio por vez para cada impressora: uma rajada de requisições não
 * abre várias conexões simultâneas com a mesma impressora.
 */
const filas = new Map<string, Promise<unknown>>();

export function naFilaDaImpressora<T>(impressoraId: string, tarefa: () => Promise<T>): Promise<T> {
  const anterior = filas.get(impressoraId) ?? Promise.resolve();
  const atual = anterior.catch(() => undefined).then(tarefa);
  filas.set(impressoraId, atual);
  atual.finally(() => {
    if (filas.get(impressoraId) === atual) filas.delete(impressoraId);
  }).catch(() => undefined);
  return atual;
}

export interface ResultadoEnvio {
  ok: boolean;
  trabalho: TrabalhoImpressao;
  statusIpp: number | null;
}

/* Manda o PDF e grava o resultado no trabalho. Erro de rede/IPP vira estado "erro", não exceção. */
export async function enviarParaImpressora(params: {
  trabalho: TrabalhoImpressao;
  impressora: Impressora;
  pdf: Buffer;
  usuario: string;
}): Promise<ResultadoEnvio> {
  const { trabalho, impressora } = params;

  return naFilaDaImpressora(impressora.id, async () => {
    try {
      const resposta = await imprimirPdf(destinoDaImpressora(impressora), {
        pdf: params.pdf,
        usuario: params.usuario,
        nomeTrabalho: trabalho.nomeArquivo ?? `Portal ${trabalho.id}`,
        copias: trabalho.copias,
        frenteVerso: trabalho.frenteVerso,
      });

      if (!statusOk(resposta.status)) {
        const atualizado = await atualizarTrabalho(trabalho.id, {
          estado: "erro",
          estadoDetalhe: `A impressora recusou o trabalho: ${descreverStatus(resposta.status)}.`,
        });
        return { ok: false, trabalho: atualizado ?? trabalho, statusIpp: resposta.status };
      }

      const jobId = resposta.atributos["job-id"]?.[0];
      const estado = estadoDoTrabalho(resposta.atributos["job-state"]?.[0] as number | undefined) ?? "na_fila";
      const atualizado = await atualizarTrabalho(trabalho.id, {
        estado,
        estadoDetalhe: null,
        ippJobId: typeof jobId === "number" ? jobId : null,
      });
      return { ok: true, trabalho: atualizado ?? trabalho, statusIpp: resposta.status };
    } catch (erro) {
      const atualizado = await atualizarTrabalho(trabalho.id, {
        estado: "erro",
        estadoDetalhe: erro instanceof Error ? erro.message : "Falha ao falar com a impressora.",
      });
      return { ok: false, trabalho: atualizado ?? trabalho, statusIpp: null };
    }
  });
}

/* Pergunta à impressora como está um trabalho ainda em andamento. Falha de consulta mantém o estado. */
export async function atualizarSituacaoTrabalho(trabalho: TrabalhoImpressao): Promise<TrabalhoImpressao> {
  if ((trabalho.estado !== "na_fila" && trabalho.estado !== "imprimindo") || trabalho.ippJobId === null) {
    return trabalho;
  }
  const impressora = await buscarImpressora(trabalho.impressoraId);
  if (!impressora) return trabalho;

  try {
    const resposta = await consultarTrabalhoIpp(destinoDaImpressora(impressora), trabalho.ippJobId);
    if (!statusOk(resposta.status)) {
      /* A impressora esquece trabalhos antigos: sem notícia, presume-se que saiu. */
      if (resposta.status === 0x0406 || resposta.status === 0x0407) {
        return (
          (await atualizarTrabalho(trabalho.id, {
            estado: "impresso",
            estadoDetalhe: "A impressora já não lista o trabalho (provavelmente impresso há algum tempo).",
          })) ?? trabalho
        );
      }
      return trabalho;
    }
    const estado = estadoDoTrabalho(resposta.atributos["job-state"]?.[0] as number | undefined);
    if (!estado || estado === trabalho.estado) return trabalho;
    const motivos = (resposta.atributos["job-state-reasons"] ?? []).map(String).filter((m) => m !== "none");
    return (
      (await atualizarTrabalho(trabalho.id, {
        estado,
        estadoDetalhe: estado === "impresso" ? null : motivos.join(", ") || null,
      })) ?? trabalho
    );
  } catch {
    return trabalho;
  }
}
