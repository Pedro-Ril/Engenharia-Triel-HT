import { NextResponse } from "next/server";

import {
  getSqlServerPool,
  sql,
} from "@/lib/database/sql-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApprovalStatus =
  | "rascunho"
  | "em_aprovacao"
  | "pendente"
  | "aprovado"
  | "reprovado";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface ApprovalDrawingSummary {
  id: string;
  numero: string;
  status: ApprovalStatus;
  ativo: boolean;
}

interface ApprovalHistoryDatabaseRow {
  id: string;
  desenhoId: string;

  acao: string;

  statusAnterior: ApprovalStatus | null;
  statusNovo: ApprovalStatus | null;

  observacao: string | null;
  dadosJson: string | null;

  usuario: string | null;
  criadoEm: string;
}

interface ApprovalHistoryItem {
  id: string;
  desenhoId: string;

  acao: string;

  statusAnterior: ApprovalStatus | null;
  statusNovo: ApprovalStatus | null;

  observacao: string | null;
  dados: unknown;

  usuario: string | null;
  criadoEm: string;
}

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDadosJson(
  value: string | null
): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    /*
     * Mantém o conteúdo original caso algum registro antigo
     * não possua um JSON válido.
     */
    return value;
  }
}

/* =========================================================
   GET - LISTAR HISTÓRICO DO DESENHO
   ========================================================= */

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    if (
      !uniqueIdentifierPattern.test(id)
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "O identificador do desenho é inválido.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const pool =
      await getSqlServerPool();

    /*
     * Utilizamos VARCHAR(36) porque, nesta configuração
     * do driver, sql.UniqueIdentifier apresentou erro
     * de validação.
     *
     * O valor já foi validado pelo regex acima.
     */
    const drawingResult =
      await pool
        .request()
        .input(
          "id",
          sql.VarChar(36),
          id
        )
        .query<ApprovalDrawingSummary>(`
          SELECT
            CONVERT(
              VARCHAR(36),
              [id]
            ) AS [id],

            [numero],
            [status],

            CAST(
              [ativo]
              AS BIT
            ) AS [ativo]

          FROM
            [dbo].[eng_desenhos_aprovacao]

          WHERE
            [id] = @id;
        `);

    const desenho =
      drawingResult.recordset[0];

    if (!desenho) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Desenho de aprovação não encontrado.",
        },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const historyResult =
      await pool
        .request()
        .input(
          "id",
          sql.VarChar(36),
          id
        )
        .query<ApprovalHistoryDatabaseRow>(`
          SELECT
            CONVERT(
              VARCHAR(36),
              [id]
            ) AS [id],

            CONVERT(
              VARCHAR(36),
              [desenho_id]
            ) AS [desenhoId],

            [acao],

            [status_anterior]
              AS [statusAnterior],

            [status_novo]
              AS [statusNovo],

            [observacao],

            [dados_json]
              AS [dadosJson],

            [usuario],

            CONVERT(
              VARCHAR(33),
              [criado_em],
              126
            ) AS [criadoEm]

          FROM
            [dbo].[eng_desenhos_aprovacao_historico]

          WHERE
            [desenho_id] = @id

          ORDER BY
            [criado_em] ASC,
            [id] ASC;
        `);

    const historico: ApprovalHistoryItem[] =
      historyResult.recordset.map(
        (registro) => ({
          id: registro.id,

          desenhoId:
            registro.desenhoId,

          acao: registro.acao,

          statusAnterior:
            registro.statusAnterior,

          statusNovo:
            registro.statusNovo,

          observacao:
            registro.observacao,

          dados: parseDadosJson(
            registro.dadosJson
          ),

          usuario:
            registro.usuario,

          criadoEm:
            registro.criadoEm,
        })
      );

    return NextResponse.json(
      {
        ok: true,

        data: {
          desenho: {
            id: desenho.id,
            numero: desenho.numero,
            status: desenho.status,
            ativo: desenho.ativo,
          },

          historico,
        },

        total: historico.length,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Erro ao buscar histórico do desenho de aprovação:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Não foi possível carregar o histórico do desenho de aprovação.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}