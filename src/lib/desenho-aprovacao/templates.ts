import "server-only";

import { createHash } from "node:crypto";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import {
  validarTemplateJson,
  type TemplateJson,
} from "./template-schema";

/*
 * Acesso a dados do sistema de templates SVG dinâmicos
 * (eng_templates_aprovacao*, 14 tabelas retroativas em
 * db/schema/0070_desenho_aprovacao_retroativo.sql). Ver o achado da Fase 1
 * no plano: `eng_templates_aprovacao_versoes` tem um trigger real
 * (`trg_eng_templates_versoes_proteger_publicadas`) que torna uma versão
 * publicada imutável no banco — as funções de escrita aqui checam o status
 * antes de tentar, pra devolver um erro de validação amigável em vez de
 * deixar o banco rejeitar com uma mensagem genérica.
 */

export type StatusTemplate = "ativo" | "arquivado";
export type StatusVersaoTemplate = "rascunho" | "em_teste" | "publicado" | "arquivado";
export type TipoDadoCampo = "texto" | "numero" | "booleano" | "data";
export type CategoriaCampo =
  | "identificacao"
  | "cliente"
  | "produto"
  | "dimensoes"
  | "capacidade"
  | "cargas"
  | "revisao"
  | "auditoria"
  | "outro";

export interface Template {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  formatoPapel: string;
  orientacao: "horizontal" | "vertical";
  larguraMm: number;
  alturaMm: number;
  status: StatusTemplate;
  versaoPublicadaId: string | null;
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
  atualizadoPor: string;
}

export interface TemplateVersao {
  id: string;
  templateId: string;
  numeroVersao: number;
  status: StatusVersaoTemplate;
  templateJson: TemplateJson;
  svgPreview: string | null;
  observacao: string | null;
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
  atualizadoPor: string;
  publicadoEm: string | null;
  publicadoPor: string | null;
  arquivadoEm: string | null;
  arquivadoPor: string | null;
}

export interface CampoDinamico {
  id: string;
  chave: string;
  rotulo: string;
  categoria: CategoriaCampo;
  tipoDado: TipoDadoCampo;
  formatoPadrao: string | null;
  unidadePadrao: string | null;
  valorExemplo: string | null;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
}

export interface VinculoTemplate {
  id: string;
  templateId: string;
  produto: string;
  modelo: string | null;
  padrao: boolean;
  prioridade: number;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  ativo: boolean;
}

export interface AssetTemplate {
  id: string;
  escopo: "global" | "template" | "versao";
  templateId: string | null;
  versaoId: string | null;
  nome: string;
  tipo: string;
  mimeType: string;
  tamanhoBytes: number;
  hashSha256: string;
  larguraPx: number | null;
  alturaPx: number | null;
  viewbox: string | null;
  svgSanitizado: boolean;
  ativo: boolean;
  criadoEm: string;
  criadoPor: string;
}

const SELECT_TEMPLATE = `
  SELECT
    CONVERT(VARCHAR(36), [id]) AS [id],
    [codigo],
    [nome],
    [descricao],
    [formato_papel] AS [formatoPapel],
    [orientacao],
    [largura_mm] AS [larguraMm],
    [altura_mm] AS [alturaMm],
    [status],
    CONVERT(VARCHAR(36), [versao_publicada_id]) AS [versaoPublicadaId],
    CONVERT(VARCHAR(33), [criado_em], 126) AS [criadoEm],
    [criado_por] AS [criadoPor],
    CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizadoEm],
    [atualizado_por] AS [atualizadoPor]
  FROM [dbo].[eng_templates_aprovacao]
`;

interface TemplateVersaoRow {
  id: string;
  templateId: string;
  numeroVersao: number;
  status: StatusVersaoTemplate;
  templateJson: string;
  svgPreview: string | null;
  observacao: string | null;
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
  atualizadoPor: string;
  publicadoEm: string | null;
  publicadoPor: string | null;
  arquivadoEm: string | null;
  arquivadoPor: string | null;
}

const SELECT_VERSAO = `
  SELECT
    CONVERT(VARCHAR(36), [id]) AS [id],
    CONVERT(VARCHAR(36), [template_id]) AS [templateId],
    [numero_versao] AS [numeroVersao],
    [status],
    [template_json] AS [templateJson],
    [svg_preview] AS [svgPreview],
    [observacao],
    CONVERT(VARCHAR(33), [criado_em], 126) AS [criadoEm],
    [criado_por] AS [criadoPor],
    CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizadoEm],
    [atualizado_por] AS [atualizadoPor],
    CONVERT(VARCHAR(33), [publicado_em], 126) AS [publicadoEm],
    [publicado_por] AS [publicadoPor],
    CONVERT(VARCHAR(33), [arquivado_em], 126) AS [arquivadoEm],
    [arquivado_por] AS [arquivadoPor]
  FROM [dbo].[eng_templates_aprovacao_versoes]
`;

