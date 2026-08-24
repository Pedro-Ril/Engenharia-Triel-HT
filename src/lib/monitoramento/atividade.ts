import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export type TipoEventoAtividade =
  | "login_sucesso"
  | "login_falha"
  | "chamado_bloqueio_nome"
  | "terminal_busca_falha";

export interface EventoAtividade {
  tipo: TipoEventoAtividade;
  titulo: string;
  descricao: string | null;
  criadoEm: string;
}

export interface FiltrosAtividade {
  pagina: number;
  porPagina: number;
}

interface EventoRow {
  tipo: TipoEventoAtividade;
  titulo: string;
  descricao: string | null;
  criado_em: Date;
}

/*
 * Não existe uma tabela única de "auditoria" — em vez de criar
 * mais uma, esta consulta une os sinais de segurança/uso que já
 * são gravados em tabelas próprias (login, tentativas de nome
 * em chamados, buscas do terminal) numa única lista cronológica
 * pra tela de Monitoramento. Só os eventos mais relevantes (não
 * todo login bem-sucedido de rotina, por exemplo, seria ruído).
 * Repetida nas duas consultas (itens e total) porque cada uma
 * roda em seu próprio `request()`, mesmo padrão de listarLogs.
 */
const EVENTOS_UNIAO = `
  SELECT
    'login_falha' AS [tipo],
    h.[sam_account_name_tentado] AS [titulo],
    h.[motivo_falha] AS [descricao],
    h.[criado_em] AS [criado_em]
  FROM dbo.portal_login_historico AS h
  WHERE h.[sucesso] = 0

  UNION ALL

  SELECT
    'login_sucesso' AS [tipo],
    ISNULL(u.[nome_exibicao], h.[sam_account_name_tentado]) AS [titulo],
    NULL AS [descricao],
    h.[criado_em] AS [criado_em]
  FROM dbo.portal_login_historico AS h
  LEFT JOIN dbo.portal_usuarios AS u ON u.[id] = h.[usuario_id]
  WHERE h.[sucesso] = 1

  UNION ALL

  SELECT
    'chamado_bloqueio_nome' AS [tipo],
    CONCAT('Chamado nº ', c.[numero]) AS [titulo],
    'muitas tentativas de nome incorreto' AS [descricao],
    t.[tentado_em] AS [criado_em]
  FROM dbo.portal_chamados_tentativas_nome AS t
  INNER JOIN dbo.portal_chamados AS c ON c.[id] = t.[chamado_id]
  WHERE t.[sucesso] = 0

  UNION ALL

  SELECT
    'terminal_busca_falha' AS [tipo],
    b.[codigo_buscado] AS [titulo],
    'código não encontrado' AS [descricao],
    b.[buscado_em] AS [criado_em]
  FROM dbo.portal_terminal_fabrica_buscas AS b
  WHERE b.[encontrado] = 0
`;

export async function listarAtividadeRecente(
  filtros: FiltrosAtividade
): Promise<{ itens: EventoAtividade[]; total: number }> {
  const pool = await getSqlServerPool();

  const offset = (filtros.pagina - 1) * filtros.porPagina;

  const itensRequest = pool.request();
  itensRequest.input("offset", sql.Int, offset);
  itensRequest.input("porPagina", sql.Int, filtros.porPagina);

  const [itensResult, totalResult] = await Promise.all([
    itensRequest.query<EventoRow>(`
      SELECT * FROM (${EVENTOS_UNIAO}) AS eventos
      ORDER BY [criado_em] DESC
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
    `),
    pool.request().query<{ total: number }>(`
      SELECT COUNT(*) AS [total] FROM (${EVENTOS_UNIAO}) AS eventos;
    `),
  ]);

  return {
    itens: itensResult.recordset.map((row) => ({
      tipo: row.tipo,
      titulo: row.titulo,
      descricao: row.descricao,
      criadoEm: row.criado_em.toISOString(),
    })),
    total: totalResult.recordset[0]?.total ?? 0,
  };
}
