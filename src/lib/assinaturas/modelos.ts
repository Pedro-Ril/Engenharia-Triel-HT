import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export type FonteAssinatura = "Metropolis" | "Metropolis Bold" | "Montserrat" | "Montserrat Bold";

export interface CampoAssinaturaConfig {
  x: number;
  y: number;
  tamanhoPx: number;
  fonte: FonteAssinatura;
  cor: string;
}

export interface CampoSobrenomeConfig extends CampoAssinaturaConfig {
  /* Quando true, [x] é ignorado -- a posição real é calculada medindo a largura do nome desenhado + espacamentoAposNomePx (ver desenharAssinaturaNoCanvas). */
  seguirNome: boolean;
  espacamentoAposNomePx: number;
}

export interface CamposAssinaturaConfig {
  nome: CampoAssinaturaConfig;
  sobrenome: CampoSobrenomeConfig;
  setor: CampoAssinaturaConfig;
  email: CampoAssinaturaConfig;
  celular: CampoAssinaturaConfig;
}

/* Nunca inclui o blob da imagem -- ver buscarImagemModelo, chamado à parte só quando o cliente precisa carregar o PNG de fundo. */
export interface ModeloAssinatura {
  id: string;
  nome: string;
  imagemLargura: number;
  imagemAltura: number;
  camposConfig: CamposAssinaturaConfig;
  ativo: boolean;
  ordem: number;
}

export interface ModeloAssinaturaAdmin extends ModeloAssinatura {
  criadoEm: string;
  criadoPor: string | null;
  atualizadoEm: string;
  atualizadoPor: string | null;
}

interface ModeloRow {
  id: string;
  nome: string;
  imagem_largura: number;
  imagem_altura: number;
  campos_config: string;
  ativo: boolean;
  ordem: number;
}

interface ModeloAdminRow extends ModeloRow {
  criado_em: string;
  criado_por: string | null;
  atualizado_em: string;
  atualizado_por: string | null;
}

const colunasModelo = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [nome],
  [imagem_largura],
  [imagem_altura],
  [campos_config],
  [ativo],
  [ordem]
`;

const colunasModeloAdmin = `
  ${colunasModelo},
  CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
  [criado_por],
  CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
  [atualizado_por]
`;

function mapModeloRow(row: ModeloRow): ModeloAssinatura {
  return {
    id: row.id,
    nome: row.nome,
    imagemLargura: row.imagem_largura,
    imagemAltura: row.imagem_altura,
    camposConfig: JSON.parse(row.campos_config) as CamposAssinaturaConfig,
    ativo: row.ativo,
    ordem: row.ordem,
  };
}

function mapModeloAdminRow(row: ModeloAdminRow): ModeloAssinaturaAdmin {
  return {
    ...mapModeloRow(row),
    criadoEm: row.criado_em,
    criadoPor: row.criado_por,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

export async function listarModelosAtivos(): Promise<ModeloAssinatura[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<ModeloRow>(`
    SELECT ${colunasModelo}
    FROM dbo.portal_assinaturas_modelos
    WHERE [ativo] = 1
    ORDER BY [ordem], [nome];
  `);

  return result.recordset.map(mapModeloRow);
}

export async function listarModelosAdmin(): Promise<ModeloAssinaturaAdmin[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<ModeloAdminRow>(`
    SELECT ${colunasModeloAdmin}
    FROM dbo.portal_assinaturas_modelos
    ORDER BY [ordem], [nome];
  `);

  return result.recordset.map(mapModeloAdminRow);
}

export async function buscarModeloPorId(id: string): Promise<ModeloAssinaturaAdmin | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<ModeloAdminRow>(`
      SELECT ${colunasModeloAdmin}
      FROM dbo.portal_assinaturas_modelos
      WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  return row ? mapModeloAdminRow(row) : null;
}

export interface ImagemModelo {
  conteudo: Buffer;
  tipoMime: string;
}

export async function buscarImagemModelo(id: string): Promise<ImagemModelo | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<{ imagem_fundo: Buffer; imagem_tipo_mime: string; ativo: boolean }>(`
      SELECT [imagem_fundo], [imagem_tipo_mime], [ativo]
      FROM dbo.portal_assinaturas_modelos
      WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  if (!row || !row.ativo) return null;

  return { conteudo: row.imagem_fundo, tipoMime: row.imagem_tipo_mime };
}

/* Mesma checagem usada pra servir a imagem no admin (que precisa ver mesmo modelos inativos) -- separada da pública porque não filtra por ativo. */
export async function buscarImagemModeloAdmin(id: string): Promise<ImagemModelo | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<{ imagem_fundo: Buffer; imagem_tipo_mime: string }>(`
      SELECT [imagem_fundo], [imagem_tipo_mime]
      FROM dbo.portal_assinaturas_modelos
      WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  return row ? { conteudo: row.imagem_fundo, tipoMime: row.imagem_tipo_mime } : null;
}

async function proximaOrdem(pool: Awaited<ReturnType<typeof getSqlServerPool>>): Promise<number> {
  const result = await pool.request().query<{ proxima: number }>(`
    SELECT ISNULL(MAX([ordem]), -1) + 1 AS [proxima] FROM dbo.portal_assinaturas_modelos;
  `);
  return result.recordset[0]?.proxima ?? 0;
}