function mapVersaoRow(row: TemplateVersaoRow): TemplateVersao {
  return {
    ...row,
    templateJson: validarTemplateJson(JSON.parse(row.templateJson)),
  };
}

/* =========================================================
   TEMPLATES
   ========================================================= */

export async function listarTemplates(): Promise<Template[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<Template>(`
    ${SELECT_TEMPLATE}
    ORDER BY [atualizado_em] DESC;
  `);

  return result.recordset;
}

export async function buscarTemplatePorId(id: string): Promise<Template | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.VarChar(36), id)
    .query<Template>(`
      ${SELECT_TEMPLATE}
      WHERE [id] = @id;
    `);

  return result.recordset[0] ?? null;
}

export async function criarTemplate(
  input: {
    nome: string;
    descricao: string | null;
    formatoPapel: string;
    orientacao: "horizontal" | "vertical";
    larguraMm: number;
    alturaMm: number;
  },
  usuario: string
): Promise<Template> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("nome", sql.NVarChar(400), input.nome)
    .input("descricao", sql.NVarChar(2000), input.descricao)
    .input("formatoPapel", sql.VarChar(20), input.formatoPapel)
    .input("orientacao", sql.VarChar(20), input.orientacao)
    .input("larguraMm", sql.Decimal(10, 3), input.larguraMm)
    .input("alturaMm", sql.Decimal(10, 3), input.alturaMm)
    .input("usuario", sql.NVarChar(300), usuario)
    .query<Template>(`
      SET XACT_ABORT ON;

      DECLARE @novoTemplate TABLE ([id] UNIQUEIDENTIFIER NOT NULL);

      INSERT INTO [dbo].[eng_templates_aprovacao]
        ([nome], [descricao], [formato_papel], [orientacao], [largura_mm], [altura_mm],
         [criado_por], [atualizado_por])
      OUTPUT INSERTED.[id] INTO @novoTemplate ([id])
      VALUES
        (@nome, @descricao, @formatoPapel, @orientacao, @larguraMm, @alturaMm,
         @usuario, @usuario);

      ${SELECT_TEMPLATE}
      WHERE [id] = (SELECT TOP (1) [id] FROM @novoTemplate);
    `);

  return result.recordset[0];
}

export async function atualizarTemplate(
  id: string,
  input: {
    nome?: string;
    descricao?: string | null;
    status?: StatusTemplate;
  },
  usuario: string
): Promise<Template | null> {
  const atual = await buscarTemplatePorId(id);
  if (!atual) return null;

  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.VarChar(36), id)
    .input("nome", sql.NVarChar(400), input.nome ?? atual.nome)
    .input("descricao", sql.NVarChar(2000), input.descricao === undefined ? atual.descricao : input.descricao)
    .input("status", sql.VarChar(20), input.status ?? atual.status)
    .input("usuario", sql.NVarChar(300), usuario)
    .query<Template>(`
      SET XACT_ABORT ON;

      UPDATE [dbo].[eng_templates_aprovacao]
      SET
        [nome] = @nome,
        [descricao] = @descricao,
        [status] = @status,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @usuario
      WHERE [id] = @id;

      ${SELECT_TEMPLATE}
      WHERE [id] = @id;
    `);

  return result.recordset[0] ?? null;
}

/* =========================================================
   VERSÕES
   ========================================================= */

export async function listarVersoesDoTemplate(templateId: string): Promise<TemplateVersao[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("templateId", sql.VarChar(36), templateId)
    .query<TemplateVersaoRow>(`
      ${SELECT_VERSAO}
      WHERE [template_id] = @templateId
      ORDER BY [numero_versao] DESC;
    `);

  return result.recordset.map(mapVersaoRow);
}

export async function buscarVersaoPorId(versaoId: string): Promise<TemplateVersao | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.VarChar(36), versaoId)
    .query<TemplateVersaoRow>(`
      ${SELECT_VERSAO}
      WHERE [id] = @id;
    `);

  const row = result.recordset[0];
  return row ? mapVersaoRow(row) : null;
}

