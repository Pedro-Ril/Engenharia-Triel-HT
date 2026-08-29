import { NextResponse } from "next/server";

import {
  getSqlServerPool,
} from "@/lib/database/sql-server";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DatabaseHealthResult {
  servidor: string;
  banco: string;
  dataServidor: Date;
  tabelaDesenhosExiste: boolean;
}

async function handleGET() {
  try {
    const pool = await getSqlServerPool();

    const result =
      await pool.request().query<DatabaseHealthResult>(`
        SELECT
          CAST(@@SERVERNAME AS NVARCHAR(128))
            AS servidor,

          CAST(DB_NAME() AS NVARCHAR(128))
            AS banco,

          SYSDATETIME()
            AS dataServidor,

          CAST(
            CASE
              WHEN OBJECT_ID(
                N'dbo.eng_desenhos_aprovacao',
                N'U'
              ) IS NOT NULL
              THEN 1
              ELSE 0
            END
            AS BIT
          ) AS tabelaDesenhosExiste;
      `);

    const databaseInformation =
      result.recordset[0];

    return NextResponse.json({
      ok: true,
      message:
        "Conexão com o SQL Server realizada com sucesso.",
      data: databaseInformation,
    });
  } catch (error) {
    console.error(
      "Erro ao conectar com o SQL Server:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Não foi possível conectar ao SQL Server.",
      },
      {
        status: 500,
      }
    );
  }
}

export const GET = comMetricasApi("health/database", handleGET);