export interface CriarModeloParams {
  nome: string;
  imagem: { conteudo: Buffer; tipoMime: string; largura: number; altura: number };
  camposConfig: CamposAssinaturaConfig;
  criadoPor: string;
}

export async function criarModelo(params: CriarModeloParams): Promise<ModeloAssinaturaAdmin> {
  const pool = await getSqlServerPool();

  const existente = await pool
    .request()
    .input("nome", sql.NVarChar(150), params.nome)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS [total] FROM dbo.portal_assinaturas_modelos WHERE [nome] = @nome;
    `);

  if (existente.recordset[0].total > 0) {
    throw new ValidationError(`Já existe um modelo chamado "${params.nome}".`);
  }

  const ordem = await proximaOrdem(pool);

  const result = await pool
    .request()
    .input("nome", sql.NVarChar(150), params.nome)
    .input("imagemFundo", sql.VarBinary(sql.MAX), params.imagem.conteudo)
    .input("imagemTipoMime", sql.NVarChar(100), params.imagem.tipoMime)
    .input("imagemLargura", sql.Int, params.imagem.largura)
    .input("imagemAltura", sql.Int, params.imagem.altura)
    .input("camposConfig", sql.NVarChar(sql.MAX), JSON.stringify(params.camposConfig))
    .input("ordem", sql.Int, ordem)
    .input("criadoPor", sql.NVarChar(150), params.criadoPor)
    .query<{ id: string }>(`
      INSERT INTO dbo.portal_assinaturas_modelos
        ([nome], [imagem_fundo], [imagem_tipo_mime], [imagem_largura], [imagem_altura], [campos_config], [ordem], [criado_por])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@nome, @imagemFundo, @imagemTipoMime, @imagemLargura, @imagemAltura, @camposConfig, @ordem, @criadoPor);
    `);

  const criado = await buscarModeloPorId(result.recordset[0].id);
  if (!criado) throw new Error("Modelo criado mas não encontrado logo em seguida.");
  return criado;
}

export interface AtualizarModeloParams {
  nome?: string;
  imagem?: { conteudo: Buffer; tipoMime: string; largura: number; altura: number };
  camposConfig?: CamposAssinaturaConfig;
  ativo?: boolean;
  ordem?: number;
  atualizadoPor: string;
}

export async function atualizarModelo(id: string, dados: AtualizarModeloParams): Promise<ModeloAssinaturaAdmin> {
  const pool = await getSqlServerPool();

  if (dados.nome !== undefined) {
    const existente = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("nome", sql.NVarChar(150), dados.nome)
      .query<{ total: number }>(`
        SELECT COUNT(*) AS [total] FROM dbo.portal_assinaturas_modelos WHERE [nome] = @nome AND [id] <> @id;
      `);

    if (existente.recordset[0].total > 0) {
      throw new ValidationError(`Já existe um modelo chamado "${dados.nome}".`);
    }
  }

  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const sets: string[] = [];

  if (dados.nome !== undefined) {
    request.input("nome", sql.NVarChar(150), dados.nome);
    sets.push("[nome] = @nome");
  }
  if (dados.imagem) {
    request.input("imagemFundo", sql.VarBinary(sql.MAX), dados.imagem.conteudo);
    request.input("imagemTipoMime", sql.NVarChar(100), dados.imagem.tipoMime);
    request.input("imagemLargura", sql.Int, dados.imagem.largura);
    request.input("imagemAltura", sql.Int, dados.imagem.altura);
    sets.push(
      "[imagem_fundo] = @imagemFundo",
      "[imagem_tipo_mime] = @imagemTipoMime",
      "[imagem_largura] = @imagemLargura",
      "[imagem_altura] = @imagemAltura"
    );
  }
  if (dados.camposConfig !== undefined) {
    request.input("camposConfig", sql.NVarChar(sql.MAX), JSON.stringify(dados.camposConfig));
    sets.push("[campos_config] = @camposConfig");
  }
  if (dados.ativo !== undefined) {
    request.input("ativo", sql.Bit, dados.ativo);
    sets.push("[ativo] = @ativo");
  }
  if (dados.ordem !== undefined) {
    request.input("ordem", sql.Int, dados.ordem);
    sets.push("[ordem] = @ordem");
  }

  if (sets.length > 0) {
    request.input("atualizadoPor", sql.NVarChar(150), dados.atualizadoPor);
    sets.push("[atualizado_em] = SYSDATETIME()", "[atualizado_por] = @atualizadoPor");

    await request.query(`
      UPDATE dbo.portal_assinaturas_modelos
      SET ${sets.join(", ")}
      WHERE [id] = @id;
    `);
  }

  const atualizado = await buscarModeloPorId(id);
  if (!atualizado) throw new ValidationError("Modelo não encontrado.");
  return atualizado;
}

export async function excluirModelo(id: string): Promise<void> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query(`DELETE FROM dbo.portal_assinaturas_modelos WHERE [id] = @id;`);
}
