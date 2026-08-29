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

  ativo: boolean;

  criadoEm: string;
  criadoPor: string | null;

  atualizadoEm: string;
  atualizadoPor: string | null;
}

interface CurrentApprovalProject {
  id: string;

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
}

interface UpdateApprovalProjectBody {
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

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface CurrentDeletionProject {
  id: string;
  numero: string;
  status: ApprovalStatus;
}

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validRepresentations =
  new Set<ApprovalRepresentation>([
    "lateral",
    "superior",
    "completo",
  ]);

const editableStatuses =
  new Set<ApprovalStatus>([
    "rascunho",
    "pendente",
  ]);

const deletableStatuses =
  new Set<ApprovalStatus>([
    "rascunho",
    "pendente",
  ]);

const updatableFields = [
  "cliente",
  "produto",
  "modelo",

  "caminhao",
  "cabine",

  "comprimento",
  "altura",

  "capacidadeTon",
  "volumeM3",

  "compartimentos",
  "peso",

  "cargaDianteira",
  "cargaTraseira",

  "observacoes",

  "tipoRepresentacao",

  "dataEmissao",
  "previsaoAprovacao",

  "incluirCotas",
  "calculoAutomatico",
  "incluirCaminhao",
] as const;

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

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.length > maxLength) {
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

  if (!Number.isFinite(normalizedValue)) {
    throw new ValidationError(
      `O campo ${fieldName} deve ser um número válido.`
    );
  }

  if (
    options?.integer &&
    !Number.isInteger(normalizedValue)
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

function requiredBoolean(
  value: unknown,
  fieldName: string
): boolean {
  if (typeof value !== "boolean") {
    throw new ValidationError(
      `O campo ${fieldName} deve ser verdadeiro ou falso.`
    );
  }

  return value;
}

function optionalDateString(
  value: unknown,
  fieldName: string
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new ValidationError(
      `O campo ${fieldName} deve estar no formato AAAA-MM-DD.`
    );
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  const parsedDate = new Date(
    year,
    month - 1,
    day
  );

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    throw new ValidationError(
      `O campo ${fieldName} possui uma data inválida.`
    );
  }

  return value;
}

function toSqlDate(
  value: string | null
): Date | null {
  if (!value) {
    return null;
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day
  );
}

function getRepresentation(
  value: unknown
): ApprovalRepresentation {
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

function getProjectSelectSql(
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

      CAST(
        [ativo]
        AS BIT
      ) AS [ativo],

      CONVERT(
        VARCHAR(33),
        [criado_em],
        126
      ) AS [criadoEm],

      [criado_por]
        AS [criadoPor],

      CONVERT(
        VARCHAR(33),
        [atualizado_em],
        126
      ) AS [atualizadoEm],

      [atualizado_por]
        AS [atualizadoPor]

    FROM
      [dbo].[eng_desenhos_aprovacao]

    ${whereClause}
  `;
}

/* =========================================================
   GET - BUSCAR DESENHO POR ID
   ========================================================= */

async function handleGET(
  _request: Request,
  context: RouteContext
) {
  const acesso = await verificarAcessoModuloApi("desenho-aprovacao");
  if (acesso.negado) return acesso.negado;

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
        }
      );
    }

    const pool =
      await getSqlServerPool();

    const result =
      await pool
        .request()
        .input(
          "id",
          sql.VarChar(36),
          id
        )
        .query<ApprovalProjectResponse>(`
          ${getProjectSelectSql(`
            WHERE
              [id] = @id
              AND [ativo] = 1
          `)};
        `);

    const desenho =
      result.recordset[0];

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

    return NextResponse.json({
      ok: true,
      data: desenho,
    });
  } catch (error) {
    console.error(
      "Erro ao buscar desenho de aprovação:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Não foi possível buscar o desenho de aprovação.",
      },
      {
        status: 500,
      }
    );
  }
}

export const GET = comMetricasApi("desenho-aprovacao/[id]", handleGET);

/* =========================================================
   PATCH - ATUALIZAR DADOS DO DESENHO
   ========================================================= */

async function handlePATCH(
  request: Request,
  context: RouteContext
) {
  const acesso = await verificarAcessoModuloApi("desenho-aprovacao");
  if (acesso.negado) return acesso.negado;

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
        }
      );
    }

    let parsedBody: unknown;

    try {
      parsedBody =
        await request.json();
    } catch {
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

    if (!isObject(parsedBody)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "O corpo da requisição deve ser um objeto JSON.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        parsedBody,
        "status"
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "O status não pode ser alterado diretamente. Utilize uma ação do fluxo de aprovação.",
        },
        {
          status: 400,
        }
      );
    }

    const body: UpdateApprovalProjectBody =
      parsedBody;

    const possuiCampoParaAtualizar =
      updatableFields.some(
        (field) =>
          body[field] !== undefined
      );

    if (!possuiCampoParaAtualizar) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Nenhum campo foi informado para atualização.",
        },
        {
          status: 400,
        }
      );
    }

    const pool =
      await getSqlServerPool();

    const transaction =
      new sql.Transaction(pool);

    await transaction.begin();

    try {
      const currentResult =
        await new sql.Request(transaction)
          .input(
            "id",
            sql.VarChar(36),
            id
          )
          .query<CurrentApprovalProject>(`
            SELECT
              CONVERT(
                VARCHAR(36),
                [id]
              ) AS [id],

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
              ) AS [incluirCaminhao]

            FROM
              [dbo].[eng_desenhos_aprovacao]
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

            WHERE
              [id] = @id
              AND [ativo] = 1;
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
        !editableStatuses.has(
          current.status
        )
      ) {
        await transaction.rollback();

        return NextResponse.json(
          {
            ok: false,
            message:
              `O desenho está com o status "${current.status}" e seus dados não podem ser alterados.`,
          },
          {
            status: 409,
          }
        );
      }

      const cliente =
        body.cliente === undefined
          ? current.cliente
          : optionalText(
              body.cliente,
              "cliente",
              200
            );

      const produto =
        body.produto === undefined
          ? current.produto
          : optionalText(
              body.produto,
              "produto",
              200
            );

      const modelo =
        body.modelo === undefined
          ? current.modelo
          : optionalText(
              body.modelo,
              "modelo",
              100
            );

      const caminhao =
        body.caminhao === undefined
          ? current.caminhao
          : optionalText(
              body.caminhao,
              "caminhao",
              150
            );

      const cabine =
        body.cabine === undefined
          ? current.cabine
          : optionalText(
              body.cabine,
              "cabine",
              100
            );

      const comprimento =
        body.comprimento === undefined
          ? current.comprimento
          : optionalNumber(
              body.comprimento,
              "comprimento",
              {
                min: 0,
              }
            );

      const altura =
        body.altura === undefined
          ? current.altura
          : optionalNumber(
              body.altura,
              "altura",
              {
                min: 0,
              }
            );

      const capacidadeTon =
        body.capacidadeTon === undefined
          ? current.capacidadeTon
          : optionalNumber(
              body.capacidadeTon,
              "capacidadeTon",
              {
                min: 0,
              }
            );

      const volumeM3 =
        body.volumeM3 === undefined
          ? current.volumeM3
          : optionalNumber(
              body.volumeM3,
              "volumeM3",
              {
                min: 0,
              }
            );

      const compartimentos =
        body.compartimentos === undefined
          ? current.compartimentos
          : optionalNumber(
              body.compartimentos,
              "compartimentos",
              {
                integer: true,
                min: 0,
              }
            );

      const peso =
        body.peso === undefined
          ? current.peso
          : optionalNumber(
              body.peso,
              "peso",
              {
                min: 0,
              }
            );

      const cargaDianteira =
        body.cargaDianteira === undefined
          ? current.cargaDianteira
          : optionalNumber(
              body.cargaDianteira,
              "cargaDianteira",
              {
                min: 0,
                max: 100,
              }
            );

      const cargaTraseira =
        body.cargaTraseira === undefined
          ? current.cargaTraseira
          : optionalNumber(
              body.cargaTraseira,
              "cargaTraseira",
              {
                min: 0,
                max: 100,
              }
            );

      const observacoes =
        body.observacoes === undefined
          ? current.observacoes
          : optionalText(
              body.observacoes,
              "observacoes",
              100000
            );

      const tipoRepresentacao =
        body.tipoRepresentacao === undefined
          ? current.tipoRepresentacao
          : getRepresentation(
              body.tipoRepresentacao
            );

      const dataEmissao =
        body.dataEmissao === undefined
          ? current.dataEmissao
          : optionalDateString(
              body.dataEmissao,
              "dataEmissao"
            );

      const previsaoAprovacao =
        body.previsaoAprovacao === undefined
          ? current.previsaoAprovacao
          : optionalDateString(
              body.previsaoAprovacao,
              "previsaoAprovacao"
            );

      if (
        dataEmissao &&
        previsaoAprovacao &&
        previsaoAprovacao < dataEmissao
      ) {
        throw new ValidationError(
          "A previsão de aprovação não pode ser anterior à data de emissão."
        );
      }

      const incluirCotas =
        body.incluirCotas === undefined
          ? current.incluirCotas
          : requiredBoolean(
              body.incluirCotas,
              "incluirCotas"
            );

      const calculoAutomatico =
        body.calculoAutomatico === undefined
          ? current.calculoAutomatico
          : requiredBoolean(
              body.calculoAutomatico,
              "calculoAutomatico"
            );

      const incluirCaminhao =
        body.incluirCaminhao === undefined
          ? current.incluirCaminhao
          : requiredBoolean(
              body.incluirCaminhao,
              "incluirCaminhao"
            );

      /*
       * Aceita somente usuários no formato nome.sobrenome.
       * Quando o valor estiver ausente ou for inválido,
       * utiliza PORTAL_AUDIT_USER.
       */
      const usuario =
        getUsuarioAtual(
          body.usuario
        );

      const dadosHistorico =
        JSON.stringify({
          cliente,
          produto,
          modelo,

          caminhao,
          cabine,

          comprimento,
          altura,

          capacidadeTon,
          volumeM3,

          compartimentos,
          peso,

          cargaDianteira,
          cargaTraseira,

          observacoes,

          statusAtual:
            current.status,

          tipoRepresentacao,

          dataEmissao,
          previsaoAprovacao,

          incluirCotas,
          calculoAutomatico,
          incluirCaminhao,
        });

      const databaseRequest =
        new sql.Request(transaction);

      databaseRequest.input(
        "id",
        sql.VarChar(36),
        id
      );

      databaseRequest.input(
        "statusAtual",
        sql.VarChar(30),
        current.status
      );

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
        toSqlDate(dataEmissao)
      );

      databaseRequest.input(
        "previsaoAprovacao",
        sql.Date,
        toSqlDate(
          previsaoAprovacao
        )
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
        "dadosJson",
        sql.NVarChar(sql.MAX),
        dadosHistorico
      );

      databaseRequest.input(
        "usuario",
        sql.NVarChar(150),
        usuario
      );

      await databaseRequest.query(`
        SET XACT_ABORT ON;

        UPDATE
          [dbo].[eng_desenhos_aprovacao]

        SET
          [cliente] = @cliente,
          [produto] = @produto,
          [modelo] = @modelo,

          [caminhao] = @caminhao,
          [cabine] = @cabine,

          [comprimento] = @comprimento,
          [altura] = @altura,

          [capacidade_ton] =
            @capacidadeTon,

          [volume_m3] =
            @volumeM3,

          [compartimentos] =
            @compartimentos,

          [peso] = @peso,

          [carga_dianteira] =
            @cargaDianteira,

          [carga_traseira] =
            @cargaTraseira,

          [observacoes] =
            @observacoes,

          [tipo_representacao] =
            @tipoRepresentacao,

          [data_emissao] =
            @dataEmissao,

          [previsao_aprovacao] =
            @previsaoAprovacao,

          [incluir_cotas] =
            @incluirCotas,

          [calculo_automatico] =
            @calculoAutomatico,

          [incluir_caminhao] =
            @incluirCaminhao,

          [atualizado_em] =
            SYSDATETIME(),

          [atualizado_por] =
            @usuario

        WHERE
          [id] = @id
          AND [ativo] = 1
          AND [status] = @statusAtual;

        IF @@ROWCOUNT = 0
        BEGIN
          THROW 50001,
            'O desenho foi alterado durante a atualização.',
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
          @id,
          'ATUALIZADO',
          NULL,
          NULL,
          N'Dados do desenho atualizados.',
          @dadosJson,
          @usuario
        );
      `);

      const updatedResult =
        await new sql.Request(transaction)
          .input(
            "id",
            sql.VarChar(36),
            id
          )
          .query<ApprovalProjectResponse>(`
            ${getProjectSelectSql(`
              WHERE
                [id] = @id
                AND [ativo] = 1
            `)};
          `);

      await transaction.commit();

      return NextResponse.json({
        ok: true,
        message:
          "Desenho atualizado com sucesso.",
        data:
          updatedResult.recordset[0],

        auditoria: {
          usuario,
        },
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    if (
      error instanceof ValidationError
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
      "Erro ao atualizar desenho de aprovação:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Não foi possível atualizar o desenho de aprovação.",
      },
      {
        status: 500,
      }
    );
  }
}