export async function criarNovaVersao(
  templateId: string,
  templateJson: unknown,
  usuario: string
): Promise<TemplateVersao> {
  const jsonValidado = validarTemplateJson(templateJson);
  const jsonTexto = JSON.stringify(jsonValidado);

  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const proximoNumeroResult = await new sql.Request(transaction)
      .input("templateId", sql.VarChar(36), templateId)
      .query<{ proximoNumero: number }>(`
        SELECT
          ISNULL(MAX([numero_versao]), 0) + 1 AS [proximoNumero]
        FROM [dbo].[eng_templates_aprovacao_versoes] WITH (UPDLOCK, HOLDLOCK)
        WHERE [template_id] = @templateId;
      `);

    const proximoNumero = proximoNumeroResult.recordset[0].proximoNumero;

    const result = await new sql.Request(transaction)
      .input("templateId", sql.VarChar(36), templateId)
      .input("numeroVersao", sql.Int, proximoNumero)
      .input("templateJson", sql.NVarChar(sql.MAX), jsonTexto)
      .input("usuario", sql.NVarChar(300), usuario)
      .query<TemplateVersaoRow>(`
        SET XACT_ABORT ON;

        DECLARE @novaVersao TABLE ([id] UNIQUEIDENTIFIER NOT NULL);

        INSERT INTO [dbo].[eng_templates_aprovacao_versoes]
          ([template_id], [numero_versao], [status], [template_json],
           [criado_por], [atualizado_por])
        OUTPUT INSERTED.[id] INTO @novaVersao ([id])
        VALUES
          (@templateId, @numeroVersao, 'rascunho', @templateJson,
           @usuario, @usuario);

        ${SELECT_VERSAO}
        WHERE [id] = (SELECT TOP (1) [id] FROM @novaVersao);
      `);

    await transaction.commit();
    return mapVersaoRow(result.recordset[0]);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function salvarRascunho(
  versaoId: string,
  templateJson: unknown,
  usuario: string
): Promise<TemplateVersao> {
  const jsonValidado = validarTemplateJson(templateJson);
  const jsonTexto = JSON.stringify(jsonValidado);

  const pool = await getSqlServerPool();

  const atualResult = await pool
    .request()
    .input("id", sql.VarChar(36), versaoId)
    .query<{ status: StatusVersaoTemplate }>(`
      SELECT [status] FROM [dbo].[eng_templates_aprovacao_versoes] WHERE [id] = @id;
    `);

  const atual = atualResult.recordset[0];

  if (!atual) {
    throw new ValidationError("Versão do template não encontrada.");
  }

  if (atual.status === "publicado" || atual.status === "arquivado") {
    /*
     * O trigger trg_eng_templates_versoes_proteger_publicadas também
     * bloqueia isso no banco — checar aqui só dá uma mensagem melhor.
     */
    throw new ValidationError(
      "Uma versão publicada ou arquivada é imutável e não pode ser editada."
    );
  }

  const result = await pool
    .request()
    .input("id", sql.VarChar(36), versaoId)
    .input("templateJson", sql.NVarChar(sql.MAX), jsonTexto)
    .input("usuario", sql.NVarChar(300), usuario)
    .query<TemplateVersaoRow>(`
      SET XACT_ABORT ON;

      UPDATE [dbo].[eng_templates_aprovacao_versoes]
      SET
        [template_json] = @templateJson,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @usuario
      WHERE [id] = @id;

      ${SELECT_VERSAO}
      WHERE [id] = @id;
    `);

  return mapVersaoRow(result.recordset[0]);
}

export async function publicarVersao(versaoId: string, usuario: string): Promise<TemplateVersao> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const atualResult = await new sql.Request(transaction)
      .input("id", sql.VarChar(36), versaoId)
      .query<{ templateId: string; status: StatusVersaoTemplate }>(`
        SELECT
          CONVERT(VARCHAR(36), [template_id]) AS [templateId],
          [status]
        FROM [dbo].[eng_templates_aprovacao_versoes] WITH (UPDLOCK, HOLDLOCK)
        WHERE [id] = @id;
      `);

    const atual = atualResult.recordset[0];

    if (!atual) {
      throw new ValidationError("Versão do template não encontrada.");
    }

    if (atual.status !== "rascunho" && atual.status !== "em_teste") {
      throw new ValidationError(
        `A versão está com o status "${atual.status}" e não pode ser publicada.`
      );
    }

    const result = await new sql.Request(transaction)
      .input("id", sql.VarChar(36), versaoId)
      .input("templateId", sql.VarChar(36), atual.templateId)
      .input("usuario", sql.NVarChar(300), usuario)
      .query<TemplateVersaoRow>(`
        SET XACT_ABORT ON;

        UPDATE [dbo].[eng_templates_aprovacao_versoes]
        SET
          [status] = 'publicado',
          [publicado_em] = SYSDATETIME(),
          [publicado_por] = @usuario,
          [atualizado_em] = SYSDATETIME(),
          [atualizado_por] = @usuario
        WHERE [id] = @id;

        UPDATE [dbo].[eng_templates_aprovacao]
        SET
          [versao_publicada_id] = @id,
          [atualizado_em] = SYSDATETIME(),
          [atualizado_por] = @usuario
        WHERE [id] = @templateId;

        INSERT INTO [dbo].[eng_templates_aprovacao_historico]
          ([template_id], [versao_id], [acao], [status_novo], [usuario])
        VALUES
          (@templateId, @id, 'VERSAO_PUBLICADA', 'publicado', @usuario);

        ${SELECT_VERSAO}
        WHERE [id] = @id;
      `);

    await transaction.commit();
    return mapVersaoRow(result.recordset[0]);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function arquivarVersao(versaoId: string, usuario: string): Promise<TemplateVersao> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const atualResult = await new sql.Request(transaction)
      .input("id", sql.VarChar(36), versaoId)
      .query<{ templateId: string; status: StatusVersaoTemplate }>(`
        SELECT
          CONVERT(VARCHAR(36), [template_id]) AS [templateId],
          [status]
        FROM [dbo].[eng_templates_aprovacao_versoes] WITH (UPDLOCK, HOLDLOCK)
        WHERE [id] = @id;
      `);

    const atual = atualResult.recordset[0];

    if (!atual) {
      throw new ValidationError("Versão do template não encontrada.");
    }

    if (atual.status === "arquivado") {
      throw new ValidationError("A versão já está arquivada.");
    }

    const result = await new sql.Request(transaction)
      .input("id", sql.VarChar(36), versaoId)
      .input("templateId", sql.VarChar(36), atual.templateId)
      .input("statusAnterior", sql.VarChar(30), atual.status)
      .input("usuario", sql.NVarChar(300), usuario)
      .query<TemplateVersaoRow>(`
        SET XACT_ABORT ON;

        UPDATE [dbo].[eng_templates_aprovacao_versoes]
        SET
          [status] = 'arquivado',
          [arquivado_em] = SYSDATETIME(),
          [arquivado_por] = @usuario,
          [atualizado_em] = SYSDATETIME(),
          [atualizado_por] = @usuario
        WHERE [id] = @id;

        UPDATE [dbo].[eng_templates_aprovacao]
        SET
          [versao_publicada_id] = NULL,
          [atualizado_em] = SYSDATETIME(),
          [atualizado_por] = @usuario
        WHERE [id] = @templateId
          AND [versao_publicada_id] = @id;

        INSERT INTO [dbo].[eng_templates_aprovacao_historico]
          ([template_id], [versao_id], [acao], [status_anterior], [status_novo], [usuario])
        VALUES
          (@templateId, @id, 'VERSAO_ARQUIVADA', @statusAnterior, 'arquivado', @usuario);

        ${SELECT_VERSAO}
        WHERE [id] = @id;
      `);

    await transaction.commit();
    return mapVersaoRow(result.recordset[0]);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/* =========================================================
   CAMPOS DINÂMICOS (catálogo global)
   ========================================================= */

export async function listarCamposDinamicos(): Promise<CampoDinamico[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<CampoDinamico>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [chave],
      [rotulo],
      [categoria],
      [tipo_dado] AS [tipoDado],
      [formato_padrao] AS [formatoPadrao],
      [unidade_padrao] AS [unidadePadrao],
      [valor_exemplo] AS [valorExemplo],
      [descricao],
      [ordem],
      CAST([ativo] AS BIT) AS [ativo]
    FROM [dbo].[eng_templates_aprovacao_campos_dinamicos]
    ORDER BY [ordem], [rotulo];
  `);

  return result.recordset;
}

export async function criarCampoDinamico(
  input: {
    chave: string;
    rotulo: string;
    categoria: CategoriaCampo;
    tipoDado: TipoDadoCampo;
    unidadePadrao?: string | null;
    valorExemplo?: string | null;
    descricao?: string | null;
  },
  usuario: string
): Promise<CampoDinamico> {
  const pool = await getSqlServerPool();

  const jaExisteResult = await pool
    .request()
    .input("chave", sql.VarChar(100), input.chave)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS [total]
      FROM [dbo].[eng_templates_aprovacao_campos_dinamicos]
      WHERE [chave] = @chave;
    `);

  if (jaExisteResult.recordset[0].total > 0) {
    throw new ValidationError(`Já existe um campo cadastrado com a chave "${input.chave}".`);
  }

  const result = await pool
    .request()
    .input("chave", sql.VarChar(100), input.chave)
    .input("rotulo", sql.NVarChar(300), input.rotulo)
    .input("categoria", sql.VarChar(50), input.categoria)
    .input("tipoDado", sql.VarChar(30), input.tipoDado)
    .input("unidadePadrao", sql.VarChar(30), input.unidadePadrao ?? null)
    .input("valorExemplo", sql.NVarChar(600), input.valorExemplo ?? null)
    .input("descricao", sql.NVarChar(2000), input.descricao ?? null)
    .input("usuario", sql.NVarChar(300), usuario)
    .query<CampoDinamico>(`
      SET XACT_ABORT ON;

      DECLARE @novoCampo TABLE ([id] UNIQUEIDENTIFIER NOT NULL);

      INSERT INTO [dbo].[eng_templates_aprovacao_campos_dinamicos]
        ([chave], [rotulo], [categoria], [tipo_dado], [unidade_padrao], [valor_exemplo],
         [descricao], [criado_por], [atualizado_por])
      OUTPUT INSERTED.[id] INTO @novoCampo ([id])
      VALUES
        (@chave, @rotulo, @categoria, @tipoDado, @unidadePadrao, @valorExemplo,
         @descricao, @usuario, @usuario);

      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        [chave],
        [rotulo],
        [categoria],
        [tipo_dado] AS [tipoDado],
        [formato_padrao] AS [formatoPadrao],
        [unidade_padrao] AS [unidadePadrao],
        [valor_exemplo] AS [valorExemplo],
        [descricao],
        [ordem],
        CAST([ativo] AS BIT) AS [ativo]
      FROM [dbo].[eng_templates_aprovacao_campos_dinamicos]
      WHERE [id] = (SELECT TOP (1) [id] FROM @novoCampo);
    `);

  return result.recordset[0];
}

