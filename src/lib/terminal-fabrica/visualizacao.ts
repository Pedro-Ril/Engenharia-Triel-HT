import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { registrarLog } from "@/lib/monitoramento/logs";

import { ehVisualizacao3D, lerVisualizacao3D, type Visualizacao3D } from "./visualizacao-3d";

/*
 * Visualização 3D por aparelho do Terminal de Fábrica. "Aparelho do
 * terminal" = terminal da TV Corporativa, pareado e não revogado, cuja
 * grade tem uma página web apontando para /terminal-fabrica.
 */

export interface AparelhoTerminalFabrica {
  id: string;
  nome: string | null;
  grade: string;
  ultimoHeartbeatEm: string | null;
  visualizacao: Visualizacao3D;
}

export async function listarAparelhosTerminalFabrica(): Promise<AparelhoTerminalFabrica[]> {
  const pool = await getSqlServerPool();
  const result = await pool.request().query<{
    id: string;
    nome: string | null;
    grade: string;
    ultimo_heartbeat_em: string | null;
    visualizacao_3d: string;
  }>(`
    SELECT CONVERT(VARCHAR(36), t.[id]) AS [id], t.[nome], g.[nome] AS [grade],
           CONVERT(VARCHAR(33), t.[ultimo_heartbeat_em], 126) AS [ultimo_heartbeat_em], t.[visualizacao_3d]
    FROM dbo.portal_tv_terminais AS t
    INNER JOIN dbo.portal_tv_grades AS g ON g.[id] = t.[grade_id]
    WHERE t.[revogado_em] IS NULL AND t.[status] = 'pareado'
      AND EXISTS (
        SELECT 1
        FROM dbo.portal_tv_grade_slots AS s
        INNER JOIN dbo.portal_tv_slot_itens AS i ON i.[slot_id] = s.[id]
        WHERE s.[grade_id] = g.[id] AND i.[tipo_conteudo] = 'pagina_web' AND i.[url_pagina_web] LIKE '%/terminal-fabrica%'
      )
    ORDER BY t.[nome];
  `);

  return result.recordset.map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    grade: linha.grade,
    ultimoHeartbeatEm: linha.ultimo_heartbeat_em,
    visualizacao: lerVisualizacao3D(linha.visualizacao_3d),
  }));
}

/* A escolha de um aparelho (a rota da grade usa ao montar a URL da página). */
export async function buscarVisualizacaoDoAparelho(terminalId: string): Promise<Visualizacao3D> {
  const pool = await getSqlServerPool();
  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, terminalId)
    .query<{ visualizacao_3d: string }>(`SELECT [visualizacao_3d] FROM dbo.portal_tv_terminais WHERE [id] = @id;`);
  return lerVisualizacao3D(result.recordset[0]?.visualizacao_3d);
}

export async function definirVisualizacaoDoAparelho(
  terminalId: string,
  visualizacao: unknown,
  admin: { nomeExibicao: string }
): Promise<void> {
  if (!ehVisualizacao3D(visualizacao)) throw new ValidationError('Escolha "3dplay" ou "product-explorer".');

  const aparelho = (await listarAparelhosTerminalFabrica()).find((a) => a.id.toUpperCase() === terminalId.toUpperCase());
  if (!aparelho) throw new ValidationError("Aparelho não encontrado entre os do Terminal de Fábrica.");
  if (aparelho.visualizacao === visualizacao) return;

  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, terminalId)
    .input("visualizacao", sql.VarChar(20), visualizacao)
    .query(`UPDATE dbo.portal_tv_terminais SET [visualizacao_3d] = @visualizacao, [atualizado_em] = SYSDATETIME() WHERE [id] = @id;`);

  await registrarLog({
    nivel: "info",
    origem: "terminal-fabrica/visualizacao",
    mensagem: `${admin.nomeExibicao} mudou o 3D do aparelho ${aparelho.nome ?? terminalId} de ${aparelho.visualizacao} para ${visualizacao}.`,
  });
}
