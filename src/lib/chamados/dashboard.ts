import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import type { PrioridadeChamado } from "./chamados";

export interface FiltrosDashboard {
  /* null = sem restrição de setor (admin vê tudo). */
  setorIds: string[] | null;
  /* Setor escolhido no filtro da tela — sempre aplicado por cima da restrição de acesso acima. */
  setorId?: string;
  empresa?: string;
  dataInicial?: string;
  dataFinal?: string;
}

export interface TotaisPorStatus {
  total: number;
  aberto: number;
  emAndamento: number;
  aguardandoConfirmacao: number;
  resolvido: number;
  fechado: number;
}

export interface ContagemPrioridade {
  prioridade: PrioridadeChamado;
  total: number;
}

export interface ContagemSetor {
  setorId: string;
  setorNome: string;
  total: number;
}

export interface ContagemDia {
  dia: string;
  total: number;
}

export interface ContagemAtendente {
  atendenteNome: string;
  total: number;
}

export interface ContagemEmpresa {
  empresa: string;
  total: number;
}

export interface EstatisticasChamados {
  totais: TotaisPorStatus;
  tempoMedioResolucaoHoras: number | null;
  porPrioridade: ContagemPrioridade[];
  porSetor: ContagemSetor[];
  porDia: ContagemDia[];
  porAtendente: ContagemAtendente[];
  porEmpresa: ContagemEmpresa[];
}

type AplicarInput = (request: InstanceType<typeof sql.Request>) => void;

/*
 * Monta a cláusula WHERE + os parâmetros comuns a todas as
 * consultas do dashboard, para não repetir a lógica de escopo
 * (setores que o usuário atende + filtros da tela) em cada uma.
 * Cada consulta cria seu próprio `sql.Request` e aplica esses
 * mesmos inputs — necessário porque o driver `mssql` não permite
 * reaproveitar um único `Request` em consultas disparadas em
 * paralelo.
 */
function construirFiltro(filtros: FiltrosDashboard) {
  const condicoes: string[] = [];
  const inputs: AplicarInput[] = [];

  if (filtros.setorIds !== null) {
    condicoes.push(
      filtros.setorIds.length === 0
        ? "1 = 0"
        : `c.[setor_id] IN (${filtros.setorIds.map((_, i) => `@setorId${i}`).join(", ")})`
    );

    filtros.setorIds.forEach((id, indice) => {
      inputs.push((request) => request.input(`setorId${indice}`, sql.UniqueIdentifier, id));
    });
  }

  if (filtros.setorId) {
    condicoes.push("c.[setor_id] = @setorIdFiltro");
    inputs.push((request) =>
      request.input("setorIdFiltro", sql.UniqueIdentifier, filtros.setorId)
    );
  }

  if (filtros.empresa) {
    condicoes.push("c.[empresa] = @empresaFiltro");
    inputs.push((request) =>
      request.input("empresaFiltro", sql.NVarChar(30), filtros.empresa)
    );
  }

  if (filtros.dataInicial) {
    condicoes.push("c.[criado_em] >= @dataInicial");
    inputs.push((request) => request.input("dataInicial", sql.DateTime2, filtros.dataInicial));
  }

  if (filtros.dataFinal) {
    condicoes.push("c.[criado_em] < DATEADD(DAY, 1, @dataFinal)");
    inputs.push((request) => request.input("dataFinal", sql.Date, filtros.dataFinal));
  }

  const clausulaWhere = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";

  return { clausulaWhere, inputs };
}

async function criarRequestFiltrado(inputs: AplicarInput[]) {
  const pool = await getSqlServerPool();
  const request = pool.request();
  inputs.forEach((aplicar) => aplicar(request));
  return request;
}