/* =========================================================
   VÍNCULOS (resolução produto/modelo -> template)
   ========================================================= */

export async function listarVinculosDoTemplate(templateId: string): Promise<VinculoTemplate[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("templateId", sql.VarChar(36), templateId)
    .query<VinculoTemplate>(`
      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        CONVERT(VARCHAR(36), [template_id]) AS [templateId],
        [produto],
        [modelo],
        CAST([padrao] AS BIT) AS [padrao],
        [prioridade],
        CONVERT(VARCHAR(33), [vigencia_inicio], 126) AS [vigenciaInicio],
        CONVERT(VARCHAR(33), [vigencia_fim], 126) AS [vigenciaFim],
        CAST([ativo] AS BIT) AS [ativo]
      FROM [dbo].[eng_templates_aprovacao_vinculos]
      WHERE [template_id] = @templateId
      ORDER BY [padrao] DESC, [prioridade] ASC;
    `);

  return result.recordset;
}

export async function criarVinculo(
  input: {
    templateId: string;
    produto: string;
    modelo?: string | null;
    padrao: boolean;
    prioridade: number;
    vigenciaInicio?: string | null;
    vigenciaFim?: string | null;
  },
  usuario: string
): Promise<VinculoTemplate> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("templateId", sql.VarChar(36), input.templateId)
    .input("produto", sql.NVarChar(300), input.produto)
    .input("modelo", sql.NVarChar(300), input.modelo ?? null)
    .input("padrao", sql.Bit, input.padrao)
    .input("prioridade", sql.Int, input.prioridade)
    .input("vigenciaInicio", sql.DateTime2, input.vigenciaInicio ?? null)
    .input("vigenciaFim", sql.DateTime2, input.vigenciaFim ?? null)
    .input("usuario", sql.NVarChar(300), usuario)
    .query<VinculoTemplate>(`
      SET XACT_ABORT ON;

      DECLARE @novoVinculo TABLE ([id] UNIQUEIDENTIFIER NOT NULL);

      INSERT INTO [dbo].[eng_templates_aprovacao_vinculos]
        ([template_id], [produto], [modelo], [padrao], [prioridade],
         [vigencia_inicio], [vigencia_fim], [criado_por], [atualizado_por])
      OUTPUT INSERTED.[id] INTO @novoVinculo ([id])
      VALUES
        (@templateId, @produto, @modelo, @padrao, @prioridade,
         @vigenciaInicio, @vigenciaFim, @usuario, @usuario);

      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        CONVERT(VARCHAR(36), [template_id]) AS [templateId],
        [produto],
        [modelo],
        CAST([padrao] AS BIT) AS [padrao],
        [prioridade],
        CONVERT(VARCHAR(33), [vigencia_inicio], 126) AS [vigenciaInicio],
        CONVERT(VARCHAR(33), [vigencia_fim], 126) AS [vigenciaFim],
        CAST([ativo] AS BIT) AS [ativo]
      FROM [dbo].[eng_templates_aprovacao_vinculos]
      WHERE [id] = (SELECT TOP (1) [id] FROM @novoVinculo);
    `);

  return result.recordset[0];
}

