import "server-only";

import { randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";

import { ValidationError } from "@/lib/auth/errors";
import type { PortalUsuario } from "@/lib/auth/usuarios";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { buscarConfigTransferencia } from "./transferencia-config";

export interface ArquivoTransferencia {
  id: string;
  nomeOriginal: string;
  tipoMime: string;
  tamanhoBytes: number;
}

export interface Transferencia {
  id: string;
  token: string;
  arquivos: ArquivoTransferencia[];
  tamanhoTotalBytes: number;
  mensagem: string | null;
  enviadoPorUsuarioId: string;
  destinatarioEmail: string | null;
  emailEnviado: boolean;
  criadoEm: string;
  expiraEm: string;
}

interface TransferenciaRow {
  id: string;
  token: string;
  mensagem: string | null;
  enviado_por_usuario_id: string;
  destinatario_email: string | null;
  email_enviado: boolean;
  criado_em: string;
  expira_em: string;
}

interface ArquivoRow {
  id: string;
  transferencia_id: string;
  nome_original: string;
  tipo_mime: string;
  /* BIGINT vem do driver como string, não number — ver mapArquivoRow. */
  tamanho_bytes: string;
}

const colunasTransferencia = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [token],
  [mensagem],
  CONVERT(VARCHAR(36), [enviado_por_usuario_id]) AS [enviado_por_usuario_id],
  [destinatario_email],
  CAST([email_enviado] AS BIT) AS [email_enviado],
  CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), [expira_em], 126) AS [expira_em]
`;

const colunasArquivo = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  CONVERT(VARCHAR(36), [transferencia_id]) AS [transferencia_id],
  [nome_original],
  [tipo_mime],
  [tamanho_bytes]
`;

function mapArquivoRow(row: ArquivoRow): ArquivoTransferencia {
  return {
    id: row.id,
    nomeOriginal: row.nome_original,
    tipoMime: row.tipo_mime,
    /*
     * `mssql`/tedious devolve coluna BIGINT como string (evita perda de
     * precisão em valores acima de Number.MAX_SAFE_INTEGER) — sem essa
     * conversão explícita, somar tamanhos com `+` em
     * `montarTransferencia` vira concatenação de string em vez de soma
     * ("50000" + "80000" = "5000080000"), mesmo com o tipo declarado
     * como `number`. Tamanho de arquivo real nunca chega perto do
     * limite seguro do JS, então converter aqui é seguro.
     */
    tamanhoBytes: Number(row.tamanho_bytes),
  };
}

function montarTransferencia(row: TransferenciaRow, arquivos: ArquivoTransferencia[]): Transferencia {
  return {
    id: row.id,
    token: row.token,
    arquivos,
    tamanhoTotalBytes: arquivos.reduce((total, arquivo) => total + arquivo.tamanhoBytes, 0),
    mensagem: row.mensagem,
    enviadoPorUsuarioId: row.enviado_por_usuario_id,
    destinatarioEmail: row.destinatario_email,
    emailEnviado: row.email_enviado,
    criadoEm: row.criado_em,
    expiraEm: row.expira_em,
  };
}

/*
 * Busca os arquivos de várias transferências de uma vez (1 query com
 * IN, não N+1) e agrupa por transferencia_id — usado por qualquer
 * função que liste mais de uma transferência.
 */
async function buscarArquivosPorTransferencias(
  transferenciaIds: string[]
): Promise<Map<string, ArquivoTransferencia[]>> {
  const mapa = new Map<string, ArquivoTransferencia[]>();
  if (transferenciaIds.length === 0) return mapa;

  const pool = await getSqlServerPool();
  const request = pool.request();

  const parametros = transferenciaIds
    .map((id, index) => {
      request.input(`id${index}`, sql.UniqueIdentifier, id);
      return `@id${index}`;
    })
    .join(", ");

  const result = await request.query<ArquivoRow>(`
    SELECT ${colunasArquivo}
    FROM dbo.portal_transferencia_arquivos
    WHERE [transferencia_id] IN (${parametros})
    ORDER BY [criado_em] ASC;
  `);

  for (const row of result.recordset) {
    const arquivo = mapArquivoRow(row);
    const lista = mapa.get(row.transferencia_id);
    if (lista) {
      lista.push(arquivo);
    } else {
      mapa.set(row.transferencia_id, [arquivo]);
    }
  }

  return mapa;
}

