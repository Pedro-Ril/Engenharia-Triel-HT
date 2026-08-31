import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { atualizarTerminal } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface AtualizarTerminalBodyRestrito {
  gradeId?: unknown;
}

/*
 * Versão restrita de PATCH /api/admin/tv/terminais/[id] — só aceita
 * trocar a grade atribuída (o único ajuste liberado pra quem não é
 * admin, ver DispositivosRestritoPainel.tsx); nome, intervalo, página
 * inicial e empresa continuam exclusivos do painel administrativo.
 * atualizarTerminal recebe o codigoEmpresa do usuário como 3º
 * argumento, então um terminal de outra empresa nem aparece — o WHERE
 * já filtra, devolvendo null como se o terminal não existisse.
 */
async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do terminal é inválido." },
      { status: 400 }
    );
  }

  if (!acesso.usuario.ehAdministrador && !acesso.usuario.codigoEmpresa) {
    return NextResponse.json(
      { ok: false, message: "Seu usuário não está vinculado a uma empresa." },
      { status: 403 }
    );
  }

  let body: AtualizarTerminalBodyRestrito;

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
    const gradeId = body.gradeId === null ? null : (optionalText(body.gradeId, "gradeId", 36) ?? undefined);

    const codigoEmpresaExigida = acesso.usuario.ehAdministrador
      ? undefined
      : (acesso.usuario.codigoEmpresa ?? undefined);

    const terminal = await atualizarTerminal(id, { gradeId }, codigoEmpresaExigida);

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

    console.error("Erro ao atualizar terminal de TV (restrito):", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o terminal." },
      { status: 500 }
    );
  }
}

export const PATCH = comMetricasApi("tv-corporativa/terminais/[id]", handlePATCH);
