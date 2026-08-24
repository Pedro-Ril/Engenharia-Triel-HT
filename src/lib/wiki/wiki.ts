import "server-only";

import { getSetoresComModulosPermitidos } from "@/lib/auth/autorizacao";
import type { PortalUsuario } from "@/lib/auth/usuarios";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

export interface WikiArtigoResumo {
  id: string;
  titulo: string;
  moduloId: string | null;
  moduloNome: string | null;
  privadoAdmin: boolean;
  ativo: boolean;
  ordem: number;
  autorNome: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface WikiArtigo extends WikiArtigoResumo {
  conteudo: string;
}

interface WikiArtigoRow {
  id: string;
  titulo: string;
  conteudo: string;
  modulo_id: string | null;
  modulo_nome: string | null;
  privado_admin: boolean;
  ativo: boolean;
  ordem: number;
  autor_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

const colunasArtigo = `
  CONVERT(VARCHAR(36), a.[id]) AS [id],
  a.[titulo],
  a.[conteudo],
  CONVERT(VARCHAR(36), a.[modulo_id]) AS [modulo_id],
  m.[nome] AS [modulo_nome],
  CAST(a.[privado_admin] AS BIT) AS [privado_admin],
  CAST(a.[ativo] AS BIT) AS [ativo],
  a.[ordem],
  autor.[nome_exibicao] AS [autor_nome],
  CONVERT(VARCHAR(33), a.[criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), a.[atualizado_em], 126) AS [atualizado_em]
`;

const juncoesArtigo = `
  FROM dbo.portal_wiki_artigos AS a
  LEFT JOIN dbo.portal_modulos AS m ON m.[id] = a.[modulo_id]
  LEFT JOIN dbo.portal_usuarios AS autor ON autor.[id] = a.[autor_usuario_id]
`;

function mapRow(row: WikiArtigoRow): WikiArtigo {
  return {
    id: row.id,
    titulo: row.titulo,
    conteudo: row.conteudo,
    moduloId: row.modulo_id,
    moduloNome: row.modulo_nome,
    privadoAdmin: row.privado_admin,
    ativo: row.ativo,
    ordem: row.ordem,
    autorNome: row.autor_nome,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

/*
 * Regra de acesso do wiki: cada artigo é visível se (a) é geral
 * (sem módulo) ou aponta pra um módulo que o usuário já tem
 * acesso — reaproveita getSetoresComModulosPermitidos, a mesma
 * consulta que decide o catálogo de módulos da Home, pra não
 * duplicar a regra de permissão em dois lugares — e (b) não é
 * "privado_admin", a menos que o próprio usuário seja
 * administrador (admin vê tudo, incluindo os privados). Só
 * artigos ativos aparecem aqui; a lista completa (incluindo
 * inativos) é coisa da administração (listarArtigosAdmin). A
 * página pública já recebe o conteúdo completo de todos os
 * artigos visíveis de uma vez (como em Atualizações) — sem rota
 * de API própria, sem busca por id à parte.
 */
export async function listarArtigosVisiveis(usuario: PortalUsuario): Promise<WikiArtigo[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("ehAdministrador", sql.Bit, usuario.ehAdministrador);

  const condicoesAcesso: string[] = ["@ehAdministrador = 1"];

  if (!usuario.ehAdministrador) {
    const setores = await getSetoresComModulosPermitidos(usuario);
    const moduloIds = setores.flatMap((setor) => setor.modulos.map((modulo) => modulo.id));

    const parametrosModulo = moduloIds.map((id, indice) => {
      request.input(`moduloId${indice}`, sql.UniqueIdentifier, id);
      return `@moduloId${indice}`;
    });

    const condicaoModulo =
      parametrosModulo.length > 0
        ? `(a.[modulo_id] IS NULL OR a.[modulo_id] IN (${parametrosModulo.join(", ")}))`
        : `a.[modulo_id] IS NULL`;

    condicoesAcesso.push(`(a.[privado_admin] = 0 AND ${condicaoModulo})`);
  }

  const result = await request.query<WikiArtigoRow>(`
    SELECT ${colunasArtigo}
    ${juncoesArtigo}
    WHERE a.[ativo] = 1
      AND (${condicoesAcesso.join(" OR ")})
    ORDER BY m.[nome], a.[ordem];
  `);

  return result.recordset.map(mapRow);
}

/* ADMIN — sem filtro de visibilidade, inclusive artigos inativos. */
export async function listarArtigosAdmin(): Promise<WikiArtigo[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<WikiArtigoRow>(`
    SELECT ${colunasArtigo}
    ${juncoesArtigo}
    ORDER BY m.[nome], a.[ordem];
  `);

  return result.recordset.map(mapRow);
}

export interface CriarArtigoParams {
  titulo: string;
  conteudo: string;
  moduloId: string | null;
  privadoAdmin: boolean;
  ativo: boolean;
  autorUsuarioId: string | null;
}

export async function criarArtigo(params: CriarArtigoParams): Promise<WikiArtigo> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("titulo", sql.NVarChar(200), params.titulo);
  request.input("conteudo", sql.NVarChar(sql.MAX), params.conteudo);
  request.input("moduloId", sql.UniqueIdentifier, params.moduloId);
  request.input("privadoAdmin", sql.Bit, params.privadoAdmin);
  request.input("ativo", sql.Bit, params.ativo);
  request.input("autorUsuarioId", sql.UniqueIdentifier, params.autorUsuarioId);

  try {
    const result = await request.query<{ id: string }>(`
      DECLARE @proximaOrdem INT = (
        SELECT ISNULL(MAX([ordem]), -1) + 1
        FROM dbo.portal_wiki_artigos
        WHERE ([modulo_id] = @moduloId) OR ([modulo_id] IS NULL AND @moduloId IS NULL)
      );

      INSERT INTO dbo.portal_wiki_artigos
        ([titulo], [conteudo], [modulo_id], [privado_admin], [ativo], [ordem], [autor_usuario_id])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@titulo, @conteudo, @moduloId, @privadoAdmin, @ativo, @proximaOrdem, @autorUsuarioId);
    `);

    const artigo = await buscarArtigoPorIdAdmin(result.recordset[0].id);
    if (!artigo) throw new Error("Falha ao carregar o artigo recém-criado.");
    return artigo;
  } catch (error) {
    if (error instanceof Error && /FK_portal_wiki_artigos_modulo/i.test(error.message)) {
      throw new ValidationError("O módulo selecionado não existe.");
    }
    throw error;
  }
}

async function buscarArtigoPorIdAdmin(id: string): Promise<WikiArtigo | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query<WikiArtigoRow>(`
    SELECT ${colunasArtigo}
    ${juncoesArtigo}
    WHERE a.[id] = @id;
  `);

  const row = result.recordset[0];
  return row ? mapRow(row) : null;
}

export interface AtualizarArtigoParams {
  titulo?: string;
  conteudo?: string;
  moduloId?: string | null;
  privadoAdmin?: boolean;
  ativo?: boolean;
  ordem?: number;
}

export async function atualizarArtigo(
  id: string,
  params: AtualizarArtigoParams
): Promise<WikiArtigo | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const sets: string[] = [];

