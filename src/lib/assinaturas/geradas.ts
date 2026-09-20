import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface AssinaturaGerada {
  id: string;
  modeloId: string | null;
  modeloNome: string;
  usuarioId: string;
  usuarioNome: string;
  nome: string;
  sobrenome: string;
  setor: string;
  email: string;
  celular: string | null;
  nomeArquivo: string;
  criadoEm: string;
  /* null = nunca editada desde a criação. */
  atualizadoEm: string | null;
}

interface AssinaturaRow {
  id: string;
  modelo_id: string | null;
  modelo_nome: string;
  usuario_id: string;
  usuario_nome: string;
  nome: string;
  sobrenome: string;
  setor: string;
  email: string;
  celular: string | null;
  nome_arquivo: string;
  criado_em: string;
  atualizado_em: string | null;
}

const colunasAssinatura = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  CONVERT(VARCHAR(36), [modelo_id]) AS [modelo_id],
  [modelo_nome],
  CONVERT(VARCHAR(36), [usuario_id]) AS [usuario_id],
  [usuario_nome],
  [nome],
  [sobrenome],
  [setor],
  [email],
  [celular],
  [nome_arquivo],
  CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em]
`;

function mapAssinaturaRow(row: AssinaturaRow): AssinaturaGerada {
  return {
    id: row.id,
    modeloId: row.modelo_id,
    modeloNome: row.modelo_nome,
    usuarioId: row.usuario_id,
    usuarioNome: row.usuario_nome,
    nome: row.nome,
    sobrenome: row.sobrenome,
    setor: row.setor,
    email: row.email,
    celular: row.celular,
    nomeArquivo: row.nome_arquivo,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

export interface CriarAssinaturaGeradaParams {
  modeloId: string;
  modeloNome: string;
  usuarioId: string;
  usuarioNome: string;
  nome: string;
  sobrenome: string;
  setor: string;
  email: string;
  celular: string | null;
  imagem: { conteudo: Buffer; tipoMime: string };
  nomeArquivo: string;
}

export async function criarAssinaturaGerada(params: CriarAssinaturaGeradaParams): Promise<AssinaturaGerada> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("modeloId", sql.UniqueIdentifier, params.modeloId)
    .input("modeloNome", sql.NVarChar(150), params.modeloNome)
    .input("usuarioId", sql.UniqueIdentifier, params.usuarioId)
    .input("usuarioNome", sql.NVarChar(150), params.usuarioNome)
    .input("nome", sql.NVarChar(150), params.nome)
    .input("sobrenome", sql.NVarChar(150), params.sobrenome)
    .input("setor", sql.NVarChar(150), params.setor)
    .input("email", sql.NVarChar(200), params.email)
    .input("celular", sql.NVarChar(40), params.celular)
    .input("imagemGerada", sql.VarBinary(sql.MAX), params.imagem.conteudo)
    .input("imagemTipoMime", sql.NVarChar(100), params.imagem.tipoMime)
    .input("nomeArquivo", sql.NVarChar(260), params.nomeArquivo)
    .query<{ id: string }>(`
      INSERT INTO dbo.portal_assinaturas_geradas
        ([modelo_id], [modelo_nome], [usuario_id], [usuario_nome], [nome], [sobrenome], [setor], [email], [celular], [imagem_gerada], [imagem_tipo_mime], [nome_arquivo])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@modeloId, @modeloNome, @usuarioId, @usuarioNome, @nome, @sobrenome, @setor, @email, @celular, @imagemGerada, @imagemTipoMime, @nomeArquivo);
    `);

  const criada = await buscarAssinaturaGerada(result.recordset[0].id);
  if (!criada) throw new Error("Assinatura gerada mas não encontrada logo em seguida.");
  return criada;
}

export interface AtualizarAssinaturaGeradaParams {
  modeloId: string;
  modeloNome: string;
  nome: string;
  sobrenome: string;
  setor: string;
  email: string;
  celular: string | null;
  imagem: { conteudo: Buffer; tipoMime: string };
  nomeArquivo: string;
  editadoPor: { id: string; nomeExibicao: string };
}

/* Sobrescreve os dados e a imagem já geradas -- mesma linha, mesmo histórico de downloads (FK não muda). Cada chamada também grava um evento em portal_assinaturas_edicoes, pro log do admin (ver listarLogAdmin). */
export async function atualizarAssinaturaGerada(
  id: string,
  params: AtualizarAssinaturaGeradaParams
): Promise<AssinaturaGerada> {
  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("modeloId", sql.UniqueIdentifier, params.modeloId)
    .input("modeloNome", sql.NVarChar(150), params.modeloNome)
    .input("nome", sql.NVarChar(150), params.nome)
    .input("sobrenome", sql.NVarChar(150), params.sobrenome)
    .input("setor", sql.NVarChar(150), params.setor)
    .input("email", sql.NVarChar(200), params.email)
    .input("celular", sql.NVarChar(40), params.celular)
    .input("imagemGerada", sql.VarBinary(sql.MAX), params.imagem.conteudo)
    .input("imagemTipoMime", sql.NVarChar(100), params.imagem.tipoMime)
    .input("nomeArquivo", sql.NVarChar(260), params.nomeArquivo)
    .input("atualizadoPor", sql.NVarChar(150), params.editadoPor.nomeExibicao)
    .query(`
      UPDATE dbo.portal_assinaturas_geradas
      SET
        [modelo_id] = @modeloId,
        [modelo_nome] = @modeloNome,
        [nome] = @nome,
        [sobrenome] = @sobrenome,
        [setor] = @setor,
        [email] = @email,
        [celular] = @celular,
        [imagem_gerada] = @imagemGerada,
        [imagem_tipo_mime] = @imagemTipoMime,
        [nome_arquivo] = @nomeArquivo,
        [atualizado_em] = SYSDATETIME(),
        [atualizado_por] = @atualizadoPor
      WHERE [id] = @id;
    `);

  await pool
    .request()
    .input("assinaturaId", sql.UniqueIdentifier, id)
    .input("usuarioId", sql.UniqueIdentifier, params.editadoPor.id)
    .input("usuarioNome", sql.NVarChar(150), params.editadoPor.nomeExibicao)
    .query(`
      INSERT INTO dbo.portal_assinaturas_edicoes ([assinatura_id], [usuario_id], [usuario_nome])
      VALUES (@assinaturaId, @usuarioId, @usuarioNome);
    `);

  const atualizada = await buscarAssinaturaGerada(id);
  if (!atualizada) throw new Error("Assinatura atualizada mas não encontrada logo em seguida.");
  return atualizada;
}

/*
 * Lista compartilhada -- TODO usuário com acesso ao módulo vê todas as
 * assinaturas geradas por qualquer pessoa (decisão do usuário: o
 * formulário já era livre, a visualização/edição/exclusão também
 * passam a ser). Paginada com busca por nome da assinatura ou de quem
 * gerou -- mesmo padrão de listarLogAdmin. Nunca inclui excluídas.
 */
export async function listarAssinaturasGeradas(
  pagina: number,
  porPagina: number,
  busca?: string
): Promise<{ itens: AssinaturaGerada[]; total: number }> {
  const pool = await getSqlServerPool();
  const offset = (pagina - 1) * porPagina;

  const whereClause = busca
    ? "WHERE [excluido_em] IS NULL AND ([nome] LIKE @busca OR [sobrenome] LIKE @busca OR [usuario_nome] LIKE @busca)"
    : "WHERE [excluido_em] IS NULL";

  const itensRequest = pool.request();
  const totalRequest = pool.request();

  if (busca) {
    const termo = `%${busca}%`;
    itensRequest.input("busca", sql.NVarChar(200), termo);
    totalRequest.input("busca", sql.NVarChar(200), termo);
  }
  itensRequest.input("offset", sql.Int, offset);
  itensRequest.input("porPagina", sql.Int, porPagina);

  const [itensResult, totalResult] = await Promise.all([
    itensRequest.query<AssinaturaRow>(`
      SELECT ${colunasAssinatura}
      FROM dbo.portal_assinaturas_geradas
      ${whereClause}
      ORDER BY [criado_em] DESC
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
    `),
    totalRequest.query<{ total: number }>(`
      SELECT COUNT(*) AS [total] FROM dbo.portal_assinaturas_geradas ${whereClause};
    `),
  ]);

  return {
    itens: itensResult.recordset.map(mapAssinaturaRow),
    total: totalResult.recordset[0]?.total ?? 0,
  };
}

/* Nunca devolve uma assinatura excluída -- usado pra checar existência antes de editar/baixar. */
export async function buscarAssinaturaGerada(id: string): Promise<AssinaturaGerada | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<AssinaturaRow>(`
      SELECT ${colunasAssinatura}
      FROM dbo.portal_assinaturas_geradas
      WHERE [id] = @id AND [excluido_em] IS NULL;
    `);

  const row = result.recordset[0];
  return row ? mapAssinaturaRow(row) : null;
}

export interface ImagemAssinaturaGerada {
  conteudo: Buffer;
  tipoMime: string;
  nomeArquivo: string;
  usuarioId: string;
}

export async function buscarImagemAssinaturaGerada(id: string): Promise<ImagemAssinaturaGerada | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<{
      imagem_gerada: Buffer;
      imagem_tipo_mime: string;
      nome_arquivo: string;
      usuario_id: string;
    }>(`
      SELECT [imagem_gerada], [imagem_tipo_mime], [nome_arquivo], CONVERT(VARCHAR(36), [usuario_id]) AS [usuario_id]
      FROM dbo.portal_assinaturas_geradas
      WHERE [id] = @id AND [excluido_em] IS NULL;
    `);

  const row = result.recordset[0];
  if (!row) return null;

  return {
    conteudo: row.imagem_gerada,
    tipoMime: row.imagem_tipo_mime,
    nomeArquivo: row.nome_arquivo,
    usuarioId: row.usuario_id,
  };
}

/* Exclusão lógica -- nunca apaga a linha (preserva o histórico de criação/edições/downloads, ver listarLogAdmin). Idempotente: excluir de novo uma já excluída não faz nada. */
export async function excluirAssinaturaGerada(
  id: string,
  usuario: { nomeExibicao: string }
): Promise<boolean> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("excluidoPor", sql.NVarChar(150), usuario.nomeExibicao)
    .query(`
      UPDATE dbo.portal_assinaturas_geradas
      SET [excluido_em] = SYSDATETIME(), [excluido_por] = @excluidoPor
      WHERE [id] = @id AND [excluido_em] IS NULL;
    `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/* Nunca lança -- um erro ao logar o download nunca pode impedir o download em si (mesmo espírito de registrarAcessoModuloSemFalhar). */
export async function registrarDownloadSemFalhar(
  assinaturaId: string,
  usuario: { id: string; nomeExibicao: string }
): Promise<void> {
  try {
    const pool = await getSqlServerPool();

    await pool
      .request()
      .input("assinaturaId", sql.UniqueIdentifier, assinaturaId)
      .input("usuarioId", sql.UniqueIdentifier, usuario.id)
      .input("usuarioNome", sql.NVarChar(150), usuario.nomeExibicao)
      .query(`
        INSERT INTO dbo.portal_assinaturas_downloads ([assinatura_id], [usuario_id], [usuario_nome])
        VALUES (@assinaturaId, @usuarioId, @usuarioNome);
      `);
  } catch (error) {
    console.error("Erro ao registrar download de assinatura:", error);
  }
}

export type EventoLogAssinatura = "criacao" | "edicao" | "download" | "exclusao";

export interface ItemLogAssinatura {
  id: string;
  evento: EventoLogAssinatura;
  usuarioNome: string;
  modeloNome: string | null;
  assinaturaNome: string;
  quando: string;
}

export interface FiltrosLogAssinaturas {
  busca?: string;
  modeloNome?: string;
}

/*
 * UNION ALL entre "criações" (uma por linha de geradas), "edições"
 * (uma por linha de portal_assinaturas_edicoes), "downloads" (uma por
 * linha de portal_assinaturas_downloads) e "exclusões" (a própria
 * linha de geradas, quando excluido_em não é nulo) -- mesmo padrão de
 * paginação com OFFSET/FETCH de listarHistoricoAcessoModuloAdmin
 * (src/lib/auth/acesso-modulo.ts). Todos os ramos ignoram
 * excluido_em/IS NULL de propósito (exceto o de exclusão em si) --
 * excluir uma assinatura não pode apagar o rastro de quando foi
 * criada/editada/baixada antes disso.
 */
export async function listarLogAdmin(
  pagina: number,
  porPagina: number,
  filtros: FiltrosLogAssinaturas = {}
): Promise<{ itens: ItemLogAssinatura[]; total: number }> {
  const pool = await getSqlServerPool();
  const offset = (pagina - 1) * porPagina;

  const condicoes: string[] = [];
  if (filtros.busca) {
    condicoes.push(
      "(usuario_nome LIKE @busca OR assinatura_nome LIKE @busca)"
    );
  }
  if (filtros.modeloNome) {
    condicoes.push("modelo_nome = @modeloNome");
  }
  const whereClause = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";

  const baseUniao = `
    SELECT
      CONVERT(VARCHAR(36), g.[id]) AS [id],
      'criacao' AS [evento],
      g.[usuario_nome],
      g.[modelo_nome],
      g.[nome] + ' ' + g.[sobrenome] AS [assinatura_nome],
      g.[criado_em] AS [quando]
    FROM dbo.portal_assinaturas_geradas AS g

    UNION ALL

    SELECT
      CONVERT(VARCHAR(36), e.[id]) AS [id],
      'edicao' AS [evento],
      e.[usuario_nome],
      g.[modelo_nome],
      g.[nome] + ' ' + g.[sobrenome] AS [assinatura_nome],
      e.[editado_em] AS [quando]
    FROM dbo.portal_assinaturas_edicoes AS e
    INNER JOIN dbo.portal_assinaturas_geradas AS g ON g.[id] = e.[assinatura_id]

    UNION ALL

    SELECT
      CONVERT(VARCHAR(36), d.[id]) AS [id],
      'download' AS [evento],
      d.[usuario_nome],
      g.[modelo_nome],
      g.[nome] + ' ' + g.[sobrenome] AS [assinatura_nome],
      d.[baixado_em] AS [quando]
    FROM dbo.portal_assinaturas_downloads AS d
    INNER JOIN dbo.portal_assinaturas_geradas AS g ON g.[id] = d.[assinatura_id]

    UNION ALL

    SELECT
      CONVERT(VARCHAR(36), g.[id]) AS [id],
      'exclusao' AS [evento],
      g.[excluido_por] AS [usuario_nome],
      g.[modelo_nome],
      g.[nome] + ' ' + g.[sobrenome] AS [assinatura_nome],
      g.[excluido_em] AS [quando]
    FROM dbo.portal_assinaturas_geradas AS g
    WHERE g.[excluido_em] IS NOT NULL
  `;

  const itensRequest = pool.request();
  const totalRequest = pool.request();

  if (filtros.busca) {
    const termo = `%${filtros.busca}%`;
    itensRequest.input("busca", sql.NVarChar(200), termo);
    totalRequest.input("busca", sql.NVarChar(200), termo);
  }
  if (filtros.modeloNome) {
    itensRequest.input("modeloNome", sql.NVarChar(150), filtros.modeloNome);
    totalRequest.input("modeloNome", sql.NVarChar(150), filtros.modeloNome);
  }
  itensRequest.input("offset", sql.Int, offset);
  itensRequest.input("porPagina", sql.Int, porPagina);

  const [itensResult, totalResult] = await Promise.all([
    itensRequest.query<{
      id: string;
      evento: EventoLogAssinatura;
      usuario_nome: string;
      modelo_nome: string | null;
      assinatura_nome: string;
      quando: string;
    }>(`
      SELECT * FROM (${baseUniao}) AS uniao
      ${whereClause}
      ORDER BY [quando] DESC
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
    `),
    totalRequest.query<{ total: number }>(`
      SELECT COUNT(*) AS [total] FROM (${baseUniao}) AS uniao
      ${whereClause};
    `),
  ]);

  return {
    itens: itensResult.recordset.map((row) => ({
      id: row.id,
      evento: row.evento,
      usuarioNome: row.usuario_nome,
      modeloNome: row.modelo_nome,
      assinaturaNome: row.assinatura_nome,
      quando: row.quando,
    })),
    total: totalResult.recordset[0]?.total ?? 0,
  };
}
