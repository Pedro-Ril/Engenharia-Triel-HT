import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { COMANDOS_AGENTE, solicitarComandoAgente } from "@/lib/tv/terminais";
import type { ComandoAgente } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface EnviarComandoBody {
  comando?: unknown;
}

/*
 * Enfileira um comando pro agente nativo pegar no próprio poll
 * periódico (até INTERVALO_VERIFICAR_CONFIG_MS de espera — não
 * resgata um agente travado, ver solicitarComandoAgente).
 */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do terminal é inválido." },
      { status: 400 }
    );
  }

  let body: EnviarComandoBody;

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

  if (
    typeof body.comando !== "string" ||
    !COMANDOS_AGENTE.includes(body.comando as ComandoAgente)
  ) {
    return NextResponse.json(
      { ok: false, message: `O comando deve ser um de: ${COMANDOS_AGENTE.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    const encontrado = await solicitarComandoAgente(id, body.comando as ComandoAgente);

    if (!encontrado) {
      return NextResponse.json(
        { ok: false, message: "Terminal não encontrado ou não pareado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Comando enviado — será executado no próximo contato do agente (até alguns minutos).",
    });
  } catch (error) {
    console.error("Erro ao enviar comando pro agente de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível enviar o comando." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/tv/terminais/[id]/comando", handlePOST);
