import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalBoolean, optionalInteger, optionalText } from "@/lib/auth/validation";
import { registrarChamadaExternaSemFalhar } from "@/lib/monitoramento/chamadas-externas";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReportarEmailBody {
  sucesso?: unknown;
  duracaoMs?: unknown;
  mensagemErro?: unknown;
}

/*
 * Envio de e-mail (Liberação de Projeto) bate direto do navegador
 * numa API externa (sem rota do portal no meio) — esta rota só existe
 * pra receber o resultado real de cada tentativa e alimentar a aba
 * Administração → Monitoramento → APIs. Não há checagem ativa
 * equivalente pro e-mail: um "ping" periódico enviaria e-mail de
 * verdade, e não existe modo de teste na API externa.
 */
async function handlePOST(request: Request) {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return NextResponse.json(
      { ok: false, message: "É necessário estar autenticado." },
      { status: 401 }
    );
  }

  let body: ReportarEmailBody;

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
    const sucesso = optionalBoolean(body.sucesso, "sucesso", true);
    const duracaoMs = optionalInteger(body.duracaoMs, "duracaoMs", 0);
    const mensagemErro = optionalText(body.mensagemErro, "mensagemErro", 500);

    await registrarChamadaExternaSemFalhar({
      servico: "email",
      origem: "uso_real",
      sucesso,
      duracaoMs,
      mensagemErro,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao registrar métrica de envio de e-mail:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível registrar a métrica." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("monitoramento/apis/email", handlePOST);
