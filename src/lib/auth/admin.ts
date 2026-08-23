import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { getConfiguracaoAdSemSenha } from "./configuracao-ad";
import { ValidationError } from "./errors";
import type { PortalUsuario } from "./usuarios";

export interface PortalSetor {
  id: string;
  chave: string;
  nome: string;
  icone: string | null;
  ordem: number;
  ativo: boolean;
}

export interface PortalModulo {
  id: string;
  setorIds: string[];
  chave: string;
  nome: string;
  path: string;
  icone: string | null;
  publicoSemLogin: boolean;
  publicoAutenticado: boolean;
  emDesenvolvimento: boolean;
  restritoAtendenteChamados: boolean;
  ativo: boolean;
  ordem: number;
}

export interface PortalPermissao {
  id: string;
  usuarioId: string;
  moduloId: string;
  concedidoEm: string;
  concedidoPor: string;
}

/* =========================================================
   SETORES
   ========================================================= */

export async function listarSetores(): Promise<PortalSetor[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    id: string;
    chave: string;
    nome: string;
    icone: string | null;
    ordem: number;
    ativo: boolean;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [chave],
      [nome],
      [icone],
      [ordem],
      CAST([ativo] AS BIT) AS [ativo]
    FROM dbo.portal_setores
    ORDER BY [ordem], [nome];
  `);

  return result.recordset.map((row) => ({ ...row }));
}

export async function criarSetor(params: {
  chave: string;
  nome: string;
  icone: string | null;
  ordem: number;
}): Promise<PortalSetor> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("chave", sql.VarChar(60), params.chave);
  request.input("nome", sql.NVarChar(150), params.nome);
  request.input("icone", sql.VarChar(60), params.icone);
  request.input("ordem", sql.Int, params.ordem);

  try {
    const result = await request.query<{
      id: string;
      chave: string;
      nome: string;
      icone: string | null;
      ordem: number;
      ativo: boolean;
    }>(`
      INSERT INTO dbo.portal_setores ([chave], [nome], [icone], [ordem])
      OUTPUT
        CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
        INSERTED.[chave],
        INSERTED.[nome],
        INSERTED.[icone],
        INSERTED.[ordem],
        CAST(INSERTED.[ativo] AS BIT) AS [ativo]
      VALUES (@chave, @nome, @icone, @ordem);
    `);

    return result.recordset[0];
  } catch (error) {
    if (error instanceof Error && /UQ_portal_setores_chave/i.test(error.message)) {
      throw new ValidationError("Já existe um setor com esta chave.");
    }

    throw error;
  }
}

export async function atualizarSetor(
  id: string,
  params: { nome: string; icone: string | null; ordem: number; ativo: boolean }
): Promise<PortalSetor | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);
  request.input("nome", sql.NVarChar(150), params.nome);
  request.input("icone", sql.VarChar(60), params.icone);
  request.input("ordem", sql.Int, params.ordem);
  request.input("ativo", sql.Bit, params.ativo);

  const result = await request.query<{
    id: string;
    chave: string;
    nome: string;
    icone: string | null;
    ordem: number;
    ativo: boolean;
  }>(`
    UPDATE dbo.portal_setores
    SET
      [nome] = @nome,
      [icone] = @icone,
      [ordem] = @ordem,
      [ativo] = @ativo,
      [atualizado_em] = SYSDATETIME()
    OUTPUT
      CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
      INSERTED.[chave],
      INSERTED.[nome],
      INSERTED.[icone],
      INSERTED.[ordem],
      CAST(INSERTED.[ativo] AS BIT) AS [ativo]
    WHERE [id] = @id;
  `);

  return result.recordset[0] ?? null;
}

/*
 * Só permite excluir um setor sem módulos vinculados — evita
 * remover silenciosamente o único vínculo de algum módulo. O
 * admin precisa desvincular (editar) ou excluir os módulos
 * deste setor primeiro.
 */
export async function excluirSetor(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const modulosVinculados = await request.query<{ total: number }>(`
    SELECT COUNT(*) AS [total]
    FROM dbo.portal_modulos_setores
    WHERE [setor_id] = @id;
  `);

  if ((modulosVinculados.recordset[0]?.total ?? 0) > 0) {
    throw new ValidationError(
      "Este setor tem módulos vinculados. Remova o vínculo (editando o módulo) ou exclua os módulos antes de excluir o setor."
    );
  }

  const deleteRequest = pool.request();
  deleteRequest.input("id", sql.UniqueIdentifier, id);

  const result = await deleteRequest.query(`
    DELETE FROM dbo.portal_setores
    WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/* =========================================================
   MÓDULOS
   ========================================================= */

const moduloSelectColumns = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [chave],
  [nome],
  [path],
  [icone],
  CAST([publico_sem_login] AS BIT) AS [publicoSemLogin],
  CAST([publico_autenticado] AS BIT) AS [publicoAutenticado],
  CAST([em_desenvolvimento] AS BIT) AS [emDesenvolvimento],
  CAST([restrito_atendente_chamados] AS BIT) AS [restritoAtendenteChamados],
  CAST([ativo] AS BIT) AS [ativo],
  [ordem]
`;

const moduloOutputColumns = `
  CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
  INSERTED.[chave],
  INSERTED.[nome],
  INSERTED.[path],
  INSERTED.[icone],
  CAST(INSERTED.[publico_sem_login] AS BIT) AS [publicoSemLogin],
  CAST(INSERTED.[publico_autenticado] AS BIT) AS [publicoAutenticado],
  CAST(INSERTED.[em_desenvolvimento] AS BIT) AS [emDesenvolvimento],
  CAST(INSERTED.[restrito_atendente_chamados] AS BIT) AS [restritoAtendenteChamados],
  CAST(INSERTED.[ativo] AS BIT) AS [ativo],
  INSERTED.[ordem]
`;

type PortalModuloRow = Omit<PortalModulo, "setorIds">;

async function buscarSetorIdsPorModulo(
  pool: Awaited<ReturnType<typeof getSqlServerPool>>
): Promise<Map<string, string[]>> {
  const result = await pool.request().query<{
    moduloId: string;
    setorId: string;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [modulo_id]) AS [moduloId],
      CONVERT(VARCHAR(36), [setor_id]) AS [setorId]
    FROM dbo.portal_modulos_setores;
  `);

  const mapa = new Map<string, string[]>();

  for (const row of result.recordset) {
    const lista = mapa.get(row.moduloId) ?? [];
    lista.push(row.setorId);
    mapa.set(row.moduloId, lista);
  }

  return mapa;
}