export async function buscarEstatisticasChamados(
  filtros: FiltrosDashboard
): Promise<EstatisticasChamados> {
  const { clausulaWhere, inputs } = construirFiltro(filtros);

  const [
    totaisResult,
    tempoResult,
    prioridadeResult,
    setorResult,
    diaResult,
    atendenteResult,
    empresaResult,
  ] = await Promise.all([
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{
          total: number;
          aberto: number;
          em_andamento: number;
          aguardando_confirmacao: number;
          resolvido: number;
          fechado: number;
        }>(`
          SELECT
            COUNT(*) AS [total],
            SUM(CASE WHEN c.[status] = 'aberto' THEN 1 ELSE 0 END) AS [aberto],
            SUM(CASE WHEN c.[status] = 'em_andamento' THEN 1 ELSE 0 END) AS [em_andamento],
            SUM(CASE WHEN c.[status] = 'aguardando_confirmacao' THEN 1 ELSE 0 END) AS [aguardando_confirmacao],
            SUM(CASE WHEN c.[status] = 'resolvido' THEN 1 ELSE 0 END) AS [resolvido],
            SUM(CASE WHEN c.[status] = 'fechado' THEN 1 ELSE 0 END) AS [fechado]
          FROM dbo.portal_chamados AS c
          ${clausulaWhere};
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ horas_media: number | null }>(`
          SELECT AVG(CAST(DATEDIFF(MINUTE, c.[criado_em], c.[resolvido_em]) AS FLOAT)) / 60.0 AS [horas_media]
          FROM dbo.portal_chamados AS c
          ${clausulaWhere ? `${clausulaWhere} AND` : "WHERE"} c.[resolvido_em] IS NOT NULL;
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ prioridade: string; total: number }>(`
          SELECT c.[prioridade], COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          ${clausulaWhere}
          GROUP BY c.[prioridade];
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ setor_id: string; setor_nome: string; total: number }>(`
          SELECT
            CONVERT(VARCHAR(36), c.[setor_id]) AS [setor_id],
            s.[nome] AS [setor_nome],
            COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          INNER JOIN dbo.portal_setores AS s ON s.[id] = c.[setor_id]
          ${clausulaWhere}
          GROUP BY c.[setor_id], s.[nome]
          ORDER BY COUNT(*) DESC;
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ dia: string; total: number }>(`
          SELECT
            CONVERT(VARCHAR(10), c.[criado_em], 120) AS [dia],
            COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          ${clausulaWhere}
          GROUP BY CONVERT(VARCHAR(10), c.[criado_em], 120)
          ORDER BY [dia];
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ atendente_nome: string | null; total: number }>(`
          SELECT
            COALESCE(u.[nome_exibicao], 'Sem atendente') AS [atendente_nome],
            COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          LEFT JOIN dbo.portal_usuarios AS u ON u.[id] = c.[atendente_usuario_id]
          ${clausulaWhere}
          GROUP BY u.[nome_exibicao]
          ORDER BY COUNT(*) DESC;
        `);
      })(),
      (async () => {
        const request = await criarRequestFiltrado(inputs);
        return request.query<{ empresa: string | null; total: number }>(`
          SELECT
            COALESCE(NULLIF(c.[empresa], ''), 'Sem empresa') AS [empresa],
            COUNT(*) AS [total]
          FROM dbo.portal_chamados AS c
          ${clausulaWhere}
          GROUP BY c.[empresa]
          ORDER BY COUNT(*) DESC;
        `);
      })(),
    ]);

  const totaisRow = totaisResult.recordset[0];

  return {
    totais: {
      total: totaisRow?.total ?? 0,
      aberto: totaisRow?.aberto ?? 0,
      emAndamento: totaisRow?.em_andamento ?? 0,
      aguardandoConfirmacao: totaisRow?.aguardando_confirmacao ?? 0,
      resolvido: totaisRow?.resolvido ?? 0,
      fechado: totaisRow?.fechado ?? 0,
    },
    tempoMedioResolucaoHoras: tempoResult.recordset[0]?.horas_media ?? null,
    porPrioridade: prioridadeResult.recordset.map((row) => ({
      prioridade: row.prioridade as PrioridadeChamado,
      total: row.total,
    })),
    porSetor: setorResult.recordset.map((row) => ({
      setorId: row.setor_id,
      setorNome: row.setor_nome,
      total: row.total,
    })),
    porDia: diaResult.recordset.map((row) => ({ dia: row.dia, total: row.total })),
    porAtendente: atendenteResult.recordset.map((row) => ({
      atendenteNome: row.atendente_nome ?? "Sem atendente",
      total: row.total,
    })),
    porEmpresa: empresaResult.recordset.map((row) => ({
      empresa: row.empresa ?? "Sem empresa",
      total: row.total,
    })),
  };
}
