import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

import { buscarConfigTv } from "./config";

export interface MidiaTv {
  id: string;
  nomeOriginal: string;
  tipoMime: string;
  tipo: "video" | "foto" | "documento";
  tamanhoBytes: number;
  enviadoPor: string | null;
  criadoEm: string;
  emUso: number;
  pastaId: string | null;
  pastaNome: string | null;
}

export interface PastaMidia {
  id: string;
  nome: string;
  criadoEm: string;
  totalMidias: number;
}

/*
 * 2GB — bem maior que o limite de Downloads (200MB), porque vídeo
 * pra sinalização digital pode ser grande. Ainda carrega o arquivo
 * inteiro em memória via arrayBuffer() antes de gravar (mesmo padrão
 * já usado em todo upload existente do projeto — Downloads, anexos de
 * chamados) — streaming direto pro disco evitaria isso, mas é uma
 * mudança maior de arquitetura de upload que fica pra depois, não
 * bloqueia o funcionamento inicial.
 */
export const TAMANHO_MAXIMO_MIDIA_BYTES = 2 * 1024 * 1024 * 1024;

const colunasMidia = `
  CONVERT(VARCHAR(36), m.[id]) AS [id],
  m.[nome_original],
  m.[tipo_mime],
  m.[tipo],
  m.[tamanho_bytes],
  m.[enviado_por],
  CONVERT(VARCHAR(33), m.[criado_em], 126) AS [criado_em],
  (SELECT COUNT(*) FROM dbo.portal_tv_slot_itens i WHERE i.[midia_id] = m.[id]) AS [em_uso],
  CONVERT(VARCHAR(36), m.[pasta_id]) AS [pasta_id],
  p.[nome] AS [pasta_nome]
`;

function mapMidiaRow(row: {
  id: string;
  nome_original: string;
  tipo_mime: string;
  tipo: string;
  tamanho_bytes: number;
  enviado_por: string | null;
  criado_em: string;
  em_uso: number;
  pasta_id: string | null;
  pasta_nome: string | null;
}): MidiaTv {
  return {
    id: row.id,
    nomeOriginal: row.nome_original,
    tipoMime: row.tipo_mime,
    tipo: row.tipo as MidiaTv["tipo"],
    tamanhoBytes: row.tamanho_bytes,
    enviadoPor: row.enviado_por,
    criadoEm: row.criado_em,
    emUso: row.em_uso,
    pastaId: row.pasta_id,
    pastaNome: row.pasta_nome,
  };
}

export async function listarMidias(): Promise<MidiaTv[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query(`
    SELECT ${colunasMidia}
    FROM dbo.portal_tv_midias m
    LEFT JOIN dbo.portal_tv_midias_pastas p ON p.[id] = m.[pasta_id]
    ORDER BY m.[criado_em] DESC;
  `);

  return result.recordset.map(mapMidiaRow);
}