export async function listarModulos(): Promise<PortalModulo[]> {
  const pool = await getSqlServerPool();

  const [modulosResult, setorIdsPorModulo] = await Promise.all([
    pool.request().query<PortalModuloRow>(`
      SELECT ${moduloSelectColumns}
      FROM dbo.portal_modulos
      ORDER BY [ordem], [nome];
    `),
    buscarSetorIdsPorModulo(pool),
  ]);

  return modulosResult.recordset.map((row) => ({
    ...row,
    setorIds: setorIdsPorModulo.get(row.id) ?? [],
  }));
}

async function sincronizarSetoresDoModulo(
  transaction: InstanceType<typeof sql.Transaction>,
  moduloId: string,
  setorIds: string[]
): Promise<void> {
  const deleteRequest = new sql.Request(transaction);
  deleteRequest.input("moduloId", sql.UniqueIdentifier, moduloId);

  await deleteRequest.query(`
    DELETE FROM dbo.portal_modulos_setores
    WHERE [modulo_id] = @moduloId;
  `);

  for (const setorId of setorIds) {
    const linkRequest = new sql.Request(transaction);
    linkRequest.input("moduloId", sql.UniqueIdentifier, moduloId);
    linkRequest.input("setorId", sql.UniqueIdentifier, setorId);

    await linkRequest.query(`
      INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id])
      VALUES (@moduloId, @setorId);
    `);
  }
}

