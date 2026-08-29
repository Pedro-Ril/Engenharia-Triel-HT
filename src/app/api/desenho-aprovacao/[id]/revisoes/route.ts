import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import {
  getSqlServerPool,
  sql,
} from "@/lib/database/sql-server";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface RevisionListItem {
  id: string;
  numeroRevisao: number;
  codigoRevisao: string;
  statusRevisao: string;

  templateCodigo: string;
  templateVersao: number;
  geradorVersao: string;

  possuiSvg: boolean;
  possuiPdf: boolean;

  criadoEm: string;
  criadoPor: string;

  geradoEm: string | null;
  geradoPor: string | null;

  enviadoAprovacaoEm: string | null;
  enviadoAprovacaoPor: string | null;

  decididoEm: string | null;
  decididoPor: string | null;

  observacaoDecisao: string | null;
}

interface DrawingRevisionInfo {
  desenhoId: string;
  numero: string;
  status: string;
  revisaoAtualId: string | null;
}

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleGET(
  _request: Request,
  context: RouteContext
) {
  const acesso = await verificarAcessoModuloApi("desenho-aprovacao");
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;

    if (!uniqueIdentifierPattern.test(id)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "O identificador do desenho é inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const pool = await getSqlServerPool();

    const drawingResult = await pool
      .request()
      .input(
        "desenhoId",
        sql.VarChar(36),
        id
      )
      .query<DrawingRevisionInfo>(`
        SELECT
          CONVERT(
            VARCHAR(36),
            [id]
          ) AS [desenhoId],

          [numero],
          [status],

          CONVERT(
            VARCHAR(36),
            [revisao_atual_id]
          ) AS [revisaoAtualId]

        FROM
          [dbo].[eng_desenhos_aprovacao]

        WHERE
          [id] = @desenhoId
          AND [ativo] = 1;
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
        }
      );
    }

    const revisionsResult = await pool
      .request()
      .input(
        "desenhoId",
        sql.VarChar(36),
        id
      )
      .query<RevisionListItem>(`
        SELECT
          CONVERT(
            VARCHAR(36),
            [id]
          ) AS [id],

          [numero_revisao]
            AS [numeroRevisao],

          [codigo_revisao]
            AS [codigoRevisao],

          [status_revisao]
            AS [statusRevisao],

          [template_codigo]
            AS [templateCodigo],

          [template_versao]
            AS [templateVersao],

          [gerador_versao]
            AS [geradorVersao],

          CAST(
            CASE
              WHEN [svg_conteudo] IS NOT NULL
                AND LEN([svg_conteudo]) > 0
                THEN 1
              ELSE 0
            END
            AS BIT
          ) AS [possuiSvg],

          CAST(
            CASE
              WHEN [pdf_caminho] IS NOT NULL
                AND LEN([pdf_caminho]) > 0
                THEN 1
              ELSE 0
            END
            AS BIT
          ) AS [possuiPdf],

          CONVERT(
            VARCHAR(33),
            [criado_em],
            126
          ) AS [criadoEm],

          [criado_por]
            AS [criadoPor],

          CONVERT(
            VARCHAR(33),
            [gerado_em],
            126
          ) AS [geradoEm],

          [gerado_por]
            AS [geradoPor],

          CONVERT(
            VARCHAR(33),
            [enviado_aprovacao_em],
            126
          ) AS [enviadoAprovacaoEm],

          [enviado_aprovacao_por]
            AS [enviadoAprovacaoPor],

          CONVERT(
            VARCHAR(33),
            [decidido_em],
            126
          ) AS [decididoEm],

          [decidido_por]
            AS [decididoPor],

          [observacao_decisao]
            AS [observacaoDecisao]

        FROM
          [dbo].[eng_desenhos_aprovacao_revisoes]

        WHERE
          [desenho_id] = @desenhoId

        ORDER BY
          [numero_revisao] DESC;
      `);

    return NextResponse.json({
      ok: true,

      data: {
        desenho,
        revisoes:
          revisionsResult.recordset,
      },

      total:
        revisionsResult.recordset.length,
    });
  } catch (error) {
    console.error(
      "Erro ao listar revisões do desenho:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Não foi possível listar as revisões do desenho.",
      },
      {
        status: 500,
      }
    );
  }
}

export const GET = comMetricasApi("desenho-aprovacao/[id]/revisoes", handleGET);
