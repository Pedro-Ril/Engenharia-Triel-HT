import {
  getSqlServerPool,
  sql,
} from "@/lib/database/sql-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    id: string;
    revisaoId: string;
  }>;
}

interface RevisionSvgRecord {
  numero: string;
  codigoRevisao: string;
  statusRevisao: string;
  svgConteudo: string | null;
}

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const {
      id,
      revisaoId,
    } = await context.params;

    if (
      !uniqueIdentifierPattern.test(id) ||
      !uniqueIdentifierPattern.test(
        revisaoId
      )
    ) {
      return Response.json(
        {
          ok: false,
          message:
            "O identificador do desenho ou da revisão é inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const pool =
      await getSqlServerPool();

    const result = await pool
      .request()
      .input(
        "desenhoId",
        sql.VarChar(36),
        id
      )
      .input(
        "revisaoId",
        sql.VarChar(36),
        revisaoId
      )
      .query<RevisionSvgRecord>(`
        SELECT
          desenho.[numero],

          revisao.[codigo_revisao]
            AS [codigoRevisao],

          revisao.[status_revisao]
            AS [statusRevisao],

          revisao.[svg_conteudo]
            AS [svgConteudo]

        FROM
          [dbo].[eng_desenhos_aprovacao_revisoes]
            AS revisao

        INNER JOIN
          [dbo].[eng_desenhos_aprovacao]
            AS desenho
          ON desenho.[id] =
            revisao.[desenho_id]

        WHERE
          desenho.[id] =
            @desenhoId

          AND revisao.[id] =
            @revisaoId

          AND revisao.[desenho_id] =
            @desenhoId;
      `);

    const revisao =
      result.recordset[0];

    if (!revisao) {
      return Response.json(
        {
          ok: false,
          message:
            "Revisão do desenho não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    if (!revisao.svgConteudo) {
      return Response.json(
        {
          ok: false,
          message:
            "A revisão ainda não possui um SVG gerado.",
        },
        {
          status: 409,
        }
      );
    }

    const fileName =
      `${revisao.numero}-${revisao.codigoRevisao}.svg`;

    return new Response(
      revisao.svgConteudo,
      {
        status: 200,
        headers: {
          "Content-Type":
            "image/svg+xml; charset=utf-8",

          "Content-Disposition":
            `inline; filename="${fileName}"`,

          "Cache-Control":
            "private, no-store, max-age=0",

          "X-Content-Type-Options":
            "nosniff",

          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
      }
    );
  } catch (error) {
    console.error(
      "Erro ao buscar SVG da revisão:",
      error
    );

    return Response.json(
      {
        ok: false,
        message:
          "Não foi possível carregar o SVG da revisão.",
      },
      {
        status: 500,
      }
    );
  }
}