export async function criarModulo(params: {
  setorIds: string[];
  chave: string;
  nome: string;
  path: string;
  icone: string | null;
  publicoSemLogin: boolean;
  publicoAutenticado: boolean;
  emDesenvolvimento: boolean;
  restritoAtendenteChamados: boolean;
  ordem: number;
}): Promise<PortalModulo> {
  if (params.setorIds.length === 0) {
    throw new ValidationError("Selecione pelo menos um setor para o módulo.");
  }

  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const insertRequest = new sql.Request(transaction);
    insertRequest.input("chave", sql.VarChar(60), params.chave);
    insertRequest.input("nome", sql.NVarChar(150), params.nome);
    insertRequest.input("path", sql.VarChar(200), params.path);
    insertRequest.input("icone", sql.VarChar(60), params.icone);
    insertRequest.input("publicoSemLogin", sql.Bit, params.publicoSemLogin);
    insertRequest.input("publicoAutenticado", sql.Bit, params.publicoAutenticado);
    insertRequest.input("emDesenvolvimento", sql.Bit, params.emDesenvolvimento);
    insertRequest.input("restritoAtendenteChamados", sql.Bit, params.restritoAtendenteChamados);
    insertRequest.input("ordem", sql.Int, params.ordem);

    const result = await insertRequest.query<PortalModuloRow>(`
      INSERT INTO dbo.portal_modulos
        ([chave], [nome], [path], [icone], [publico_sem_login], [publico_autenticado], [em_desenvolvimento], [restrito_atendente_chamados], [ordem])
      OUTPUT ${moduloOutputColumns}
      VALUES (@chave, @nome, @path, @icone, @publicoSemLogin, @publicoAutenticado, @emDesenvolvimento, @restritoAtendenteChamados, @ordem);
    `);

    const novoModulo = result.recordset[0];

    await sincronizarSetoresDoModulo(transaction, novoModulo.id, params.setorIds);

    await transaction.commit();

    return { ...novoModulo, setorIds: params.setorIds };
  } catch (error) {
    await transaction.rollback();

    if (error instanceof Error && /UQ_portal_modulos_chave/i.test(error.message)) {
      throw new ValidationError("Já existe um módulo com esta chave.");
    }

    if (error instanceof Error && /UQ_portal_modulos_path/i.test(error.message)) {
      throw new ValidationError("Já existe um módulo com este caminho (path).");
    }

    if (
      error instanceof Error &&
      /FK_portal_modulos_setores_setor/i.test(error.message)
    ) {
      throw new ValidationError("Um dos setores informados não existe.");
    }

    throw error;
  }
}

export async function atualizarModulo(
  id: string,
  params: {
    nome: string;
    path: string;
    icone: string | null;
    publicoSemLogin: boolean;
    publicoAutenticado: boolean;
    emDesenvolvimento: boolean;
    restritoAtendenteChamados: boolean;
    ativo: boolean;
    ordem: number;
    setorIds: string[];
  }
): Promise<PortalModulo | null> {
  if (params.setorIds.length === 0) {
    throw new ValidationError("Selecione pelo menos um setor para o módulo.");
  }

  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const updateRequest = new sql.Request(transaction);
    updateRequest.input("id", sql.UniqueIdentifier, id);
    updateRequest.input("nome", sql.NVarChar(150), params.nome);
    updateRequest.input("path", sql.VarChar(200), params.path);
    updateRequest.input("icone", sql.VarChar(60), params.icone);
    updateRequest.input("publicoSemLogin", sql.Bit, params.publicoSemLogin);
    updateRequest.input("publicoAutenticado", sql.Bit, params.publicoAutenticado);
    updateRequest.input("emDesenvolvimento", sql.Bit, params.emDesenvolvimento);
    updateRequest.input("restritoAtendenteChamados", sql.Bit, params.restritoAtendenteChamados);
    updateRequest.input("ativo", sql.Bit, params.ativo);
    updateRequest.input("ordem", sql.Int, params.ordem);

    const result = await updateRequest.query<PortalModuloRow>(`
      UPDATE dbo.portal_modulos
      SET
        [nome] = @nome,
        [path] = @path,
        [icone] = @icone,
        [publico_sem_login] = @publicoSemLogin,
        [publico_autenticado] = @publicoAutenticado,
        [em_desenvolvimento] = @emDesenvolvimento,
        [restrito_atendente_chamados] = @restritoAtendenteChamados,
        [ativo] = @ativo,
        [ordem] = @ordem,
        [atualizado_em] = SYSDATETIME()
      OUTPUT ${moduloOutputColumns}
      WHERE [id] = @id;
    `);

    const moduloAtualizado = result.recordset[0];

    if (!moduloAtualizado) {
      await transaction.rollback();
      return null;
    }

    await sincronizarSetoresDoModulo(transaction, id, params.setorIds);

    await transaction.commit();

    return { ...moduloAtualizado, setorIds: params.setorIds };
  } catch (error) {
    await transaction.rollback();

    if (error instanceof Error && /UQ_portal_modulos_path/i.test(error.message)) {
      throw new ValidationError("Já existe um módulo com este caminho (path).");
    }

    if (
      error instanceof Error &&
      /FK_portal_modulos_setores_setor/i.test(error.message)
    ) {
      throw new ValidationError("Um dos setores informados não existe.");
    }

    throw error;
  }
}