export async function buscarTemplatePublicadoPorProduto(
  produto: string,
  modelo?: string | null
): Promise<{ template: Template; versao: TemplateVersao } | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("produto", sql.NVarChar(300), produto)
    .input("modelo", sql.NVarChar(300), modelo ?? null)
    .query<{ templateId: string }>(`
      SELECT TOP (1)
        CONVERT(VARCHAR(36), vinculo.[template_id]) AS [templateId]
      FROM [dbo].[eng_templates_aprovacao_vinculos] AS vinculo
      INNER JOIN [dbo].[eng_templates_aprovacao] AS template
        ON template.[id] = vinculo.[template_id]
        AND template.[status] = 'ativo'
        AND template.[versao_publicada_id] IS NOT NULL
      WHERE vinculo.[ativo] = 1
        AND vinculo.[produto] = @produto
        AND (
          vinculo.[modelo] IS NULL
          OR vinculo.[modelo] = @modelo
        )
        AND (vinculo.[vigencia_inicio] IS NULL OR vinculo.[vigencia_inicio] <= SYSDATETIME())
        AND (vinculo.[vigencia_fim] IS NULL OR vinculo.[vigencia_fim] > SYSDATETIME())
      ORDER BY
        vinculo.[padrao] DESC,
        CASE WHEN vinculo.[modelo] IS NOT NULL THEN 0 ELSE 1 END,
        vinculo.[prioridade] ASC;
    `);

  const templateId = result.recordset[0]?.templateId;
  if (!templateId) return null;

  const template = await buscarTemplatePorId(templateId);
  if (!template?.versaoPublicadaId) return null;

  const versao = await buscarVersaoPorId(template.versaoPublicadaId);
  if (!versao) return null;

  return { template, versao };
}