function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function criarTransferencia(params: {
  arquivos: {
    nomeOriginal: string;
    tipoMime: string;
    tamanhoBytes: number;
    caminhoArquivo: string;
  }[];
  mensagem: string | null;
  enviadoPorUsuarioId: string;
  destinatarioEmail: string | null;
  duracaoHoras: number;
}): Promise<Transferencia> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const transferenciaResult = await new sql.Request(transaction)
      .input("token", sql.VarChar(64), gerarToken())
      .input("mensagem", sql.NVarChar(1000), params.mensagem)
      .input("enviadoPorUsuarioId", sql.UniqueIdentifier, params.enviadoPorUsuarioId)
      .input("destinatarioEmail", sql.NVarChar(1000), params.destinatarioEmail)
      .input("duracaoHoras", sql.Int, params.duracaoHoras).query<TransferenciaRow>(`
        INSERT INTO dbo.portal_transferencias
          ([token], [mensagem], [enviado_por_usuario_id], [destinatario_email], [expira_em])
        OUTPUT
          CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
          INSERTED.[token],
          INSERTED.[mensagem],
          CONVERT(VARCHAR(36), INSERTED.[enviado_por_usuario_id]) AS [enviado_por_usuario_id],
          INSERTED.[destinatario_email],
          CAST(INSERTED.[email_enviado] AS BIT) AS [email_enviado],
          CONVERT(VARCHAR(33), INSERTED.[criado_em], 126) AS [criado_em],
          CONVERT(VARCHAR(33), INSERTED.[expira_em], 126) AS [expira_em]
        VALUES
          (@token, @mensagem, @enviadoPorUsuarioId, @destinatarioEmail, DATEADD(HOUR, @duracaoHoras, SYSDATETIME()));
      `);

    const transferenciaRow = transferenciaResult.recordset[0];

    const arquivos: ArquivoTransferencia[] = [];
    for (const arquivo of params.arquivos) {
      const arquivoResult = await new sql.Request(transaction)
        .input("transferenciaId", sql.UniqueIdentifier, transferenciaRow.id)
        .input("nomeOriginal", sql.NVarChar(260), arquivo.nomeOriginal)
        .input("tipoMime", sql.NVarChar(150), arquivo.tipoMime)
        .input("tamanhoBytes", sql.BigInt, arquivo.tamanhoBytes)
        .input("caminhoArquivo", sql.NVarChar(300), arquivo.caminhoArquivo).query<ArquivoRow>(`
          INSERT INTO dbo.portal_transferencia_arquivos
            ([transferencia_id], [nome_original], [tipo_mime], [tamanho_bytes], [caminho_arquivo])
          OUTPUT
            CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
            CONVERT(VARCHAR(36), INSERTED.[transferencia_id]) AS [transferencia_id],
            INSERTED.[nome_original],
            INSERTED.[tipo_mime],
            INSERTED.[tamanho_bytes]
          VALUES
            (@transferenciaId, @nomeOriginal, @tipoMime, @tamanhoBytes, @caminhoArquivo);
        `);

      arquivos.push(mapArquivoRow(arquivoResult.recordset[0]));
    }

    await transaction.commit();
    return montarTransferencia(transferenciaRow, arquivos);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/* Usada pela rota de reenvio de link — precisa dos dados completos, não só da checagem de dono usada por editar/excluir. */
export async function buscarTransferenciaPorId(id: string): Promise<Transferencia | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query<TransferenciaRow>(`
    SELECT ${colunasTransferencia}
    FROM dbo.portal_transferencias
    WHERE [id] = @id;
  `);

  const row = result.recordset[0];
  if (!row) return null;

  const arquivos = (await buscarArquivosPorTransferencias([row.id])).get(row.id) ?? [];
  return montarTransferencia(row, arquivos);
}

export async function marcarEmailEnviado(id: string): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  await request.query(`
    UPDATE dbo.portal_transferencias SET [email_enviado] = 1 WHERE [id] = @id;
  `);
}

