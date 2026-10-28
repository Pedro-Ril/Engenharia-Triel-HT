import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalInteger, optionalText, requiredText } from "@/lib/auth/validation";
import { registrarValidacaoRevisao } from "@/lib/cadastro-roteiro/validacoes-revisao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Registra o "Roteiro continua válido" depois que a tela atualizou a
 * revisão das operações no ERP. Quem pode usar a tela pode validar --
 * mesmo acesso de gravar roteiro.
 */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("cadastro-roteiro");
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");

    const operacoes = optionalInteger(body.operacoes, "operações", 0);
    if (operacoes < 0) throw new ValidationError("Quantidade de operações inválida.");

    await registrarValidacaoRevisao(
      {
        codItem: requiredText(body.codItem, "item", 50),
        revisaoAnterior: requiredText(body.revisaoAnterior, "revisão anterior", 100),
        revisaoNova: requiredText(body.revisaoNova, "revisão nova", 20),
        comentarioRevisao: optionalText(body.comentarioRevisao, "comentário da revisão", 2000),
        operacoes,
      },
      acesso.usuario
    );

    return NextResponse.json({ ok: true, message: "Validação registrada." }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao registrar a validação do roteiro:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível registrar a validação." }, { status: 500 });
  }
}

export const POST = comMetricasApi("cadastro-roteiro/validacoes-revisao", handlePOST);
