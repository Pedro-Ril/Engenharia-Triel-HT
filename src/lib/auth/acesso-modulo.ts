import "server-only";

import { cache } from "react";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export interface ResumoAcessoModulo {
  moduloId: string;
  ultimoAcesso: string;
  totalAcessos: number;
}

/*
 * Chamada em requireModuloAccess (src/lib/auth/autorizacao.ts)
 * a cada navegação para um módulo restrito. Só grava — as
 * agregações (último acesso, total de acessos) são calculadas
 * na leitura, não aqui.
 */
export async function registrarAcessoModulo(
  usuarioId: string,
  moduloChave: string
): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);
  request.input("moduloChave", sql.VarChar(60), moduloChave);

  await request.query(`
    INSERT INTO dbo.portal_acesso_modulo_historico ([usuario_id], [modulo_id])
    SELECT @usuarioId, [id]
    FROM dbo.portal_modulos
    WHERE [chave] = @moduloChave;
  `);
}

/*
 * Wrapper usado no caminho de navegação real — registrar o
 * acesso nunca pode impedir a página de carregar. Uma falha
 * aqui só vai pro log do servidor.
 */
export async function registrarAcessoModuloSemFalhar(
  usuarioId: string,
  moduloChave: string
): Promise<void> {
  try {
    await registrarAcessoModulo(usuarioId, moduloChave);
  } catch (error) {
    console.error("Erro ao registrar acesso ao módulo:", error);
  }
}

/*
 * Um valor por módulo já acessado pelo usuário, com o
 * timestamp do acesso mais recente e a contagem total —
 * usado na home tanto para "Acessados recentemente" (ordenar
 * por ultimoAcesso) quanto para destacar o mais usado
 * (ordenar por totalAcessos). A checagem de permissão atual
 * (o usuário pode ter perdido acesso a algo que já usou) fica
 * por conta de quem consome isto, cruzando com os módulos
 * liberados agora — não é refeita aqui.
 */
export const getResumoAcessosModulos = cache(async (
  usuarioId: string
): Promise<ResumoAcessoModulo[]> => {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);

  const result = await request.query<{
    modulo_id: string;
    ultimo_acesso: string;
    total_acessos: number;
  }>(`
    SELECT
      h.[modulo_id] AS [modulo_id],
      CONVERT(VARCHAR(33), MAX(h.[acessado_em]), 126) AS [ultimo_acesso],
      COUNT(*) AS [total_acessos]
    FROM dbo.portal_acesso_modulo_historico AS h
    INNER JOIN dbo.portal_modulos AS m
      ON m.[id] = h.[modulo_id]
    WHERE h.[usuario_id] = @usuarioId
      AND m.[ativo] = 1
    GROUP BY h.[modulo_id];
  `);

  return result.recordset.map((row) => ({
    moduloId: row.modulo_id,
    ultimoAcesso: row.ultimo_acesso,
    totalAcessos: row.total_acessos,
  }));
});

export interface AcessoModuloAdmin {
  id: string;
  usuarioId: string;
  nomeExibicao: string;
  samAccountName: string;
  moduloChave: string;
  moduloNome: string;
  acessadoEm: string;
}

export interface FiltrosHistoricoAcessoModulo {
  busca?: string;
  moduloChave?: string;
}

/*
 * Versão administrativa de getResumoAcessosModulos: em vez de um
 * resumo por módulo de UM usuário (usado na home), lista cada acesso
 * individual, de TODOS os usuários, paginado — pra Administração →
 * Monitoramento → Acessos. Busca livre casa por nome de exibição ou
 * usuário de rede; o filtro de módulo é opcional (dropdown na tela).
 */
export async function listarHistoricoAcessoModuloAdmin(
  pagina: number,
  porPagina: number,
  filtros: FiltrosHistoricoAcessoModulo = {}
): Promise<{ itens: AcessoModuloAdmin[]; total: number }> {
  const pool = await getSqlServerPool();
  const offset = (pagina - 1) * porPagina;

  const condicoes: string[] = [];
  if (filtros.busca) {
    condicoes.push("(u.[nome_exibicao] LIKE @busca OR u.[sam_account_name] LIKE @busca)");
  }
  if (filtros.moduloChave) {
    condicoes.push("m.[chave] = @moduloChave");
  }
  const whereClause = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";

  const itensRequest = pool.request();
  const totalRequest = pool.request();

  if (filtros.busca) {
    const termo = `%${filtros.busca}%`;
    itensRequest.input("busca", sql.NVarChar(200), termo);
    totalRequest.input("busca", sql.NVarChar(200), termo);
  }
  if (filtros.moduloChave) {
    itensRequest.input("moduloChave", sql.VarChar(60), filtros.moduloChave);
    totalRequest.input("moduloChave", sql.VarChar(60), filtros.moduloChave);
  }
  itensRequest.input("offset", sql.Int, offset);
  itensRequest.input("porPagina", sql.Int, porPagina);

  const [itensResult, totalResult] = await Promise.all([
    itensRequest.query<{
      id: string;
      usuario_id: string;
      nome_exibicao: string;
      sam_account_name: string;
      modulo_chave: string;
      modulo_nome: string;
      acessado_em: string;
    }>(`
      SELECT
        CONVERT(VARCHAR(36), h.[id]) AS [id],
        CONVERT(VARCHAR(36), h.[usuario_id]) AS [usuario_id],
        u.[nome_exibicao],
        u.[sam_account_name],
        m.[chave] AS [modulo_chave],
        m.[nome] AS [modulo_nome],
        CONVERT(VARCHAR(33), h.[acessado_em], 126) AS [acessado_em]
      FROM dbo.portal_acesso_modulo_historico AS h
      INNER JOIN dbo.portal_usuarios AS u ON u.[id] = h.[usuario_id]
      INNER JOIN dbo.portal_modulos AS m ON m.[id] = h.[modulo_id]
      ${whereClause}
      ORDER BY h.[acessado_em] DESC
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
    `),
    totalRequest.query<{ total: number }>(`
      SELECT COUNT(*) AS [total]
      FROM dbo.portal_acesso_modulo_historico AS h
      INNER JOIN dbo.portal_usuarios AS u ON u.[id] = h.[usuario_id]
      INNER JOIN dbo.portal_modulos AS m ON m.[id] = h.[modulo_id]
      ${whereClause};
    `),
  ]);

  return {
    itens: itensResult.recordset.map((row) => ({
      id: row.id,
      usuarioId: row.usuario_id,
      nomeExibicao: row.nome_exibicao,
      samAccountName: row.sam_account_name,
      moduloChave: row.modulo_chave,
      moduloNome: row.modulo_nome,
      acessadoEm: row.acessado_em,
    })),
    total: totalResult.recordset[0]?.total ?? 0,
  };
}