/*
 * Chaves já cobertas pelas colunas fixas de eng_desenhos_aprovacao (as
 * mesmas 19 do catálogo global refletem exatamente essas colunas hoje —
 * ver Fase 1). Um template pode referenciar essas chaves à vontade (ex:
 * "comprimento" numa cota), mas o formulário não deve duplicar um campo
 * que o usuário já preenche pelas colunas fixas — só os campos NOVOS
 * (ex: "quantidadeAves") viram um input extra.
 */
const CHAVES_CAMPOS_FIXOS = new Set([
  "numero",
  "cliente",
  "produto",
  "modelo",
  "caminhao",
  "cabine",
  "comprimento",
  "altura",
  "capacidadeTon",
  "volumeM3",
  "compartimentos",
  "peso",
  "cargaDianteira",
  "cargaTraseira",
  "codigoRevisao",
  "dataEmissao",
  "criadoEm",
  "criadoPor",
  "observacoes",
]);

export interface CampoExtraTemplate {
  chave: string;
  rotulo: string;
  tipoDado: TipoDadoCampo;
  unidadePadrao: string | null;
  obrigatorio: boolean;
}

/*
 * Extrai os campos extras (fora dos fixos) que o template publicado de um
 * produto/modelo referencia — usada pelo formulário dinâmico (Fase 9) pra
 * saber quais inputs extras mostrar, com rótulo/tipo vindos do catálogo
 * global e obrigatoriedade vinda do próprio elemento no template (uma
 * referência pode ser obrigatória num template e opcional em outro).
 */
export async function listarCamposExtraDoProduto(
  produto: string,
  modelo?: string | null
): Promise<CampoExtraTemplate[]> {
  const encontrado = await buscarTemplatePublicadoPorProduto(produto, modelo);
  if (!encontrado) return [];

  const obrigatoriedadePorChave = new Map<string, boolean>();

  function registrar(chave: string | undefined, obrigatorio: boolean | undefined) {
    if (!chave || CHAVES_CAMPOS_FIXOS.has(chave)) return;
    const jaObrigatorio = obrigatoriedadePorChave.get(chave) ?? false;
    obrigatoriedadePorChave.set(chave, jaObrigatorio || Boolean(obrigatorio));
  }

  for (const elemento of encontrado.versao.templateJson.elementos) {
    if (elemento.tipo === "texto_dinamico") {
      registrar(elemento.campo, elemento.obrigatorio);
    }

    if (elemento.tipo === "cota" && elemento.campoMedida) {
      registrar(elemento.campoMedida, elemento.obrigatorio);
    }

    if ("larguraMm" in elemento && typeof elemento.larguraMm === "object") {
      registrar(elemento.larguraMm.campo, false);
    }

    if ("alturaMm" in elemento && typeof elemento.alturaMm === "object") {
      registrar(elemento.alturaMm.campo, false);
    }
  }

  if (obrigatoriedadePorChave.size === 0) return [];

  const catalogo = await listarCamposDinamicos();

  const resultado: CampoExtraTemplate[] = [];

  for (const [chave, obrigatorio] of obrigatoriedadePorChave) {
    const info = catalogo.find((item) => item.chave === chave && item.ativo);
    if (!info) continue;

    resultado.push({
      chave: info.chave,
      rotulo: info.rotulo,
      tipoDado: info.tipoDado,
      unidadePadrao: info.unidadePadrao,
      obrigatorio,
    });
  }

  return resultado;
}