export async function listarTransferenciasDoUsuario(
  usuarioId: string
): Promise<Transferencia[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);

  const result = await request.query<TransferenciaRow>(`
    SELECT ${colunasTransferencia}
    FROM dbo.portal_transferencias
    WHERE [enviado_por_usuario_id] = @usuarioId
    ORDER BY [criado_em] DESC;
  `);

  const arquivosPorTransferencia = await buscarArquivosPorTransferencias(
    result.recordset.map((row) => row.id)
  );

  return result.recordset.map((row) =>
    montarTransferencia(row, arquivosPorTransferencia.get(row.id) ?? [])
  );
}

export interface TransferenciaAdmin extends Transferencia {
  enviadoPorNome: string | null;
}

/* Só para a tela de administração — lista de TODOS os usuários, não só o próprio. */
export async function listarTodasTransferencias(): Promise<TransferenciaAdmin[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<TransferenciaRow & { enviado_por_nome: string | null }>(`
    SELECT
      CONVERT(VARCHAR(36), t.[id]) AS [id],
      t.[token],
      t.[mensagem],
      CONVERT(VARCHAR(36), t.[enviado_por_usuario_id]) AS [enviado_por_usuario_id],
      t.[destinatario_email],
      CAST(t.[email_enviado] AS BIT) AS [email_enviado],
      CONVERT(VARCHAR(33), t.[criado_em], 126) AS [criado_em],
      CONVERT(VARCHAR(33), t.[expira_em], 126) AS [expira_em],
      u.[nome_exibicao] AS [enviado_por_nome]
    FROM dbo.portal_transferencias t
    LEFT JOIN dbo.portal_usuarios u ON u.[id] = t.[enviado_por_usuario_id]
    ORDER BY t.[criado_em] DESC;
  `);

  const arquivosPorTransferencia = await buscarArquivosPorTransferencias(
    result.recordset.map((row) => row.id)
  );

  return result.recordset.map((row) => ({
    ...montarTransferencia(row, arquivosPorTransferencia.get(row.id) ?? []),
    enviadoPorNome: row.enviado_por_nome,
  }));
}

export interface ArquivoParaExibicaoPublica {
  id: string;
  nomeOriginal: string;
  tamanhoBytes: number;
}

export interface TransferenciaParaExibicaoPublica {
  arquivos: ArquivoParaExibicaoPublica[];
  tamanhoTotalBytes: number;
  mensagem: string | null;
  enviadoPorNome: string | null;
  criadoEm: string;
  expiraEm: string;
}

/*
 * Só para a página pública de download (src/app/baixar/[token]/page.tsx)
 * — junta o nome de quem enviou, já que a página mostra "compartilhado
 * por Fulano em tal data".
 *
 * Deliberadamente SEM filtro de expiração (diferente de
 * `buscarArquivoParaServir`/`buscarArquivosParaZip`, que nunca podem
 * servir bytes de um link vencido) — a página usa `expiraEm` pra
 * decidir se mostra os botões de download ou "expirou em tal data",
 * então precisa do dado mesmo depois de vencido. Só some de vez quando
 * o agendador de limpeza (src/lib/transferencia/scheduler.ts) já
 * apagou a linha, alguns minutos depois.
 */
