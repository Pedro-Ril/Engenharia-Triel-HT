import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";
import { TIPOS_MIME_EVIDENCIA_ACEITOS } from "./evidencias";

export const TAMANHO_MAXIMO_ANEXO_MOVIMENTACAO_BYTES = 8 * 1024 * 1024;
export const MAXIMO_ANEXOS_POR_MOVIMENTACAO = 10;

export interface AnexoMovimentacao {
  id: string;
  movimentacaoId: string;
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  criadoPorNome: string;
  criadoEm: string;
}

export interface NovoAnexoMovimentacao {
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  conteudo: Buffer;
}

/*
 * Documento anexado a uma ação do estrato (empréstimo, consignação,
 * retorno, baixa) — mesmo campo de formulário "anexos" pras quatro
 * ações, já que cada uma só gera uma movimentação por vez. Mesmos
 * limites/tipos aceitos de evidências de equipamento (imagem, PDF,
 * Word, Excel — ver evidencias.ts).
 */
export async function parseAnexosMovimentacaoFormData(formData: FormData): Promise<NovoAnexoMovimentacao[]> {
  const arquivos = formData
    .getAll("anexos")
    .filter((valor): valor is File => valor instanceof File && valor.size > 0);

  if (arquivos.length === 0) return [];

  if (arquivos.length > MAXIMO_ANEXOS_POR_MOVIMENTACAO) {
    throw new ValidationError(`Envie no máximo ${MAXIMO_ANEXOS_POR_MOVIMENTACAO} anexos por ação.`);
  }

  const resultado: NovoAnexoMovimentacao[] = [];

  for (const arquivo of arquivos) {
    if (arquivo.size > TAMANHO_MAXIMO_ANEXO_MOVIMENTACAO_BYTES) {
      throw new ValidationError(
        `O arquivo "${arquivo.name}" excede o limite de ${TAMANHO_MAXIMO_ANEXO_MOVIMENTACAO_BYTES / (1024 * 1024)}MB.`
      );
    }

    const tipoMime = arquivo.type || "application/octet-stream";

    if (!TIPOS_MIME_EVIDENCIA_ACEITOS.includes(tipoMime)) {
      throw new ValidationError(
        `O arquivo "${arquivo.name}" não é um formato aceito (imagem, PDF, Word ou Excel).`
      );
    }

    resultado.push({
      nomeArquivo: arquivo.name.slice(0, 260),
      tipoMime,
      tamanhoBytes: arquivo.size,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });
  }

  return resultado;
}

export async function salvarAnexosMovimentacao(
  movimentacaoId: string,
  anexos: NovoAnexoMovimentacao[],
  criadoPorUsuarioId: string,
  criadoPorNome: string
): Promise<void> {
  if (anexos.length === 0) return;

  const pool = await getSqlServerPool();

  for (const anexo of anexos) {
    await pool
      .request()
      .input("movimentacaoId", sql.UniqueIdentifier, movimentacaoId)
      .input("nomeArquivo", sql.NVarChar(260), anexo.nomeArquivo)
      .input("tipoMime", sql.VarChar(100), anexo.tipoMime)
      .input("tamanhoBytes", sql.Int, anexo.tamanhoBytes)
      .input("conteudo", sql.VarBinary(sql.MAX), anexo.conteudo)
      .input("criadoPorUsuarioId", sql.UniqueIdentifier, criadoPorUsuarioId)
      .input("criadoPorNome", sql.NVarChar(150), criadoPorNome)
      .query(`
        INSERT INTO dbo.com_estoque_movimentacoes_anexos
          ([movimentacao_id], [nome_arquivo], [tipo_mime], [tamanho_bytes], [conteudo], [criado_por_usuario_id], [criado_por_nome])
        VALUES
          (@movimentacaoId, @nomeArquivo, @tipoMime, @tamanhoBytes, @conteudo, @criadoPorUsuarioId, @criadoPorNome);
      `);
  }
}

interface AnexoMovimentacaoRow {
  id: string;
  movimentacao_id: string;
  nome_arquivo: string;
  tipo_mime: string;
  tamanho_bytes: number;
  criado_por_nome: string;
  criado_em: string;
}

function mapAnexoRow(row: AnexoMovimentacaoRow): AnexoMovimentacao {
  return {
    id: row.id,
    movimentacaoId: row.movimentacao_id,
    nomeArquivo: row.nome_arquivo,
    tipoMime: row.tipo_mime,
    tamanhoBytes: row.tamanho_bytes,
    criadoPorNome: row.criado_por_nome,
    criadoEm: row.criado_em,
  };
}

/* Todos os anexos de todas as movimentações de um equipamento — a tela de
   detalhe monta o mapa movimentacaoId -> anexos[] de uma vez só. */
export async function listarAnexosDoEquipamento(equipamentoId: string): Promise<AnexoMovimentacao[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("equipamentoId", sql.UniqueIdentifier, equipamentoId)
    .query<AnexoMovimentacaoRow>(`
      SELECT
        CONVERT(VARCHAR(36), a.[id]) AS [id],
        CONVERT(VARCHAR(36), a.[movimentacao_id]) AS [movimentacao_id],
        a.[nome_arquivo],
        a.[tipo_mime],
        a.[tamanho_bytes],
        a.[criado_por_nome],
        CONVERT(VARCHAR(33), a.[criado_em], 126) AS [criado_em]
      FROM dbo.com_estoque_movimentacoes_anexos AS a
      INNER JOIN dbo.com_estoque_equipamentos_usados_movimentacoes AS m ON m.[id] = a.[movimentacao_id]
      WHERE m.[equipamento_id] = @equipamentoId
      ORDER BY a.[criado_em];
    `);

  return result.recordset.map(mapAnexoRow);
}

export async function buscarAnexoMovimentacao(
  id: string
): Promise<{ nomeArquivo: string; tipoMime: string; conteudo: Buffer } | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<{ nome_arquivo: string; tipo_mime: string; conteudo: Buffer }>(`
      SELECT [nome_arquivo], [tipo_mime], [conteudo]
      FROM dbo.com_estoque_movimentacoes_anexos
      WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  if (!row) return null;

  return { nomeArquivo: row.nome_arquivo, tipoMime: row.tipo_mime, conteudo: row.conteudo };
}
