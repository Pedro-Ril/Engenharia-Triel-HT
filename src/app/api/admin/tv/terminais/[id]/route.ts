import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, optionalText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { atualizarTerminal, excluirTerminal } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface AtualizarTerminalBody {
  nome?: unknown;
  intervaloAtualizacaoSegundos?: unknown;
  gradeId?: unknown;
  caminhoInicial?: unknown;
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do terminal é inválido." },
      { status: 400 }
    );
  }

  let body: AtualizarTerminalBody;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }
    body = parsedBody;
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, message: "O corpo da requisição contém um JSON inválido." },
      { status: 400 }
    );
  }

  try {
    const nome = optionalText(body.nome, "nome", 150) ?? undefined;
    const intervaloAtualizacaoSegundos =
      body.intervaloAtualizacaoSegundos !== undefined
        ? optionalInteger(body.intervaloAtualizacaoSegundos, "intervaloAtualizacaoSegundos", 30)
        : undefined;
    const gradeId =
      body.gradeId === null
        ? null
        : (optionalText(body.gradeId, "gradeId", 36) ?? undefined);

    if (intervaloAtualizacaoSegundos !== undefined && intervaloAtualizacaoSegundos < 5) {
      throw new ValidationError("O intervalo de atualização deve ser de pelo menos 5 segundos.");
    }

    const params: Parameters<typeof atualizarTerminal>[1] = {
      nome,
      intervaloAtualizacaoSegundos,
      gradeId,
    };

    /*
     * Só inclui a chave quando o cliente de fato mandou o campo — um
     * objeto literal com `caminhoInicial: undefined` ainda conta como
     * "chave presente" pro hasOwnProperty que atualizarTerminal usa
     * pra distinguir "não mexer" de "limpar de volta pro padrão /tv".
     */
    if (Object.prototype.hasOwnProperty.call(body, "caminhoInicial")) {
      params.caminhoInicial = optionalText(body.caminhoInicial, "caminhoInicial", 200);
    }

    const terminal = await atualizarTerminal(id, params);

    if (!terminal) {
      return NextResponse.json(
        { ok: false, message: "Terminal não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Terminal atualizado.", data: terminal });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar terminal de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o terminal." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("admin/tv/terminais/[id]", handlePATCH);

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do terminal é inválido." },
      { status: 400 }
    );
  }

  try {
    const removido = await excluirTerminal(id);

    if (!removido) {
      return NextResponse.json(
        { ok: false, message: "Terminal não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, message: "Terminal excluído." });
  } catch (error) {
    console.error("Erro ao excluir terminal de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir o terminal." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/tv/terminais/[id]", handleDELETE);
