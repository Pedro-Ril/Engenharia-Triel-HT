import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

export const TAMANHO_MAXIMO_EVIDENCIA_BYTES = 8 * 1024 * 1024;
export const MAXIMO_EVIDENCIAS_POR_BLOCO = 10;
export const TIPOS_MIME_EVIDENCIA_ACEITOS = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export interface EvidenciaEquipamento {
  id: string;
  equipamentoId: string;
  blocoId: string;
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  criadoPorNome: string;
  criadoEm: string;
}

export interface NovaEvidencia {
  blocoId: string;
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  conteudo: Buffer;
}

/*
 * Extrai as evidências de um FormData — um grupo de arquivos por bloco
 * (ex: "evidencias_<blocoId>", blocoId dinâmico já que os blocos variam
 * por tipo de equipamento), mesmo espírito de parseAnexosFormData em
 * src/lib/chamados/validacao.ts, mas com limites próprios (imagem, 8MB,
 * até 10 por bloco) — não reaproveita as constantes de chamados/wiki.
 */
export async function parseEvidenciasFormData(
  formData: FormData,
  blocoId: string
): Promise<NovaEvidencia[]> {
  const arquivos = formData
    .getAll(`evidencias_${blocoId}`)
    .filter((valor): valor is File => valor instanceof File && valor.size > 0);

  if (arquivos.length === 0) return [];

  if (arquivos.length > MAXIMO_EVIDENCIAS_POR_BLOCO) {
    throw new ValidationError(
      `Envie no máximo ${MAXIMO_EVIDENCIAS_POR_BLOCO} evidências por bloco.`
    );
  }

  const resultado: NovaEvidencia[] = [];

  for (const arquivo of arquivos) {
    if (arquivo.size > TAMANHO_MAXIMO_EVIDENCIA_BYTES) {
      throw new ValidationError(
        `O arquivo "${arquivo.name}" excede o limite de ${TAMANHO_MAXIMO_EVIDENCIA_BYTES / (1024 * 1024)}MB.`
      );
    }

    const tipoMime = arquivo.type || "application/octet-stream";

    if (!TIPOS_MIME_EVIDENCIA_ACEITOS.includes(tipoMime)) {
      throw new ValidationError(
        `O arquivo "${arquivo.name}" não é um formato aceito (imagem, PDF, Word ou Excel).`
      );
    }

    resultado.push({
      blocoId,
      nomeArquivo: arquivo.name.slice(0, 260),
      tipoMime,
      tamanhoBytes: arquivo.size,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });
  }

  return resultado;
}

export async function salvarEvidencias(
  equipamentoId: string,
  evidencias: NovaEvidencia[],
  criadoPorUsuarioId: string,
  criadoPorNome: string
): Promise<void> {
  if (evidencias.length === 0) return;

  const pool = await getSqlServerPool();

  for (const evidencia of evidencias) {
    await pool
      .request()
      .input("equipamentoId", sql.UniqueIdentifier, equipamentoId)
      .input("blocoId", sql.UniqueIdentifier, evidencia.blocoId)
      .input("nomeArquivo", sql.NVarChar(260), evidencia.nomeArquivo)
      .input("tipoMime", sql.VarChar(100), evidencia.tipoMime)
      .input("tamanhoBytes", sql.Int, evidencia.tamanhoBytes)
      .input("conteudo", sql.VarBinary(sql.MAX), evidencia.conteudo)
      .input("criadoPorUsuarioId", sql.UniqueIdentifier, criadoPorUsuarioId)
      .input("criadoPorNome", sql.NVarChar(150), criadoPorNome)
      .query(`
        INSERT INTO dbo.com_estoque_equipamentos_usados_evidencias
          ([equipamento_id], [bloco_id], [nome_arquivo], [tipo_mime], [tamanho_bytes], [conteudo], [criado_por_usuario_id], [criado_por_nome])
        VALUES
          (@equipamentoId, @blocoId, @nomeArquivo, @tipoMime, @tamanhoBytes, @conteudo, @criadoPorUsuarioId, @criadoPorNome);
      `);
  }
}

interface EvidenciaRow {
  id: string;
  equipamento_id: string;
  bloco_id: string;
  nome_arquivo: string;
  tipo_mime: string;
  tamanho_bytes: number;
  criado_por_nome: string;
  criado_em: string;
}

function mapEvidenciaRow(row: EvidenciaRow): EvidenciaEquipamento {
  return {
    id: row.id,
    equipamentoId: row.equipamento_id,
    blocoId: row.bloco_id,
    nomeArquivo: row.nome_arquivo,
    tipoMime: row.tipo_mime,
    tamanhoBytes: row.tamanho_bytes,
    criadoPorNome: row.criado_por_nome,
    criadoEm: row.criado_em,
  };
}

export async function listarEvidenciasDoEquipamento(
  equipamentoId: string
): Promise<EvidenciaEquipamento[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("equipamentoId", sql.UniqueIdentifier, equipamentoId)
    .query<EvidenciaRow>(`
      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        CONVERT(VARCHAR(36), [equipamento_id]) AS [equipamento_id],
        CONVERT(VARCHAR(36), [bloco_id]) AS [bloco_id],
        [nome_arquivo],
        [tipo_mime],
        [tamanho_bytes],
        [criado_por_nome],
        CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
      FROM dbo.com_estoque_equipamentos_usados_evidencias
      WHERE [equipamento_id] = @equipamentoId
      ORDER BY [bloco_id], [criado_em];
    `);

  return result.recordset.map(mapEvidenciaRow);
}

export async function buscarEvidencia(
  id: string
): Promise<{ nomeArquivo: string; tipoMime: string; conteudo: Buffer } | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<{ nome_arquivo: string; tipo_mime: string; conteudo: Buffer }>(`
      SELECT [nome_arquivo], [tipo_mime], [conteudo]
      FROM dbo.com_estoque_equipamentos_usados_evidencias
      WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  if (!row) return null;

  return { nomeArquivo: row.nome_arquivo, tipoMime: row.tipo_mime, conteudo: row.conteudo };
}

export async function excluirEvidencia(id: string): Promise<void> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query(`DELETE FROM dbo.com_estoque_equipamentos_usados_evidencias WHERE [id] = @id;`);
}
