import {
  getSqlServerPool,
  sql,
} from "@/lib/database/sql-server";

import {
  generateApprovalDrawingSvg,
  type ApprovalDrawingData,
  type ApprovalDrawingRepresentation,
} from "@/modules/desenho-aprovacao/generator/generate-approval-drawing-svg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface DrawingDatabaseRecord {
  numero: string;

  cliente: string | null;
  produto: string | null;
  modelo: string | null;

  caminhao: string | null;
  cabine: string | null;

  comprimento: number | null;
  altura: number | null;

  capacidadeTon: number | null;
  volumeM3: number | null;

  compartimentos: number | null;
  peso: number | null;

  cargaDianteira: number | null;
  cargaTraseira: number | null;

  observacoes: string | null;

  tipoRepresentacao:
    ApprovalDrawingRepresentation;

  dataEmissao: string | null;
  previsaoAprovacao: string | null;

  incluirCotas: boolean;
  incluirCaminhao: boolean;

  responsavel: string;
}

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!uniqueIdentifierPattern.test(id)) {
      return Response.json(
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

    const result = await pool
      .request()
      .input(
        "id",
        sql.VarChar(36),
        id
      )
      .query<DrawingDatabaseRecord>(`
        SELECT
          [numero],

          [cliente],
          [produto],
          [modelo],

          [caminhao],
          [cabine],

          [comprimento],
          [altura],

          [capacidade_ton]
            AS [capacidadeTon],

          [volume_m3]
            AS [volumeM3],

          [compartimentos],
          [peso],

          [carga_dianteira]
            AS [cargaDianteira],

          [carga_traseira]
            AS [cargaTraseira],

          [observacoes],

          [tipo_representacao]
            AS [tipoRepresentacao],

          CONVERT(
            VARCHAR(10),
            [data_emissao],
            23
          ) AS [dataEmissao],

          CONVERT(
            VARCHAR(10),
            [previsao_aprovacao],
            23
          ) AS [previsaoAprovacao],

          CAST(
            [incluir_cotas]
            AS BIT
          ) AS [incluirCotas],

          CAST(
            [incluir_caminhao]
            AS BIT
          ) AS [incluirCaminhao],

          COALESCE(
            NULLIF(
              [atualizado_por],
              N''
            ),
            NULLIF(
              [criado_por],
              N''
            ),
            N'portal-sem-autenticacao'
          ) AS [responsavel]

        FROM
          [dbo].[eng_desenhos_aprovacao]

        WHERE
          [id] = @id
          AND [ativo] = 1;
      `);

    const desenho = result.recordset[0];

    if (!desenho) {
      return Response.json(
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

    const drawingData: ApprovalDrawingData = {
      numero: desenho.numero,

      /*
       * Ainda não é uma revisão oficial.
       * É apenas a visualização do rascunho.
       */
      codigoRevisao: "PRÉVIA",

      cliente: desenho.cliente,
      produto: desenho.produto,
      modelo: desenho.modelo,

      caminhao: desenho.caminhao,
      cabine: desenho.cabine,

      comprimento: desenho.comprimento,
      altura: desenho.altura,

      capacidadeTon:
        desenho.capacidadeTon,

      volumeM3: desenho.volumeM3,

      compartimentos:
        desenho.compartimentos,

      peso: desenho.peso,

      cargaDianteira:
        desenho.cargaDianteira,

      cargaTraseira:
        desenho.cargaTraseira,

      observacoes:
        desenho.observacoes,

      tipoRepresentacao:
        desenho.tipoRepresentacao,

      dataEmissao:
        desenho.dataEmissao,

      previsaoAprovacao:
        desenho.previsaoAprovacao,

      incluirCotas:
        desenho.incluirCotas,

      incluirCaminhao:
        desenho.incluirCaminhao,

      criadoPor:
        desenho.responsavel,
    };

    const svg =
      generateApprovalDrawingSvg(
        drawingData
      );

    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type":
          "image/svg+xml; charset=utf-8",

        "Cache-Control":
          "no-store, max-age=0",

        "Content-Disposition":
          `inline; filename="${desenho.numero}-previa.svg"`,

        "X-Content-Type-Options":
          "nosniff",
      },
    });
  } catch (error) {
    console.error(
      "Erro ao gerar pré-visualização SVG:",
      error
    );

    return Response.json(
      {
        ok: false,
        message:
          "Não foi possível gerar a pré-visualização do desenho.",
      },
      {
        status: 500,
      }
    );
  }
}