export async function listarPastasMidia(): Promise<PastaMidia[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    id: string;
    nome: string;
    criado_em: string;
    total_midias: number;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), p.[id]) AS [id],
      p.[nome],
      CONVERT(VARCHAR(33), p.[criado_em], 126) AS [criado_em],
      (SELECT COUNT(*) FROM dbo.portal_tv_midias m WHERE m.[pasta_id] = p.[id]) AS [total_midias]
    FROM dbo.portal_tv_midias_pastas p
    ORDER BY p.[nome];
  `);

  return result.recordset.map((row) => ({
    id: row.id,
    nome: row.nome,
    criadoEm: row.criado_em,
    totalMidias: row.total_midias,
  }));
}

export async function criarPastaMidia(nome: string): Promise<PastaMidia> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("nome", sql.NVarChar(100), nome);

  try {
    const result = await request.query<{ id: string; nome: string; criado_em: string }>(`
      INSERT INTO dbo.portal_tv_midias_pastas ([nome])
      OUTPUT
        CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
        INSERTED.[nome],
        CONVERT(VARCHAR(33), INSERTED.[criado_em], 126) AS [criado_em]
      VALUES (@nome);
    `);

    const row = result.recordset[0];
    return { id: row.id, nome: row.nome, criadoEm: row.criado_em, totalMidias: 0 };
  } catch (error) {
    if (error instanceof Error && /UQ_ptvmp_nome/i.test(error.message)) {
      throw new ValidationError("Já existe uma pasta com esse nome.");
    }
    throw error;
  }
}

/*
 * Só permite excluir pasta vazia — mesmo espírito de excluirMidia
 * (não deixa quebrar referência em uso). Mover a mídia pra outra
 * pasta (ou "sem pasta") antes de excluir.
 */
export async function excluirPastaMidia(id: string): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const emUso = await request.query<{ total: number }>(`
    SELECT COUNT(*) AS [total] FROM dbo.portal_tv_midias WHERE [pasta_id] = @id;
  `);

  if ((emUso.recordset[0]?.total ?? 0) > 0) {
    throw new ValidationError(
      "Esta pasta tem mídias dentro. Mova-as pra outra pasta (ou remova a pasta delas) antes de excluir."
    );
  }

  const deleteRequest = pool.request();
  deleteRequest.input("id", sql.UniqueIdentifier, id);
  await deleteRequest.query(`DELETE FROM dbo.portal_tv_midias_pastas WHERE [id] = @id;`);
}

export async function moverMidiaParaPasta(
  midiaId: string,
  pastaId: string | null
): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, midiaId);
  request.input("pastaId", sql.UniqueIdentifier, pastaId);

  await request.query(`
    UPDATE dbo.portal_tv_midias
    SET [pasta_id] = @pastaId
    WHERE [id] = @id;
  `);
}

async function diretorioMidiasObrigatorio(): Promise<string> {
  const config = await buscarConfigTv();

  if (!config.diretorioMidias) {
    throw new ValidationError(
      "Configure o diretório de armazenamento de mídias antes de enviar arquivos (aba Configurações)."
    );
  }

  return config.diretorioMidias;
}

export async function salvarMidia(params: {
  arquivo: File;
  tipo: MidiaTv["tipo"];
  enviadoPor: string;
  pastaId?: string | null;
}): Promise<MidiaTv> {
  if (params.arquivo.size === 0) {
    throw new ValidationError("O arquivo está vazio.");
  }

  if (params.arquivo.size > TAMANHO_MAXIMO_MIDIA_BYTES) {
    throw new ValidationError(
      `O arquivo excede o tamanho máximo permitido (${Math.round(TAMANHO_MAXIMO_MIDIA_BYTES / 1024 / 1024)}MB).`
    );
  }

  const diretorio = await diretorioMidiasObrigatorio();
  const extensao = path.extname(params.arquivo.name) || "";
  const nomeArquivo = `${randomUUID()}${extensao}`;
  const caminhoCompleto = path.join(diretorio, nomeArquivo);

  await mkdir(diretorio, { recursive: true });

  const buffer = Buffer.from(await params.arquivo.arrayBuffer());
  await writeFile(caminhoCompleto, buffer);

  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("nomeOriginal", sql.NVarChar(260), params.arquivo.name);
  request.input("tipoMime", sql.NVarChar(150), params.arquivo.type || "application/octet-stream");
  request.input("tipo", sql.VarChar(20), params.tipo);
  request.input("tamanhoBytes", sql.BigInt, params.arquivo.size);
  request.input("caminhoArquivo", sql.NVarChar(500), nomeArquivo);
  request.input("enviadoPor", sql.NVarChar(150), params.enviadoPor);
  request.input("pastaId", sql.UniqueIdentifier, params.pastaId ?? null);

  const result = await request.query<{ id: string }>(`
    INSERT INTO dbo.portal_tv_midias
      ([nome_original], [tipo_mime], [tipo], [tamanho_bytes], [caminho_arquivo], [enviado_por], [pasta_id])
    OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
    VALUES (@nomeOriginal, @tipoMime, @tipo, @tamanhoBytes, @caminhoArquivo, @enviadoPor, @pastaId);
  `);

  const midiaId = result.recordset[0].id;

  const detalheRequest = pool.request();
  detalheRequest.input("id", sql.UniqueIdentifier, midiaId);
  const detalhe = await detalheRequest.query(`
    SELECT ${colunasMidia}
    FROM dbo.portal_tv_midias m
    LEFT JOIN dbo.portal_tv_midias_pastas p ON p.[id] = m.[pasta_id]
    WHERE m.[id] = @id;
  `);

  return mapMidiaRow(detalhe.recordset[0]);
}

export async function buscarMidiaParaServir(
  id: string
): Promise<{ caminhoCompleto: string; tipoMime: string; tamanhoBytes: number; nomeOriginal: string } | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query<{
    caminho_arquivo: string;
    tipo_mime: string;
    tamanho_bytes: number;
    nome_original: string;
  }>(`
    SELECT [caminho_arquivo], [tipo_mime], [tamanho_bytes], [nome_original]
    FROM dbo.portal_tv_midias
    WHERE [id] = @id;
  `);

  const row = result.recordset[0];
  if (!row) return null;

  const config = await buscarConfigTv();
  if (!config.diretorioMidias) return null;

  return {
    caminhoCompleto: path.join(config.diretorioMidias, row.caminho_arquivo),
    tipoMime: row.tipo_mime,
    tamanhoBytes: row.tamanho_bytes,
    nomeOriginal: row.nome_original,
  };
}

/*
 * Só permite excluir mídia que não está em uso em nenhum item de
 * playlist — evita quebrar uma grade em produção silenciosamente
 * (mesmo espírito de excluirSetor/excluirModulo em
 * src/lib/auth/admin.ts).
 */
export async function excluirMidia(id: string): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const emUso = await request.query<{ total: number }>(`
    SELECT COUNT(*) AS [total] FROM dbo.portal_tv_slot_itens WHERE [midia_id] = @id;
  `);

  if ((emUso.recordset[0]?.total ?? 0) > 0) {
    throw new ValidationError(
      "Esta mídia está em uso em uma ou mais grades. Remova-a das playlists antes de excluir."
    );
  }

  const dadosRequest = pool.request();
  dadosRequest.input("id", sql.UniqueIdentifier, id);
  const dados = await dadosRequest.query<{ caminho_arquivo: string }>(`
    SELECT [caminho_arquivo] FROM dbo.portal_tv_midias WHERE [id] = @id;
  `);

  const linha = dados.recordset[0];
  if (!linha) return;

  const config = await buscarConfigTv();

  const deleteRequest = pool.request();
  deleteRequest.input("id", sql.UniqueIdentifier, id);
  await deleteRequest.query(`DELETE FROM dbo.portal_tv_midias WHERE [id] = @id;`);

  if (config.diretorioMidias) {
    try {
      await unlink(path.join(config.diretorioMidias, linha.caminho_arquivo));
    } catch (error) {
      console.error("Erro ao remover arquivo de mídia de TV do disco:", error);
    }
  }
}