/*
 * Só permite excluir um módulo sem permissões concedidas —
 * evita revogar acesso de usuários silenciosamente. O admin
 * precisa revogar as permissões pela aba "Permissões" antes.
 */
export async function excluirModulo(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const permissoesVinculadas = await request.query<{ total: number }>(`
    SELECT COUNT(*) AS [total]
    FROM dbo.portal_permissoes
    WHERE [modulo_id] = @id;
  `);

  if ((permissoesVinculadas.recordset[0]?.total ?? 0) > 0) {
    throw new ValidationError(
      "Este módulo tem permissões concedidas. Revogue os acessos na aba \"Permissões\" antes de excluí-lo."
    );
  }

  const deleteRequest = pool.request();
  deleteRequest.input("id", sql.UniqueIdentifier, id);

  const result = await deleteRequest.query(`
    DELETE FROM dbo.portal_modulos
    WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/* =========================================================
   USUÁRIOS (visão administrativa)
   ========================================================= */

const usuarioSelectColumns = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [sam_account_name],
  [nome_exibicao],
  [email],
  [codigo_empresa],
  CAST([eh_administrador] AS BIT) AS [eh_administrador],
  CAST([ativo] AS BIT) AS [ativo],
  CONVERT(VARCHAR(33), [sessao_invalidada_em], 126) AS [sessao_invalidada_em],
  CONVERT(VARCHAR(33), [ultimo_login_em], 126) AS [ultimo_login_em]
`;

const usuarioOutputColumns = `
  CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
  INSERTED.[sam_account_name],
  INSERTED.[nome_exibicao],
  INSERTED.[email],
  INSERTED.[codigo_empresa],
  CAST(INSERTED.[eh_administrador] AS BIT) AS [eh_administrador],
  CAST(INSERTED.[ativo] AS BIT) AS [ativo],
  CONVERT(VARCHAR(33), INSERTED.[sessao_invalidada_em], 126) AS [sessao_invalidada_em],
  CONVERT(VARCHAR(33), INSERTED.[ultimo_login_em], 126) AS [ultimo_login_em]
`;

function mapUsuarioRow(row: {
  id: string;
  sam_account_name: string;
  nome_exibicao: string;
  email: string | null;
  codigo_empresa: string | null;
  eh_administrador: boolean;
  ativo: boolean;
  sessao_invalidada_em: string | null;
  ultimo_login_em: string | null;
}): PortalUsuario {
  return {
    id: row.id,
    samAccountName: row.sam_account_name,
    nomeExibicao: row.nome_exibicao,
    email: row.email,
    codigoEmpresa: row.codigo_empresa,
    ehAdministrador: row.eh_administrador,
    ativo: row.ativo,
    sessaoInvalidadaEm: row.sessao_invalidada_em,
    ultimoLoginEm: row.ultimo_login_em,
  };
}

/*
 * A conta de serviço (configurada em Administração →
 * Configurações, usada internamente pelo LDAP para localizar
 * outros usuários) nunca deve aparecer na lista — ela não é
 * uma pessoa e não deveria conseguir logar interativamente
 * (ver checagem em src/app/api/auth/login/route.ts), mas este
 * filtro é uma segunda camada de proteção caso um cadastro já
 * exista.
 */
export async function listarUsuarios(): Promise<PortalUsuario[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  const configuracaoAd = await getConfiguracaoAdSemSenha();

  request.input(
    "contaServico",
    sql.NVarChar(150),
    (configuracaoAd?.usuarioServico ?? "").trim().toLowerCase()
  );

  const result = await request.query(`
    SELECT ${usuarioSelectColumns}
    FROM dbo.portal_usuarios
    WHERE [sam_account_name] <> @contaServico
    ORDER BY [nome_exibicao];
  `);

  return result.recordset.map(mapUsuarioRow);
}

/*
 * Exclusão real (não é só desativar). As permissões do
 * usuário são removidas junto (FK ON DELETE CASCADE) e o
 * histórico de login é preservado, só desvinculado do
 * cadastro (FK ON DELETE SET NULL) — ver
 * db/schema/0003_modulo_dev_e_exclusao_usuario.sql.
 */
export async function excluirUsuario(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query(`
    DELETE FROM dbo.portal_usuarios
    WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function atualizarUsuarioAdmin(
  id: string,
  params: { codigoEmpresa: string | null; ativo: boolean }
): Promise<PortalUsuario | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);
  request.input("codigoEmpresa", sql.NVarChar(30), params.codigoEmpresa);
  request.input("ativo", sql.Bit, params.ativo);

  /*
   * Ao desativar, invalida qualquer sessão já emitida
   * imediatamente (ver getUsuarioAutenticado), sem precisar
   * esperar o token expirar sozinho.
   */
  const result = await request.query(`
    UPDATE dbo.portal_usuarios
    SET
      [codigo_empresa] = @codigoEmpresa,
      [ativo] = @ativo,
      [sessao_invalidada_em] = CASE
        WHEN @ativo = 0 THEN SYSDATETIME()
        ELSE [sessao_invalidada_em]
      END
    OUTPUT ${usuarioOutputColumns}
    WHERE [id] = @id;
  `);

  const row = result.recordset[0];

  return row ? mapUsuarioRow(row) : null;
}

/* =========================================================
   PERMISSÕES
   ========================================================= */

export async function listarPermissoes(): Promise<PortalPermissao[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<PortalPermissao>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      CONVERT(VARCHAR(36), [usuario_id]) AS [usuarioId],
      CONVERT(VARCHAR(36), [modulo_id]) AS [moduloId],
      CONVERT(VARCHAR(33), [concedido_em], 126) AS [concedidoEm],
      [concedido_por] AS [concedidoPor]
    FROM dbo.portal_permissoes;
  `);

  return result.recordset;
}

export async function concederPermissao(params: {
  usuarioId: string;
  moduloId: string;
  concedidoPor: string;
}): Promise<PortalPermissao> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, params.usuarioId);
  request.input("moduloId", sql.UniqueIdentifier, params.moduloId);
  request.input("concedidoPor", sql.NVarChar(150), params.concedidoPor);

  try {
    const result = await request.query<PortalPermissao>(`
      INSERT INTO dbo.portal_permissoes ([usuario_id], [modulo_id], [concedido_por])
      OUTPUT
        CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
        CONVERT(VARCHAR(36), INSERTED.[usuario_id]) AS [usuarioId],
        CONVERT(VARCHAR(36), INSERTED.[modulo_id]) AS [moduloId],
        CONVERT(VARCHAR(33), INSERTED.[concedido_em], 126) AS [concedidoEm],
        INSERTED.[concedido_por] AS [concedidoPor]
      VALUES (@usuarioId, @moduloId, @concedidoPor);
    `);

    return result.recordset[0];
  } catch (error) {
    if (
      error instanceof Error &&
      /UQ_portal_permissoes_usuario_modulo/i.test(error.message)
    ) {
      throw new ValidationError("Este usuário já tem acesso a este módulo.");
    }

    throw error;
  }
}

export async function revogarPermissao(id: string): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query(`
    DELETE FROM dbo.portal_permissoes
    WHERE [id] = @id;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}
