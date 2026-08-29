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

type ApprovalStatus =
  | "rascunho"
  | "em_aprovacao"
  | "pendente"
  | "aprovado"
  | "reprovado";

type ApprovalRepresentation =
  | "lateral"
  | "superior"
  | "completo";

interface ApprovalProjectResponse {
  id: string;

  /*
   * O SQL Server utiliza BIGINT.
   * O driver retorna esse valor como string para evitar
   * perda de precisão no JavaScript.
   */
  sequencial: string;

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

  status: ApprovalStatus;
  tipoRepresentacao: ApprovalRepresentation;

  dataEmissao: string | null;
  previsaoAprovacao: string | null;

  incluirCotas: boolean;
  calculoAutomatico: boolean;
  incluirCaminhao: boolean;

  criadoEm: string;
  atualizadoEm: string;
}

interface CreateApprovalProjectBody {
  cliente?: unknown;
  produto?: unknown;
  modelo?: unknown;

  caminhao?: unknown;
  cabine?: unknown;

  comprimento?: unknown;
  altura?: unknown;

  capacidadeTon?: unknown;
  volumeM3?: unknown;

  compartimentos?: unknown;
  peso?: unknown;

  cargaDianteira?: unknown;
  cargaTraseira?: unknown;

  observacoes?: unknown;

  tipoRepresentacao?: unknown;

  dataEmissao?: unknown;
  previsaoAprovacao?: unknown;

  incluirCotas?: unknown;
  calculoAutomatico?: unknown;
  incluirCaminhao?: unknown;

  usuario?: unknown;
}

const validRepresentations =
  new Set<ApprovalRepresentation>([
    "lateral",
    "superior",
    "completo",
  ]);

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

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
  fieldName: string,
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
    throw new ValidationError(
      `O campo ${fieldName} deve ser um texto.`
    );
  }

  const normalizedValue =
    value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (
    normalizedValue.length >
    maxLength
  ) {
    throw new ValidationError(
      `O campo ${fieldName} deve possuir no máximo ${maxLength} caracteres.`
    );
  }

  return normalizedValue;
}

function optionalNumber(
  value: unknown,
  fieldName: string,
  options?: {
    integer?: boolean;
    min?: number;
    max?: number;
  }
): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const normalizedValue =
    Number(value);

  if (
    !Number.isFinite(
      normalizedValue
    )
  ) {
    throw new ValidationError(
      `O campo ${fieldName} deve ser um número válido.`
    );
  }

  if (
    options?.integer &&
    !Number.isInteger(
      normalizedValue
    )
  ) {
    throw new ValidationError(
      `O campo ${fieldName} deve ser um número inteiro.`
    );
  }

  if (
    options?.min !== undefined &&
    normalizedValue < options.min
  ) {
    throw new ValidationError(
      `O campo ${fieldName} deve ser maior ou igual a ${options.min}.`
    );
  }

  if (
    options?.max !== undefined &&
    normalizedValue > options.max
  ) {
    throw new ValidationError(
      `O campo ${fieldName} deve ser menor ou igual a ${options.max}.`
    );
  }

  return normalizedValue;
}

function optionalBoolean(
  value: unknown,
  fieldName: string,
  defaultValue: boolean
): boolean {
  if (
    value === undefined ||
    value === null
  ) {
    return defaultValue;
  }

  if (
    typeof value !== "boolean"
  ) {
    throw new ValidationError(
      `O campo ${fieldName} deve ser verdadeiro ou falso.`
    );
  }

  return value;
}

function optionalDate(
  value: unknown,
  fieldName: string
): Date | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  ) {
    throw new ValidationError(
      `O campo ${fieldName} deve estar no formato AAAA-MM-DD.`
    );
  }

  const [year, month, day] =
    value
      .split("-")
      .map(Number);

  const parsedDate = new Date(
    year,
    month - 1,
    day
  );

  if (
    parsedDate.getFullYear() !==
      year ||
    parsedDate.getMonth() !==
      month - 1 ||
    parsedDate.getDate() !== day
  ) {
    throw new ValidationError(
      `O campo ${fieldName} possui uma data inválida.`
    );
  }

  return parsedDate;
}

function getRepresentation(
  value: unknown
): ApprovalRepresentation {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "completo";
  }

  if (
    typeof value !== "string" ||
    !validRepresentations.has(
      value as ApprovalRepresentation
    )
  ) {
    throw new ValidationError(
      "O tipo de representação informado é inválido."
    );
  }

  return value as ApprovalRepresentation;
}

function createProjectSelectSql(
  whereClause: string
) {
  return `
    SELECT
      CONVERT(
        VARCHAR(36),
        [id]
      ) AS [id],

      CONVERT(
        VARCHAR(20),
        [sequencial]
      ) AS [sequencial],

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

      [status],

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
        [calculo_automatico]
        AS BIT
      ) AS [calculoAutomatico],

      CAST(
        [incluir_caminhao]
        AS BIT
      ) AS [incluirCaminhao],

      CONVERT(
        VARCHAR(33),
        [criado_em],
        126
      ) AS [criadoEm],

      CONVERT(
        VARCHAR(33),
        [atualizado_em],
        126
      ) AS [atualizadoEm]

    FROM
      [dbo].[eng_desenhos_aprovacao]

    ${whereClause}
  `;
}

