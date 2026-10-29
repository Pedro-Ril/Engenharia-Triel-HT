import { after, NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { executarSimulacao, iniciarSimulacao, listarRodadas } from "@/lib/3dexperience/liberacao-desenhos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Últimas rodadas (simulações e liberações) -- o registro do período de teste. */
async function handleGET() {
  const acesso = await verificarAcessoModuloApi("3dexperience");
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarRodadas() });
  } catch (error) {
    console.error("Erro ao listar as rodadas de liberação de desenhos:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível listar as rodadas." }, { status: 500 });
  }
}

export const GET = comMetricasApi("3dexperience/liberacao", handleGET);

/*
 * Começa a SIMULAÇÃO de um item pai. Devolve o id na hora; a explosão,
 * a busca dos desenhos e o job no 3DX rodam depois da resposta -- a tela
 * acompanha por GET /api/3dexperience/liberacao/{id}.
 */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("3dexperience");
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    const codigo = requiredText(body.codigo, "código do item pai", 50).trim();
    if (!/^[0-9A-Za-z._-]+$/.test(codigo)) throw new ValidationError("Código do item inválido.");

    const id = await iniciarSimulacao(codigo, acesso.usuario);
    after(() => executarSimulacao(id, codigo));

    return NextResponse.json({ ok: true, data: { id } }, { status: 202 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao iniciar a simulação de liberação de desenhos:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível iniciar a simulação." }, { status: 500 });
  }
}

export const POST = comMetricasApi("3dexperience/liberacao", handlePOST);