export const PATCH = comMetricasApi("desenho-aprovacao/[id]", handlePATCH);

/* =========================================================
   DELETE - EXCLUSÃO LÓGICA
   ========================================================= */

async function handleDELETE(
  request: Request,
  context: RouteContext
) {
  const acesso = await verificarAcessoModuloApi("desenho-aprovacao");
  if (acesso.negado) return acesso.negado;

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
        }
      );
    }

    let usuarioInformado: unknown;

    try {
      const body: unknown =
        await request.json();

      if (isObject(body)) {
        usuarioInformado =
          body.usuario;
      }
    } catch {
      /*
       * O corpo é opcional no DELETE.
       */
    }

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

    await transaction.begin();

    try {
      const currentResult =
        await new sql.Request(transaction)
          .input(
            "id",
            sql.VarChar(36),
            id
          )
          .query<CurrentDeletionProject>(`
            SELECT
              CONVERT(
                VARCHAR(36),
                [id]
              ) AS [id],

              [numero],
              [status]

            FROM
              [dbo].[eng_desenhos_aprovacao]
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

            WHERE
              [id] = @id
              AND [ativo] = 1;
          `);

      const current =
        currentResult.recordset[0];

      if (!current) {
        await transaction.rollback();

        return NextResponse.json(
          {
            ok: false,
            message:
              "Desenho de aprovação não encontrado ou já excluído.",
          },
          {
            status: 404,
          }
        );
      }

      if (
        !deletableStatuses.has(
          current.status
        )
      ) {
        await transaction.rollback();

        return NextResponse.json(
          {
            ok: false,
            message:
              `O desenho ${current.numero} está com o status "${current.status}" e não pode ser excluído.`,
          },
          {
            status: 409,
          }
        );
      }

      const databaseRequest =
        new sql.Request(transaction);

      databaseRequest.input(
        "id",
        sql.VarChar(36),
        id
      );

      databaseRequest.input(
        "statusAtual",
        sql.VarChar(30),
        current.status
      );

      databaseRequest.input(
        "usuario",
        sql.NVarChar(150),
        usuario
      );

      const result =
        await databaseRequest.query<{
          id: string;
          numero: string;
        }>(`
          SET XACT_ABORT ON;

          DECLARE @desenhoExcluido TABLE
          (
            [id]
              UNIQUEIDENTIFIER NOT NULL,

            [numero]
              VARCHAR(30) NOT NULL
          );

          UPDATE
            [dbo].[eng_desenhos_aprovacao]

          SET
            [ativo] = 0,

            [excluido_em] =
              SYSDATETIME(),

            [excluido_por] =
              @usuario,

            [atualizado_em] =
              SYSDATETIME(),

            [atualizado_por] =
              @usuario

          OUTPUT
            INSERTED.[id],
            INSERTED.[numero]

          INTO
            @desenhoExcluido
            (
              [id],
              [numero]
            )

          WHERE
            [id] = @id
            AND [ativo] = 1
            AND [status] = @statusAtual;

          IF EXISTS
          (
            SELECT 1
            FROM @desenhoExcluido
          )
          BEGIN
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
              @id,
              'EXCLUIDO',
              @statusAtual,
              NULL,
              N'Desenho de aprovação excluído logicamente.',

              (
                SELECT
                  @statusAtual
                    AS [statusNoMomentoDaExclusao]

                FOR JSON PATH,
                  WITHOUT_ARRAY_WRAPPER
              ),

              @usuario
            );
          END;

          SELECT
            CONVERT(
              VARCHAR(36),
              [id]
            ) AS [id],

            [numero]

          FROM
            @desenhoExcluido;
        `);

      const desenhoExcluido =
        result.recordset[0];

      if (!desenhoExcluido) {
        await transaction.rollback();

        return NextResponse.json(
          {
            ok: false,
            message:
              "O desenho foi alterado durante a exclusão. Atualize a página e tente novamente.",
          },
          {
            status: 409,
          }
        );
      }

      await transaction.commit();

      return NextResponse.json({
        ok: true,
        message:
          "Desenho de aprovação excluído com sucesso.",
        data: desenhoExcluido,

        auditoria: {
          usuario,
        },
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error(
      "Erro ao excluir desenho de aprovação:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Não foi possível excluir o desenho de aprovação.",
      },
      {
        status: 500,
      }
    );
  }
}

export const DELETE = comMetricasApi("desenho-aprovacao/[id]", handleDELETE);