/* =========================================================
   GET - LISTAR DESENHOS
   ========================================================= */

async function handleGET() {
  const acesso = await verificarAcessoModuloApi("desenho-aprovacao");
  if (acesso.negado) return acesso.negado;

  try {
    const pool =
      await getSqlServerPool();

    const result =
      await pool
        .request()
        .query<ApprovalProjectResponse>(`
          ${createProjectSelectSql(`
            WHERE [ativo] = 1
          `)}

          ORDER BY [sequencial] DESC;
        `);

    return NextResponse.json({
      ok: true,
      data: result.recordset,
      total:
        result.recordset.length,
    });
  } catch (error) {
    console.error(
      "Erro ao listar desenhos de aprovação:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Não foi possível listar os desenhos de aprovação.",
      },
      {
        status: 500,
      }
    );
  }
}

export const GET = comMetricasApi("desenho-aprovacao", handleGET);

/* =========================================================
   POST - CRIAR DESENHO
   ========================================================= */

async function handlePOST(
  request: Request
) {
  const acesso = await verificarAcessoModuloApi("desenho-aprovacao");
  if (acesso.negado) return acesso.negado;

  let requestBody:
    CreateApprovalProjectBody;

  try {
    const parsedBody: unknown =
      await request.json();

    if (!isObject(parsedBody)) {
      throw new ValidationError(
        "O corpo da requisição deve ser um objeto JSON."
      );
    }

    requestBody = parsedBody;
  } catch (error) {
    if (
      error instanceof
      ValidationError
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          "O corpo da requisição contém um JSON inválido.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const cliente = optionalText(
      requestBody.cliente,
      "cliente",
      200
    );

    const produto = optionalText(
      requestBody.produto,
      "produto",
      200
    );

    const modelo = optionalText(
      requestBody.modelo,
      "modelo",
      100
    );

    const caminhao = optionalText(
      requestBody.caminhao,
      "caminhao",
      150
    );

    const cabine = optionalText(
      requestBody.cabine,
      "cabine",
      100
    );

    const comprimento =
      optionalNumber(
        requestBody.comprimento,
        "comprimento",
        {
          min: 0,
        }
      );

    const altura = optionalNumber(
      requestBody.altura,
      "altura",
      {
        min: 0,
      }
    );

    const capacidadeTon =
      optionalNumber(
        requestBody.capacidadeTon,
        "capacidadeTon",
        {
          min: 0,
        }
      );

    const volumeM3 =
      optionalNumber(
        requestBody.volumeM3,
        "volumeM3",
        {
          min: 0,
        }
      );

    const compartimentos =
      optionalNumber(
        requestBody.compartimentos,
        "compartimentos",
        {
          integer: true,
          min: 0,
        }
      );

    const peso = optionalNumber(
      requestBody.peso,
      "peso",
      {
        min: 0,
      }
    );

    const cargaDianteira =
      optionalNumber(
        requestBody.cargaDianteira,
        "cargaDianteira",
        {
          min: 0,
          max: 100,
        }
      );

    const cargaTraseira =
      optionalNumber(
        requestBody.cargaTraseira,
        "cargaTraseira",
        {
          min: 0,
          max: 100,
        }
      );

    const observacoes =
      optionalText(
        requestBody.observacoes,
        "observacoes",
        100000
      );

    /*
     * O status não é lido do corpo da requisição.
     * Todo novo desenho começa obrigatoriamente em rascunho.
     */
    const status: ApprovalStatus =
      "rascunho";

    const tipoRepresentacao =
      getRepresentation(
        requestBody.tipoRepresentacao
      );

    const dataEmissao =
      optionalDate(
        requestBody.dataEmissao,
        "dataEmissao"
      );

    const previsaoAprovacao =
      optionalDate(
        requestBody.previsaoAprovacao,
        "previsaoAprovacao"
      );

    if (
      dataEmissao &&
      previsaoAprovacao &&
      previsaoAprovacao <
        dataEmissao
    ) {
      throw new ValidationError(
        "A previsão de aprovação não pode ser anterior à data de emissão."
      );
    }

    const incluirCotas =
      optionalBoolean(
        requestBody.incluirCotas,
        "incluirCotas",
        true
      );

    const calculoAutomatico =
      optionalBoolean(
        requestBody.calculoAutomatico,
        "calculoAutomatico",
        true
      );

    const incluirCaminhao =
      optionalBoolean(
        requestBody.incluirCaminhao,
        "incluirCaminhao",
        false
      );

    /*
     * Aceita somente usuários no formato nome.sobrenome.
     * Quando o valor estiver ausente ou for inválido,
     * utiliza PORTAL_AUDIT_USER.
     */
    const usuario =
      getUsuarioAtual(
        requestBody.usuario
      );

    const pool =
      await getSqlServerPool();

    const transaction =
      new sql.Transaction(pool);

    await transaction.begin();

    try {
      const databaseRequest =
        new sql.Request(transaction);

      databaseRequest.input(
        "cliente",
        sql.NVarChar(200),
        cliente
      );

      databaseRequest.input(
        "produto",
        sql.NVarChar(200),
        produto
      );

      databaseRequest.input(
        "modelo",
        sql.NVarChar(100),
        modelo
      );

      databaseRequest.input(
        "caminhao",
        sql.NVarChar(150),
        caminhao
      );

      databaseRequest.input(
        "cabine",
        sql.NVarChar(100),
        cabine
      );

      databaseRequest.input(
        "comprimento",
        sql.Decimal(12, 2),
        comprimento
      );

      databaseRequest.input(
        "altura",
        sql.Decimal(12, 2),
        altura
      );

      databaseRequest.input(
        "capacidadeTon",
        sql.Decimal(12, 2),
        capacidadeTon
      );

      databaseRequest.input(
        "volumeM3",
        sql.Decimal(12, 2),
        volumeM3
      );

      databaseRequest.input(
        "compartimentos",
        sql.Int,
        compartimentos
      );

      databaseRequest.input(
        "peso",
        sql.Decimal(12, 2),
        peso
      );

      databaseRequest.input(
        "cargaDianteira",
        sql.Decimal(5, 2),
        cargaDianteira
      );

      databaseRequest.input(
        "cargaTraseira",
        sql.Decimal(5, 2),
        cargaTraseira
      );

      databaseRequest.input(
        "observacoes",
        sql.NVarChar(sql.MAX),
        observacoes
      );

      databaseRequest.input(
        "tipoRepresentacao",
        sql.VarChar(20),
        tipoRepresentacao
      );

      databaseRequest.input(
        "dataEmissao",
        sql.Date,
        dataEmissao
      );

      databaseRequest.input(
        "previsaoAprovacao",
        sql.Date,
        previsaoAprovacao
      );

      databaseRequest.input(
        "incluirCotas",
        sql.Bit,
        incluirCotas
      );

      databaseRequest.input(
        "calculoAutomatico",
        sql.Bit,
        calculoAutomatico
      );

      databaseRequest.input(
        "incluirCaminhao",
        sql.Bit,
        incluirCaminhao
      );

      databaseRequest.input(
        "usuario",
        sql.NVarChar(150),
        usuario
      );

      const result =
        await databaseRequest
          .query<ApprovalProjectResponse>(`
            SET XACT_ABORT ON;

            DECLARE @novoDesenho TABLE
            (
              [id]
                UNIQUEIDENTIFIER NOT NULL
            );

            INSERT INTO
              [dbo].[eng_desenhos_aprovacao]
            (
              [cliente],
              [produto],
              [modelo],

              [caminhao],
              [cabine],

              [comprimento],
              [altura],

              [capacidade_ton],
              [volume_m3],

              [compartimentos],
              [peso],

              [carga_dianteira],
              [carga_traseira],

              [observacoes],

              [status],
              [tipo_representacao],

              [data_emissao],
              [previsao_aprovacao],

              [incluir_cotas],
              [calculo_automatico],
              [incluir_caminhao],

              [criado_por],
              [atualizado_por]
            )

            OUTPUT
              INSERTED.[id]
            INTO
              @novoDesenho ([id])

            VALUES
            (
              @cliente,
              @produto,
              @modelo,

              @caminhao,
              @cabine,

              @comprimento,
              @altura,

              @capacidadeTon,
              @volumeM3,

              @compartimentos,
              @peso,

              @cargaDianteira,
              @cargaTraseira,

              @observacoes,

              'rascunho',
              @tipoRepresentacao,

              @dataEmissao,
              @previsaoAprovacao,

              @incluirCotas,
              @calculoAutomatico,
              @incluirCaminhao,

              @usuario,
              @usuario
            );

            DECLARE
              @desenhoId
                UNIQUEIDENTIFIER;

            SELECT TOP (1)
              @desenhoId = [id]
            FROM
              @novoDesenho;

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
              'CRIADO',
              NULL,
              'rascunho',
              N'Desenho de aprovação criado como rascunho.',

              (
                SELECT
                  'rascunho'
                    AS [statusInicial],

                  @tipoRepresentacao
                    AS [tipoRepresentacao]

                FOR JSON PATH,
                  WITHOUT_ARRAY_WRAPPER
              ),

              @usuario
            );

            ${createProjectSelectSql(`
              WHERE
                [id] = @desenhoId
                AND [ativo] = 1
            `)};
          `);

      await transaction.commit();

      const createdProject =
        result.recordset[0];

      return NextResponse.json(
        {
          ok: true,
          message:
            "Desenho de aprovação criado como rascunho.",
          data: createdProject,

          auditoria: {
            usuario,
          },
        },
        {
          status: 201,
        }
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    if (
      error instanceof
      ValidationError
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
        },
        {
          status: 400,
        }
      );
    }

    console.error(
      "Erro ao criar desenho de aprovação:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Não foi possível criar o desenho de aprovação.",
      },
      {
        status: 500,
      }
    );
  }
}

export const POST = comMetricasApi("desenho-aprovacao", handlePOST);