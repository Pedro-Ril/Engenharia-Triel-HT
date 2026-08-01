import { NextResponse } from "next/server";

import {
  getUsuarioAtual,
} from "@/lib/auditoria/usuario-atual";
import {
  getSqlServerPool,
  sql,
} from "@/lib/database/sql-server";

import {
  ApprovalDrawingTemplateNotConfiguredError,
  UnsupportedApprovalDrawingProductError,
  generateApprovalDrawingSvg,
  getApprovalDrawingTemplateInfo,
  type ApprovalDrawingData,
  type ApprovalDrawingRepresentation,
} from "@/modules/desenho-aprovacao/generator/generate-approval-drawing-svg";

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

interface GenerateDrawingBody {
  usuario?: unknown;
}

interface DrawingDatabaseRecord {
  id: string;
  numero: string;
  status: ApprovalStatus;

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

  criadoEm: string;

  incluirCotas: boolean;
  incluirCaminhao: boolean;

  proximaRevisao: number;
}

interface GeneratedRevisionResult {
  revisaoId: string;
  desenhoId: string;
  numero: string;

  numeroRevisao: number;
  codigoRevisao: string;

  statusDesenho: ApprovalStatus;
  statusRevisao: string;

  criadoEm: string;
}

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

async function getUsuarioInformado(
  request: Request
): Promise<unknown> {
  try {
    const body: unknown =
      await request.json();

    if (isObject(body)) {
      return body.usuario;
    }
  } catch {
    /*
     * O corpo é opcional.
     */
  }

  return undefined;
}

function getRevisionCode(
  revisionNumber: number
): string {
  return `R${String(
    revisionNumber
  ).padStart(2, "0")}`;
}

function validateDrawing(
  drawing: DrawingDatabaseRecord
): string[] {
  const errors: string[] = [];

  if (!drawing.cliente?.trim()) {
    errors.push("Cliente");
  }

  if (!drawing.produto?.trim()) {
    errors.push("Produto");
  }

  if (
    drawing.comprimento === null ||
    drawing.comprimento <= 0
  ) {
    errors.push("Comprimento");
  }

  if (
    drawing.altura === null ||
    drawing.altura <= 0
  ) {
    errors.push("Altura");
  }

  if (!drawing.dataEmissao) {
    errors.push("Data de emissão");
  }

  if (
    drawing.incluirCaminhao &&
    !drawing.caminhao?.trim()
  ) {
    errors.push("Caminhão");
  }

  return errors;
}