/*
 * Valida os valores digitados nos campos extras de um desenho contra as
 * definições resolvidas do template do produto (Fase 9) — tipo vindo do
 * catálogo global, obrigatoriedade vinda do próprio template. Devolve o
 * JSON pronto pra gravar em eng_desenhos_aprovacao.campos_extra (ou null
 * se não há nada a gravar).
 */
export function validarValoresCamposExtra(
  definicoes: CampoExtraTemplate[],
  valoresBrutos: unknown
): string | null {
  if (definicoes.length === 0) return null;

  const valoresObjeto = isRecord(valoresBrutos) ? valoresBrutos : {};
  const resultado: Record<string, unknown> = {};

  for (const definicao of definicoes) {
    const bruto = valoresObjeto[definicao.chave];

    if (bruto === undefined || bruto === null || bruto === "") {
      if (definicao.obrigatorio) {
        throw new ValidationError(`O campo "${definicao.rotulo}" é obrigatório.`);
      }

      continue;
    }

    if (definicao.tipoDado === "numero") {
      const numero = Number(bruto);

      if (!Number.isFinite(numero)) {
        throw new ValidationError(`O campo "${definicao.rotulo}" deve ser um número válido.`);
      }

      resultado[definicao.chave] = numero;
    } else if (definicao.tipoDado === "booleano") {
      if (typeof bruto !== "boolean") {
        throw new ValidationError(`O campo "${definicao.rotulo}" deve ser verdadeiro ou falso.`);
      }

      resultado[definicao.chave] = bruto;
    } else if (definicao.tipoDado === "data") {
      if (typeof bruto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bruto)) {
        throw new ValidationError(`O campo "${definicao.rotulo}" deve estar no formato AAAA-MM-DD.`);
      }

      resultado[definicao.chave] = bruto;
    } else {
      if (typeof bruto !== "string") {
        throw new ValidationError(`O campo "${definicao.rotulo}" deve ser um texto.`);
      }

      resultado[definicao.chave] = bruto;
    }
  }

  return Object.keys(resultado).length > 0 ? JSON.stringify(resultado) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* =========================================================
   ASSETS (arte importada, ex: SVG)
   ========================================================= */

const PADROES_SVG_INSEGUROS = [
  /<script[\s>]/i,
  /<foreignobject[\s>]/i,
  /\son[a-z]+\s*=/i,
  /javascript:/i,
];

/*
 * Checagem de defesa em profundidade antes de gravar um asset SVG — o
 * CHECK do banco só garante que `svg_sanitizado=1` foi setado, não que o
 * conteúdo é seguro de verdade. Rejeita scripts, handlers de evento e
 * <foreignObject> (pode embutir HTML/JS arbitrário dentro de um SVG).
 */
export function validarSvgSanitizado(conteudoSvg: string): void {
  if (!conteudoSvg.trim().startsWith("<svg") && !conteudoSvg.includes("<svg")) {
    throw new ValidationError("O arquivo enviado não é um SVG válido.");
  }

  for (const padrao of PADROES_SVG_INSEGUROS) {
    if (padrao.test(conteudoSvg)) {
      throw new ValidationError(
        "O SVG contém conteúdo não permitido (script, handler de evento ou foreignObject)."
      );
    }
  }
}

function extrairViewBox(conteudoSvg: string): string | null {
  const match = /viewBox\s*=\s*["']([^"']+)["']/i.exec(conteudoSvg);
  return match ? match[1] : null;
}

export async function salvarAssetSvg(
  input: {
    templateId: string;
    versaoId: string;
    nome: string;
    conteudoSvg: string;
  },
  usuario: string
): Promise<AssetTemplate> {
  validarSvgSanitizado(input.conteudoSvg);

  const buffer = Buffer.from(input.conteudoSvg, "utf-8");
  const hash = createHash("sha256").update(buffer).digest("hex");
  const viewbox = extrairViewBox(input.conteudoSvg);

  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("templateId", sql.VarChar(36), input.templateId)
    .input("versaoId", sql.VarChar(36), input.versaoId)
    .input("nome", sql.NVarChar(400), input.nome)
    .input("conteudo", sql.VarBinary(sql.MAX), buffer)
    .input("tamanhoBytes", sql.BigInt, buffer.length)
    .input("hash", sql.Char(64), hash)
    .input("viewbox", sql.VarChar(200), viewbox)
    .input("usuario", sql.NVarChar(300), usuario)
    .query<AssetTemplate>(`
      SET XACT_ABORT ON;

      DECLARE @novoAsset TABLE ([id] UNIQUEIDENTIFIER NOT NULL);

      INSERT INTO [dbo].[eng_templates_aprovacao_assets]
        ([escopo], [template_id], [versao_id], [nome], [tipo], [mime_type],
         [armazenamento], [conteudo], [tamanho_bytes], [hash_sha256], [viewbox],
         [svg_sanitizado], [criado_por], [atualizado_por])
      OUTPUT INSERTED.[id] INTO @novoAsset ([id])
      VALUES
        ('versao', @templateId, @versaoId, @nome, 'svg', 'image/svg+xml',
         'banco', @conteudo, @tamanhoBytes, @hash, @viewbox,
         1, @usuario, @usuario);

      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        [escopo],
        CONVERT(VARCHAR(36), [template_id]) AS [templateId],
        CONVERT(VARCHAR(36), [versao_id]) AS [versaoId],
        [nome],
        [tipo],
        [mime_type] AS [mimeType],
        CAST([tamanho_bytes] AS INT) AS [tamanhoBytes],
        [hash_sha256] AS [hashSha256],
        [largura_px] AS [larguraPx],
        [altura_px] AS [alturaPx],
        [viewbox],
        CAST([svg_sanitizado] AS BIT) AS [svgSanitizado],
        CAST([ativo] AS BIT) AS [ativo],
        CONVERT(VARCHAR(33), [criado_em], 126) AS [criadoEm],
        [criado_por] AS [criadoPor]
      FROM [dbo].[eng_templates_aprovacao_assets]
      WHERE [id] = (SELECT TOP (1) [id] FROM @novoAsset);
    `);

  return result.recordset[0];
}