  if (params.titulo !== undefined) {
    request.input("titulo", sql.NVarChar(200), params.titulo);
    sets.push("[titulo] = @titulo");
  }

  if (params.conteudo !== undefined) {
    request.input("conteudo", sql.NVarChar(sql.MAX), params.conteudo);
    sets.push("[conteudo] = @conteudo");
  }

  if (params.moduloId !== undefined) {
    request.input("moduloId", sql.UniqueIdentifier, params.moduloId);
    sets.push("[modulo_id] = @moduloId");
  }

  if (params.privadoAdmin !== undefined) {
    request.input("privadoAdmin", sql.Bit, params.privadoAdmin);
    sets.push("[privado_admin] = @privadoAdmin");
  }

  if (params.ativo !== undefined) {
    request.input("ativo", sql.Bit, params.ativo);
    sets.push("[ativo] = @ativo");
  }

  if (params.ordem !== undefined) {
    request.input("ordem", sql.Int, params.ordem);
    sets.push("[ordem] = @ordem");
  }

  if (sets.length === 0) {
    return buscarArtigoPorIdAdmin(id);
  }

  sets.push("[atualizado_em] = SYSDATETIME()");

  try {
    await request.query(`
      UPDATE dbo.portal_wiki_artigos
      SET ${sets.join(", ")}
      WHERE [id] = @id;
    `);
  } catch (error) {
    if (error instanceof Error && /FK_portal_wiki_artigos_modulo/i.test(error.message)) {
      throw new ValidationError("O módulo selecionado não existe.");
    }
    throw error;
  }

  return buscarArtigoPorIdAdmin(id);
}

export async function excluirArtigo(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query(`
    DELETE FROM dbo.portal_wiki_artigos WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}
