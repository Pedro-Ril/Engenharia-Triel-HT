import { NextRequest, NextResponse } from "next/server";
import { pool } from "./db";

type SqlBuild = {
  whereClause: string;
  params: string[];
};

function buildWhereClause(searchParams: URLSearchParams): SqlBuild {
  const params: string[] = [];
  const where: string[] = [];

  const dataInicial = searchParams.get("dataInicial")?.trim();
  const dataFinal = searchParams.get("dataFinal")?.trim();

  const projetista = searchParams.get("projetista")?.trim();
  const cliente = searchParams.get("cliente")?.trim();

  const projetistaInterativo = searchParams.get("projetista_interativo")?.trim();
  const clienteInterativo = searchParams.get("cliente_interativo")?.trim();
  const periodo = searchParams.get("periodo")?.trim();
  const diaSemana = searchParams.get("diaSemana")?.trim();

  if (dataInicial) {
    params.push(dataInicial);
    where.push(`sent_at::date >= $${params.length}`);
  }

  if (dataFinal) {
    params.push(dataFinal);
    where.push(`sent_at::date <= $${params.length}`);
  }

  if (projetista && projetista !== "Todos") {
    params.push(projetista);
    where.push(`TRIM(COALESCE(nome, '')) = $${params.length}`);
  }

  if (cliente && cliente !== "Todos") {
    params.push(cliente);
    where.push(`TRIM(COALESCE(cliente, '')) = $${params.length}`);
  }

  if (projetistaInterativo) {
    params.push(projetistaInterativo);
    where.push(`TRIM(COALESCE(nome, '')) = $${params.length}`);
  }

  if (clienteInterativo) {
    params.push(clienteInterativo);
    where.push(`TRIM(COALESCE(cliente, '')) = $${params.length}`);
  }

  if (periodo) {
    params.push(periodo);
    where.push(`TO_CHAR(sent_at, 'YYYY-MM') = $${params.length}`);
  }

  if (diaSemana) {
    params.push(diaSemana);
    where.push(`EXTRACT(DOW FROM sent_at)::int = $${params.length}`);
  }

  return {
    whereClause: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

function getDiaSemanaLabel(dia: number): string {
  const mapa: Record<number, string> = {
    0: "Dom",
    1: "Seg",
    2: "Ter",
    3: "Qua",
    4: "Qui",
    5: "Sex",
    6: "Sáb",
  };

  return mapa[dia] ?? String(dia);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { whereClause, params } = buildWhereClause(searchParams);

    const baseCte = `
      WITH base AS (
        SELECT
          id,
          TRIM(COALESCE(nome, '')) AS nome,
          TRIM(COALESCE(cliente, '')) AS cliente,
          sent_at,
          sent_at::date AS data_envio,
          EXTRACT(DAY FROM sent_at)::int AS dia,
          EXTRACT(DOW FROM sent_at)::int AS dia_semana,
          TO_CHAR(sent_at, 'YYYY-MM') AS periodo,
          COALESCE(
            NULLIF(TRIM(ordem), ''),
            NULLIF(TRIM(num_of), ''),
            NULLIF(TRIM(num_ped), ''),
            NULLIF(TRIM(cod_cj_geral), ''),
            NULLIF(TRIM(cod_focco), ''),
            id::text
          ) AS projeto_ref
        FROM emails
        ${whereClause}
      )
    `;

    const [
      kpisResult,
      projetistasResult,
      clientesResult,
      porProjetistaResult,
      porClienteResult,
      crescentePorProjetistaResult,
      projetosPorDiaResult,
      periodoProjetistaResult,
      rankingProjetistasResult,
      topClientesResult,
      projetosMesResult,
      diaSemanaResult,
      projetistaTopResult,
      clienteTopResult,
      mediaDiariaResult,
      concentracaoClientesResult,
    ] = await Promise.all([
      pool.query(
        `
        ${baseCte}
        SELECT
          COUNT(DISTINCT cliente) FILTER (WHERE cliente <> '') AS clientes,
          COUNT(DISTINCT nome) FILTER (WHERE nome <> '') AS projetistas,
          COUNT(DISTINCT projeto_ref) AS projetos_periodo,
          COUNT(DISTINCT cliente) FILTER (WHERE cliente <> '') AS clientes_periodo
        FROM base
        `,
        params
      ),

      pool.query(`
        SELECT DISTINCT TRIM(COALESCE(nome, '')) AS nome
        FROM emails
        WHERE TRIM(COALESCE(nome, '')) <> ''
        ORDER BY nome
      `),

      pool.query(`
        SELECT DISTINCT TRIM(COALESCE(cliente, '')) AS cliente
        FROM emails
        WHERE TRIM(COALESCE(cliente, '')) <> ''
        ORDER BY cliente
      `),

      pool.query(
        `
        ${baseCte}
        SELECT
          nome,
          COUNT(DISTINCT projeto_ref)::int AS total
        FROM base
        WHERE nome <> ''
        GROUP BY nome
        ORDER BY total DESC, nome ASC
        `,
        params
      ),

      pool.query(
        `
        ${baseCte}
        SELECT
          cliente,
          COUNT(DISTINCT projeto_ref)::int AS total
        FROM base
        WHERE cliente <> ''
        GROUP BY cliente
        ORDER BY total DESC, cliente ASC
        `,
        params
      ),

      pool.query(
        `
        ${baseCte}
        SELECT
          periodo,
          nome,
          COUNT(DISTINCT projeto_ref)::int AS total
        FROM base
        WHERE nome <> ''
        GROUP BY periodo, nome
        ORDER BY periodo ASC, nome ASC
        `,
        params
      ),

      pool.query(
        `
        ${baseCte}
        SELECT
          dia,
          COUNT(DISTINCT projeto_ref)::int AS total
        FROM base
        GROUP BY dia
        ORDER BY dia ASC
        `,
        params
      ),

      pool.query(
        `
        ${baseCte}
        SELECT
          periodo,
          nome,
          COUNT(DISTINCT projeto_ref)::int AS total
        FROM base
        WHERE nome <> ''
        GROUP BY periodo, nome
        ORDER BY periodo ASC, nome ASC
        `,
        params
      ),

      pool.query(
        `
        ${baseCte}
        SELECT
          nome,
          COUNT(DISTINCT projeto_ref)::int AS total
        FROM base
        WHERE nome <> ''
        GROUP BY nome
        ORDER BY total DESC, nome ASC
        LIMIT 10
        `,
        params
      ),

      pool.query(
        `
        ${baseCte}
        SELECT
          cliente,
          COUNT(DISTINCT projeto_ref)::int AS total
        FROM base
        WHERE cliente <> ''
        GROUP BY cliente
        ORDER BY total DESC, cliente ASC
        LIMIT 10
        `,
        params
      ),

      pool.query(
        `
        ${baseCte}
        SELECT
          periodo,
          COUNT(DISTINCT projeto_ref)::int AS total
        FROM base
        GROUP BY periodo
        ORDER BY periodo ASC
        `,
        params
      ),

      pool.query(
        `
        ${baseCte}
        SELECT
          dia_semana,
          COUNT(DISTINCT projeto_ref)::int AS total
        FROM base
        GROUP BY dia_semana
        ORDER BY dia_semana ASC
        `,
        params
      ),

      pool.query(
        `
        ${baseCte}
        SELECT
          nome,
          COUNT(DISTINCT projeto_ref)::int AS total
        FROM base
        WHERE nome <> ''
        GROUP BY nome
        ORDER BY total DESC, nome ASC
        LIMIT 1
        `,
        params
      ),

      pool.query(
        `
        ${baseCte}
        SELECT
          cliente,
          COUNT(DISTINCT projeto_ref)::int AS total
        FROM base
        WHERE cliente <> ''
        GROUP BY cliente
        ORDER BY total DESC, cliente ASC
        LIMIT 1
        `,
        params
      ),

      pool.query(
        `
        ${baseCte}
        SELECT
          CASE
            WHEN COUNT(DISTINCT data_envio) = 0 THEN 0
            ELSE ROUND(
              COUNT(DISTINCT projeto_ref)::numeric / COUNT(DISTINCT data_envio),
              2
            )
          END AS media_diaria
        FROM base
        `,
        params
      ),

      pool.query(
        `
        ${baseCte},
        clientes_rank AS (
          SELECT
            cliente,
            COUNT(DISTINCT projeto_ref)::numeric AS total
          FROM base
          WHERE cliente <> ''
          GROUP BY cliente
          ORDER BY total DESC
          LIMIT 5
        ),
        total_geral AS (
          SELECT COUNT(DISTINCT projeto_ref)::numeric AS total
          FROM base
        )
        SELECT
          CASE
            WHEN (SELECT total FROM total_geral) = 0 THEN 0
            ELSE ROUND(
              (SELECT COALESCE(SUM(total), 0) FROM clientes_rank) * 100.0 /
              (SELECT total FROM total_geral),
              2
            )
          END AS concentracao_top5
        `,
        params
      ),
    ]);

    const diaSemanaFormatado = diaSemanaResult.rows.map((row) => ({
      dia_semana: Number(row.dia_semana),
      label: getDiaSemanaLabel(Number(row.dia_semana)),
      total: Number(row.total),
    }));

    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          ...kpisResult.rows[0],
          media_diaria: mediaDiariaResult.rows[0]?.media_diaria ?? "0",
          projetista_top: projetistaTopResult.rows[0]?.nome ?? "",
          cliente_top: clienteTopResult.rows[0]?.cliente ?? "",
          concentracao_top5:
            concentracaoClientesResult.rows[0]?.concentracao_top5 ?? "0",
        },
        filtros: {
          projetistas: projetistasResult.rows.map((row) => row.nome),
          clientes: clientesResult.rows.map((row) => row.cliente),
        },
        projetosPorProjetista: porProjetistaResult.rows,
        projetosPorCliente: porClienteResult.rows,
        crescentePorProjetista: crescentePorProjetistaResult.rows,
        projetosLiberadosPorDia: projetosPorDiaResult.rows,
        projetosPeriodoProjetista: periodoProjetistaResult.rows,
        rankingProjetistas: rankingProjetistasResult.rows,
        topClientes: topClientesResult.rows,
        projetosMes: projetosMesResult.rows,
        projetosPorDiaSemana: diaSemanaFormatado,
      },
    });
  } catch (error) {
    console.error("Erro BI:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erro ao consultar banco",
      },
      { status: 500 }
    );
  }
}