export async function buscarAsset(id: string): Promise<AssetTemplate | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.VarChar(36), id)
    .query<AssetTemplate>(`
      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        [escopo],
        CONVERT(VARCHAR(36), [template_id]) AS [templateId],
        CONVERT(VARCHAR(36), [versao_id]) AS [versaoId],
        [nome],
        [tipo],
        [mime_type] AS [mimeType],
        CAST([tamanho_bytes] AS INT) AS [tamanhoBytes],
        [hash_sha256] AS [hashSha256],
        [largura_px] AS [larguraPx],
        [altura_px] AS [alturaPx],
        [viewbox],
        CAST([svg_sanitizado] AS BIT) AS [svgSanitizado],
        CAST([ativo] AS BIT) AS [ativo],
        CONVERT(VARCHAR(33), [criado_em], 126) AS [criadoEm],
        [criado_por] AS [criadoPor]
      FROM [dbo].[eng_templates_aprovacao_assets]
      WHERE [id] = @id;
    `);

  return result.recordset[0] ?? null;
}

export async function buscarConteudoAsset(
  id: string
): Promise<{ conteudo: Buffer; mimeType: string } | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.VarChar(36), id)
    .query<{ conteudo: Buffer; mimeType: string }>(`
      SELECT
        [conteudo],
        [mime_type] AS [mimeType]
      FROM [dbo].[eng_templates_aprovacao_assets]
      WHERE [id] = @id;
    `);

  return result.recordset[0] ?? null;
}

/* =========================================================
   PRÉVIA (usa o pipeline de geração completo, Fase 7)
   ========================================================= */

/*
 * Import dinâmico (não estático no topo do arquivo) de propósito: mantém
 * a camada de acesso a dados sem depender estaticamente do módulo de
 * geração (que já importa este arquivo de volta para
 * `buscarTemplatePublicadoPorProduto` — ver generate-approval-drawing-svg.ts).
 * Uma segunda aresta estática aqui criaria um ciclo de 3 arquivos em vez
 * de 2; este import só é resolvido quando a função é chamada.
 */
export async function renderizarPreviaVersao(
  versaoId: string,
  dadosExemplo: Record<string, unknown>
): Promise<string> {
  const versao = await buscarVersaoPorId(versaoId);

  if (!versao) {
    throw new ValidationError("Versão do template não encontrada.");
  }

  const { renderizarTemplate } = await import(
    "@/modules/desenho-aprovacao/generator/render-template"
  );

  const svg = await renderizarTemplate(versao.templateJson, dadosExemplo);

  /*
   * Só persiste em svg_preview se a versão ainda não foi publicada — o
   * trigger trg_eng_templates_versoes_proteger_publicadas bloqueia
   * qualquer UPDATE de svg_preview numa versão já publicada (imutável por
   * constraint). Pré-visualizar uma versão publicada continua funcionando
   * normalmente, só não grava o resultado.
   */
  if (versao.status === "rascunho" || versao.status === "em_teste") {
    const pool = await getSqlServerPool();

    await pool
      .request()
      .input("id", sql.VarChar(36), versaoId)
      .input("svgPreview", sql.NVarChar(sql.MAX), svg)
      .query(`
        UPDATE [dbo].[eng_templates_aprovacao_versoes]
        SET [svg_preview] = @svgPreview, [atualizado_em] = SYSDATETIME()
        WHERE [id] = @id;
      `);
  }

  return svg;
}