export async function POST(
  request: Request,
  context: RouteContext
) {
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

  const usuarioInformado =
    await getUsuarioInformado(
      request
    );

  /*
   * Aceita somente usuários no formato nome.sobrenome.
   * Quando o valor estiver ausente ou for inválido,
   * utiliza PORTAL_AUDIT_USER.
   */
  const usuario =
    getUsuarioAtual(
      usuarioInformado
    );

  const pool = await getSqlServerPool();

  const transaction =
    new sql.Transaction(pool);

  try {
    await transaction.begin();

    /*
     * UPDLOCK e HOLDLOCK impedem duas gerações
     * simultâneas para o mesmo desenho.
     */
    const drawingResult =
      await new sql.Request(transaction)
        .input(
          "id",
          sql.VarChar(36),
          id
        )
        .query<DrawingDatabaseRecord>(`
          SELECT
            CONVERT(
              VARCHAR(36),
              desenho.[id]
            ) AS [id],

            desenho.[numero],
            desenho.[status],

            desenho.[cliente],
            desenho.[produto],
            desenho.[modelo],

            desenho.[caminhao],
            desenho.[cabine],

            desenho.[comprimento],
            desenho.[altura],

            desenho.[capacidade_ton]
              AS [capacidadeTon],

            desenho.[volume_m3]
              AS [volumeM3],

            desenho.[compartimentos],
            desenho.[peso],

            desenho.[carga_dianteira]
              AS [cargaDianteira],

            desenho.[carga_traseira]
              AS [cargaTraseira],

            desenho.[observacoes],

            desenho.[tipo_representacao]
              AS [tipoRepresentacao],

            CONVERT(
              VARCHAR(10),
              desenho.[data_emissao],
              23
            ) AS [dataEmissao],

            CONVERT(
              VARCHAR(10),
              desenho.[previsao_aprovacao],
              23
            ) AS [previsaoAprovacao],

            CONVERT(
              VARCHAR(33),
              desenho.[criado_em],
              126
            ) AS [criadoEm],

            CAST(
              desenho.[incluir_cotas]
              AS BIT
            ) AS [incluirCotas],

            CAST(
              desenho.[incluir_caminhao]
              AS BIT
            ) AS [incluirCaminhao],

            ISNULL(
              (
                SELECT
                  MAX(
                    revisao.[numero_revisao]
                  ) + 1
                FROM
                  [dbo].[eng_desenhos_aprovacao_revisoes]
                    AS revisao
                WHERE
                  revisao.[desenho_id] =
                    desenho.[id]
              ),
              0
            ) AS [proximaRevisao]

          FROM
            [dbo].[eng_desenhos_aprovacao]
              AS desenho
              WITH (UPDLOCK, HOLDLOCK)

          WHERE
            desenho.[id] = @id
            AND desenho.[ativo] = 1;
        `);

    const drawing =
      drawingResult.recordset[0];

    if (!drawing) {
      await transaction.rollback();

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

    if (
      drawing.status !== "rascunho" &&
      drawing.status !== "pendente"
    ) {
      await transaction.rollback();

      return NextResponse.json(
        {
          ok: false,
          message:
            `Não é possível gerar uma revisão enquanto o desenho está com o status "${drawing.status}".`,
        },
        {
          status: 409,
        }
      );
    }

    const missingFields =
      validateDrawing(drawing);

    if (missingFields.length > 0) {
      await transaction.rollback();

      return NextResponse.json(
        {
          ok: false,
          message:
            "Preencha os campos obrigatórios antes de gerar o desenho.",
          fields: missingFields,
        },
        {
          status: 422,
        }
      );
    }

    const numeroRevisao =
      drawing.proximaRevisao;

    const codigoRevisao =
      getRevisionCode(numeroRevisao);

    const drawingData: ApprovalDrawingData = {
      numero: drawing.numero,
      codigoRevisao,

      cliente: drawing.cliente,
      produto: drawing.produto,
      modelo: drawing.modelo,

      caminhao: drawing.caminhao,
      cabine: drawing.cabine,

      comprimento:
        drawing.comprimento,

      altura: drawing.altura,

      capacidadeTon:
        drawing.capacidadeTon,

      volumeM3:
        drawing.volumeM3,

      compartimentos:
        drawing.compartimentos,

      peso: drawing.peso,

      cargaDianteira:
        drawing.cargaDianteira,

      cargaTraseira:
        drawing.cargaTraseira,

      observacoes:
        drawing.observacoes,

      tipoRepresentacao:
        drawing.tipoRepresentacao,

      dataEmissao:
        drawing.dataEmissao,

      previsaoAprovacao:
        drawing.previsaoAprovacao,

      criadoEm:
        drawing.criadoEm,

      incluirCotas:
        drawing.incluirCotas,

      incluirCaminhao:
        drawing.incluirCaminhao,

      criadoPor: usuario,
    };

    const template =
      getApprovalDrawingTemplateInfo(
        drawing.produto
      );

    const svgContent =
      generateApprovalDrawingSvg(
        drawingData
      );

    const snapshot = JSON.stringify({
      ...drawingData,
      desenhoId: drawing.id,
      statusAnterior: drawing.status,

      template: {
        produto: template.produto,
        codigo: template.codigo,
        versao: template.versao,
        geradorVersao:
          template.geradorVersao,
      },
    });

    const databaseRequest =
      new sql.Request(transaction);

    databaseRequest.input(
      "desenhoId",
      sql.VarChar(36),
      id
    );

    databaseRequest.input(
      "numeroRevisao",
      sql.Int,
      numeroRevisao
    );

    databaseRequest.input(
      "codigoRevisao",
      sql.VarChar(10),
      codigoRevisao
    );

    databaseRequest.input(
      "statusAnterior",
      sql.VarChar(30),
      drawing.status
    );

    databaseRequest.input(
      "dadosJson",
      sql.NVarChar(sql.MAX),
      snapshot
    );

    databaseRequest.input(
      "svgConteudo",
      sql.NVarChar(sql.MAX),
      svgContent
    );

    databaseRequest.input(
      "templateCodigo",
      sql.VarChar(100),
      template.codigo
    );

    databaseRequest.input(
      "templateVersao",
      sql.Int,
      template.versao
    );

    databaseRequest.input(
      "geradorVersao",
      sql.VarChar(50),
      template.geradorVersao
    );

    databaseRequest.input(
      "usuario",
      sql.NVarChar(150),
      usuario
    );

    const generatedResult =
      await databaseRequest.query<GeneratedRevisionResult>(`
        SET XACT_ABORT ON;

        DECLARE @novaRevisao TABLE
        (
          [id] UNIQUEIDENTIFIER NOT NULL
        );

        INSERT INTO
          [dbo].[eng_desenhos_aprovacao_revisoes]
        (
          [desenho_id],

          [numero_revisao],
          [codigo_revisao],
          [status_revisao],

          [dados_json],
          [parametros_json],

          [template_codigo],
          [template_versao],
          [gerador_versao],

          [svg_conteudo],

          [criado_por],

          [gerado_em],
          [gerado_por],

          [enviado_aprovacao_em],
          [enviado_aprovacao_por]
        )

        OUTPUT
          INSERTED.[id]
        INTO
          @novaRevisao ([id])

        VALUES
        (
          @desenhoId,

          @numeroRevisao,
          @codigoRevisao,
          'em_aprovacao',

          @dadosJson,
          NULL,

          @templateCodigo,
          @templateVersao,
          @geradorVersao,

          @svgConteudo,

          @usuario,

          SYSDATETIME(),
          @usuario,

          SYSDATETIME(),
          @usuario
        );

        DECLARE
          @revisaoId UNIQUEIDENTIFIER;

        SELECT TOP (1)
          @revisaoId = [id]
        FROM @novaRevisao;

        UPDATE
          [dbo].[eng_desenhos_aprovacao]

        SET
          [status] = 'em_aprovacao',

          [revisao_atual_id] =
            @revisaoId,

          [atualizado_em] =
            SYSDATETIME(),

          [atualizado_por] =
            @usuario

        WHERE
          [id] = @desenhoId
          AND [ativo] = 1
          AND [status] =
            @statusAnterior;

        IF @@ROWCOUNT = 0
        BEGIN
          THROW 50001,
            'O status do desenho foi alterado durante a geração.',
            1;
        END;

        INSERT INTO
          [dbo].[eng_desenhos_aprovacao_historico]
        (
          [desenho_id],
          [acao],
          [status_anterior],
          [status_novo],
          [observacao],
          [dados_json],
          [usuario]
        )
        VALUES
        (
          @desenhoId,

          'ENVIADO_APROVACAO',

          @statusAnterior,
          'em_aprovacao',

          CONCAT(
            N'Revisão ',
            @codigoRevisao,
            N' gerada e enviada para aprovação.'
          ),

          @dadosJson,
          @usuario
        );

        SELECT
          CONVERT(
            VARCHAR(36),
            revisao.[id]
          ) AS [revisaoId],

          CONVERT(
            VARCHAR(36),
            revisao.[desenho_id]
          ) AS [desenhoId],

          desenho.[numero],

          revisao.[numero_revisao]
            AS [numeroRevisao],

          revisao.[codigo_revisao]
            AS [codigoRevisao],

          desenho.[status]
            AS [statusDesenho],

          revisao.[status_revisao]
            AS [statusRevisao],

          CONVERT(
            VARCHAR(33),
            revisao.[criado_em],
            126
          ) AS [criadoEm]

        FROM
          [dbo].[eng_desenhos_aprovacao_revisoes]
            AS revisao

        INNER JOIN
          [dbo].[eng_desenhos_aprovacao]
            AS desenho
          ON desenho.[id] =
            revisao.[desenho_id]

        WHERE
          revisao.[id] =
            @revisaoId;
      `);

    await transaction.commit();

    return NextResponse.json(
      {
        ok: true,
        message:
          `Revisão ${codigoRevisao} gerada e enviada para aprovação.`,
        data:
          generatedResult.recordset[0],

        auditoria: {
          usuario,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      /*
       * A transação pode já ter sido
       * encerrada pelo SQL Server.
       */
    }

    if (
      error instanceof
        ApprovalDrawingTemplateNotConfiguredError ||
      error instanceof
        UnsupportedApprovalDrawingProductError
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        {
          status: 422,
        }
      );
    }

    console.error(
      "Erro ao gerar revisão do desenho:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Não foi possível gerar a revisão do desenho.",
      },
      {
        status: 500,
      }
    );
  }
}