export async function buscarPorTokenParaExibicao(
  token: string
): Promise<TransferenciaParaExibicaoPublica | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("token", sql.VarChar(64), token);

  const result = await request.query<{
    id: string;
    mensagem: string | null;
    enviado_por_nome: string | null;
    criado_em: string;
    expira_em: string;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), t.[id]) AS [id],
      t.[mensagem],
      u.[nome_exibicao] AS [enviado_por_nome],
      CONVERT(VARCHAR(33), t.[criado_em], 126) AS [criado_em],
      CONVERT(VARCHAR(33), t.[expira_em], 126) AS [expira_em]
    FROM dbo.portal_transferencias t
    LEFT JOIN dbo.portal_usuarios u ON u.[id] = t.[enviado_por_usuario_id]
    WHERE t.[token] = @token;
  `);

  const row = result.recordset[0];
  if (!row) return null;

  const arquivosResult = await pool
    .request()
    .input("transferenciaId", sql.UniqueIdentifier, row.id)
    .query<ArquivoRow>(`
      SELECT ${colunasArquivo}
      FROM dbo.portal_transferencia_arquivos
      WHERE [transferencia_id] = @transferenciaId
      ORDER BY [criado_em] ASC;
    `);

  const arquivos = arquivosResult.recordset.map(mapArquivoRow);

  return {
    arquivos: arquivos.map((arquivo) => ({
      id: arquivo.id,
      nomeOriginal: arquivo.nomeOriginal,
      tamanhoBytes: arquivo.tamanhoBytes,
    })),
    tamanhoTotalBytes: arquivos.reduce((total, arquivo) => total + arquivo.tamanhoBytes, 0),
    mensagem: row.mensagem,
    enviadoPorNome: row.enviado_por_nome,
    criadoEm: row.criado_em,
    expiraEm: row.expira_em,
  };
}

export interface ArquivoParaServir {
  caminhoCompleto: string;
  tipoMime: string;
  tamanhoBytes: number;
  nomeOriginal: string;
}

/* Serve um arquivo específico do lote — usada pela rota pública de download individual. */
export async function buscarArquivoParaServir(
  token: string,
  arquivoId: string
): Promise<ArquivoParaServir | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("token", sql.VarChar(64), token);
  request.input("arquivoId", sql.UniqueIdentifier, arquivoId);

  const result = await request.query<{
    caminho_arquivo: string;
    tipo_mime: string;
    tamanho_bytes: number;
    nome_original: string;
  }>(`
    SELECT a.[caminho_arquivo], a.[tipo_mime], a.[tamanho_bytes], a.[nome_original]
    FROM dbo.portal_transferencia_arquivos a
    INNER JOIN dbo.portal_transferencias t ON t.[id] = a.[transferencia_id]
    WHERE t.[token] = @token AND a.[id] = @arquivoId AND t.[expira_em] > SYSDATETIME();
  `);

  const row = result.recordset[0];
  if (!row) return null;

  const config = await buscarConfigTransferencia();
  if (!config.pastaArmazenamento) return null;

  return {
    caminhoCompleto: path.join(config.pastaArmazenamento, row.caminho_arquivo),
    tipoMime: row.tipo_mime,
    tamanhoBytes: row.tamanho_bytes,
    nomeOriginal: row.nome_original,
  };
}

export interface ArquivosParaZip {
  arquivos: { caminhoCompleto: string; nomeOriginal: string }[];
}

/* Todos os arquivos do lote, para a rota que gera o .zip sob demanda. */
export async function buscarArquivosParaZip(token: string): Promise<ArquivosParaZip | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("token", sql.VarChar(64), token);

  const result = await request.query<{ caminho_arquivo: string; nome_original: string }>(`
    SELECT a.[caminho_arquivo], a.[nome_original]
    FROM dbo.portal_transferencia_arquivos a
    INNER JOIN dbo.portal_transferencias t ON t.[id] = a.[transferencia_id]
    WHERE t.[token] = @token AND t.[expira_em] > SYSDATETIME()
    ORDER BY a.[criado_em] ASC;
  `);

  if (result.recordset.length === 0) return null;

  const config = await buscarConfigTransferencia();
  if (!config.pastaArmazenamento) return null;

  return {
    arquivos: result.recordset.map((row) => ({
      caminhoCompleto: path.join(config.pastaArmazenamento as string, row.caminho_arquivo),
      nomeOriginal: row.nome_original,
    })),
  };
}

async function apagarArquivoDoDisco(caminhoArquivo: string): Promise<void> {
  const config = await buscarConfigTransferencia();
  if (!config.pastaArmazenamento) return;

  try {
    await unlink(path.join(config.pastaArmazenamento, caminhoArquivo));
  } catch (error) {
    console.error("Erro ao remover arquivo de transferência do disco:", error);
  }
}

async function buscarCaminhosDosArquivos(transferenciaId: string): Promise<string[]> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("transferenciaId", sql.UniqueIdentifier, transferenciaId)
    .query<{ caminho_arquivo: string }>(`
      SELECT [caminho_arquivo] FROM dbo.portal_transferencia_arquivos WHERE [transferencia_id] = @transferenciaId;
    `);

  return result.recordset.map((row) => row.caminho_arquivo);
}

/*
 * Sempre expressa como "horas a partir de agora" — pra "expirar
 * agora" o chamador passa 0, sem precisar de um caminho de código
 * separado. Igual a excluirTransferencia, só o dono ou um admin pode
 * editar.
 */
export async function atualizarExpiracao(
  id: string,
  usuario: Pick<PortalUsuario, "id" | "ehAdministrador">,
  duracaoHorasAPartirDeAgora: number
): Promise<Transferencia | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const dados = await request.query<{ enviado_por_usuario_id: string }>(`
    SELECT [enviado_por_usuario_id] FROM dbo.portal_transferencias WHERE [id] = @id;
  `);

  const linha = dados.recordset[0];
  if (!linha) return null;

  if (linha.enviado_por_usuario_id !== usuario.id && !usuario.ehAdministrador) {
    throw new ValidationError("Você não tem permissão para editar esta transferência.");
  }

  const updateRequest = pool.request();
  updateRequest.input("id", sql.UniqueIdentifier, id);
  updateRequest.input("duracaoHoras", sql.Int, duracaoHorasAPartirDeAgora);

  const result = await updateRequest.query<TransferenciaRow>(`
    UPDATE dbo.portal_transferencias
    SET [expira_em] = DATEADD(HOUR, @duracaoHoras, SYSDATETIME())
    OUTPUT
      CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
      INSERTED.[token],
      INSERTED.[mensagem],
      CONVERT(VARCHAR(36), INSERTED.[enviado_por_usuario_id]) AS [enviado_por_usuario_id],
      INSERTED.[destinatario_email],
      CAST(INSERTED.[email_enviado] AS BIT) AS [email_enviado],
      CONVERT(VARCHAR(33), INSERTED.[criado_em], 126) AS [criado_em],
      CONVERT(VARCHAR(33), INSERTED.[expira_em], 126) AS [expira_em]
    WHERE [id] = @id;
  `);

  const transferenciaRow = result.recordset[0];
  const arquivos = (await buscarArquivosPorTransferencias([transferenciaRow.id])).get(
    transferenciaRow.id
  ) ?? [];

  return montarTransferencia(transferenciaRow, arquivos);
}

export async function excluirTransferencia(
  id: string,
  usuario: Pick<PortalUsuario, "id" | "ehAdministrador">
): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const dados = await request.query<{ enviado_por_usuario_id: string }>(`
    SELECT [enviado_por_usuario_id] FROM dbo.portal_transferencias WHERE [id] = @id;
  `);

  const linha = dados.recordset[0];
  if (!linha) return false;

  if (linha.enviado_por_usuario_id !== usuario.id && !usuario.ehAdministrador) {
    throw new ValidationError("Você não tem permissão para excluir esta transferência.");
  }

  const caminhosArquivos = await buscarCaminhosDosArquivos(id);

  const deleteRequest = pool.request();
  deleteRequest.input("id", sql.UniqueIdentifier, id);
  /* ON DELETE CASCADE em portal_transferencia_arquivos já remove os arquivos filhos. */
  await deleteRequest.query(`DELETE FROM dbo.portal_transferencias WHERE [id] = @id;`);

  for (const caminho of caminhosArquivos) {
    await apagarArquivoDoDisco(caminho);
  }

  return true;
}

/* Usado só pelo agendador de limpeza (src/lib/transferencia/scheduler.ts). */
export async function limparTransferenciasExpiradas(): Promise<number> {
  const pool = await getSqlServerPool();

  const expiradas = await pool.request().query<{ id: string }>(`
    SELECT CONVERT(VARCHAR(36), [id]) AS [id]
    FROM dbo.portal_transferencias
    WHERE [expira_em] <= SYSDATETIME();
  `);

  for (const linha of expiradas.recordset) {
    const caminhosArquivos = await buscarCaminhosDosArquivos(linha.id);

    const deleteRequest = pool.request();
    deleteRequest.input("id", sql.UniqueIdentifier, linha.id);
    await deleteRequest.query(`DELETE FROM dbo.portal_transferencias WHERE [id] = @id;`);

    for (const caminho of caminhosArquivos) {
      await apagarArquivoDoDisco(caminho);
    }
  }

  return expiradas.recordset.length;
}
