import { NextResponse } from "next/server";

import {
  getUsuarioAtual,
} from "@/lib/auditoria/usuario-atual";
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

interface ApprovalBody {
  usuario?: unknown;
  observacao?: unknown;
}

interface CurrentDrawingRevision {
  desenhoId: string;
  numero: string;
  statusDesenho: string;

  revisaoId: string | null;
  codigoRevisao: string | null;
  statusRevisao: string | null;
}

interface ApprovalResult {
  desenhoId: string;
  numero: string;
  statusDesenho: string;

  revisaoId: string;
  codigoRevisao: string;
  statusRevisao: string;

  aprovadoEm: string;
  aprovadoPor: string;
  observacao: string | null;
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

function optionalText(
  value: unknown,
  maxLength: number
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue.slice(
    0,
    maxLength
  );
}

async function readRequestBody(
  request: Request
): Promise<{
  usuarioInformado: unknown;
  observacao: string | null;
}> {
  let body: ApprovalBody = {};

  try {
    const parsedBody: unknown =
      await request.json();

    if (isObject(parsedBody)) {
      body = parsedBody;
    }
  } catch {
    /*
     * O corpo é opcional.
     */
  }

  return {
    usuarioInformado:
      body.usuario,

    observacao: optionalText(
      body.observacao,
      100000
    ),
  };
}

async function handlePOST(
  request: Request,
  context: RouteContext
) {
  const acesso = await verificarAcessoModuloApi("desenho-aprovacao");
  if (acesso.negado) return acesso.negado;

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
      }
    );
  }

  const {
    usuarioInformado,
    observacao,
  } = await readRequestBody(
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

  const pool =
    await getSqlServerPool();

  const transaction =
    new sql.Transaction(pool);

  try {
    await transaction.begin();

    const currentResult =
      await new sql.Request(
        transaction
      )
        .input(
          "desenhoId",
          sql.VarChar(36),
          id
        )
        .query<CurrentDrawingRevision>(`
          SELECT
            CONVERT(
              VARCHAR(36),
              desenho.[id]
            ) AS [desenhoId],

            desenho.[numero],

            desenho.[status]
              AS [statusDesenho],

            CONVERT(
              VARCHAR(36),
              revisao.[id]
            ) AS [revisaoId],

            revisao.[codigo_revisao]
              AS [codigoRevisao],

            revisao.[status_revisao]
              AS [statusRevisao]

          FROM
            [dbo].[eng_desenhos_aprovacao]
              AS desenho
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          LEFT JOIN
            [dbo].[eng_desenhos_aprovacao_revisoes]
              AS revisao
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

            ON revisao.[id] =
              desenho.[revisao_atual_id]

            AND revisao.[desenho_id] =
              desenho.[id]

          WHERE
            desenho.[id] =
              @desenhoId

            AND desenho.[ativo] = 1;
        `);

    const current =
      currentResult.recordset[0];

    if (!current) {
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
      !current.revisaoId ||
      !current.codigoRevisao
    ) {
      await transaction.rollback();

      return NextResponse.json(
        {
          ok: false,
          message:
            "O desenho não possui uma revisão atual.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      current.statusDesenho !==
      "em_aprovacao"
    ) {
      await transaction.rollback();

      return NextResponse.json(
        {
          ok: false,
          message:
            `O desenho está com o status "${current.statusDesenho}" e não pode ser aprovado.`,
        },
        {
          status: 409,
        }
      );
    }

    if (
      current.statusRevisao !==
      "em_aprovacao"
    ) {
      await transaction.rollback();

      return NextResponse.json(
        {
          ok: false,
          message:
            `A revisão ${current.codigoRevisao} está com o status "${current.statusRevisao}" e não pode ser aprovada.`,
        },
        {
          status: 409,
        }
      );
    }

    const databaseRequest =
      new sql.Request(
        transaction
      );

    databaseRequest.input(
      "desenhoId",
      sql.VarChar(36),
      id
    );

    databaseRequest.input(
      "revisaoId",
      sql.VarChar(36),
      current.revisaoId
    );

    databaseRequest.input(
      "codigoRevisao",
      sql.VarChar(10),
      current.codigoRevisao
    );

    databaseRequest.input(
      "usuario",
      sql.NVarChar(150),
      usuario
    );

    databaseRequest.input(
      "observacao",
      sql.NVarChar(sql.MAX),
      observacao
    );

    const result =
      await databaseRequest
        .query<ApprovalResult>(`
          SET XACT_ABORT ON;

          UPDATE
            [dbo].[eng_desenhos_aprovacao_revisoes]

          SET
            [status_revisao] =
              'aprovado',

            [decidido_em] =
              SYSDATETIME(),

            [decidido_por] =
              @usuario,

            [observacao_decisao] =
              @observacao

          WHERE
            [id] = @revisaoId

            AND [desenho_id] =
              @desenhoId

            AND [status_revisao] =
              'em_aprovacao';

          IF @@ROWCOUNT = 0
          BEGIN
            THROW 50001,
              'A revisão foi alterada durante a aprovação.',
              1;
          END;

          UPDATE
            [dbo].[eng_desenhos_aprovacao]

          SET
            [status] =
              'aprovado',

            [atualizado_em] =
              SYSDATETIME(),

            [atualizado_por] =
              @usuario

          WHERE
            [id] =
              @desenhoId

            AND [revisao_atual_id] =
              @revisaoId

            AND [ativo] = 1

            AND [status] =
              'em_aprovacao';

          IF @@ROWCOUNT = 0
          BEGIN
            THROW 50002,
              'O desenho foi alterado durante a aprovação.',
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

            'APROVADO',

            'em_aprovacao',
            'aprovado',

            COALESCE(
              @observacao,

              CONCAT(
                N'Revisão ',
                @codigoRevisao,
                N' aprovada.'
              )
            ),

            (
              SELECT
                @revisaoId
                  AS [revisaoId],

                @codigoRevisao
                  AS [codigoRevisao],

                @observacao
                  AS [observacao]

              FOR JSON PATH,
                WITHOUT_ARRAY_WRAPPER
            ),

            @usuario
          );

          SELECT
            CONVERT(
              VARCHAR(36),
              desenho.[id]
            ) AS [desenhoId],

            desenho.[numero],

            desenho.[status]
              AS [statusDesenho],

            CONVERT(
              VARCHAR(36),
              revisao.[id]
            ) AS [revisaoId],

            revisao.[codigo_revisao]
              AS [codigoRevisao],

            revisao.[status_revisao]
              AS [statusRevisao],

            CONVERT(
              VARCHAR(33),
              revisao.[decidido_em],
              126
            ) AS [aprovadoEm],

            revisao.[decidido_por]
              AS [aprovadoPor],

            revisao.[observacao_decisao]
              AS [observacao]

          FROM
            [dbo].[eng_desenhos_aprovacao]
              AS desenho

          INNER JOIN
            [dbo].[eng_desenhos_aprovacao_revisoes]
              AS revisao

            ON revisao.[id] =
              desenho.[revisao_atual_id]

          WHERE
            desenho.[id] =
              @desenhoId

            AND revisao.[id] =
              @revisaoId;
        `);

    await transaction.commit();

    return NextResponse.json({
      ok: true,

      message:
        `Revisão ${current.codigoRevisao} aprovada com sucesso.`,

      data:
        result.recordset[0],

      auditoria: {
        usuario,
      },
    });
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      /*
       * A transação pode já estar encerrada.
       */
    }

    console.error(
      "Erro ao aprovar revisão:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Não foi possível aprovar a revisão do desenho.",
      },
      {
        status: 500,
      }
    );
  }
}

export const POST = comMetricasApi("desenho-aprovacao/[id]/aprovar", handlePOST);