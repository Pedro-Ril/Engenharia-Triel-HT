import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { esvaziarLixeira, listarLixeira } from "@/lib/bloco-notas/bloco-notas";
import { MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarLixeira(acesso.usuario.id) });
  } catch (error) {
    return respostaDeErro(error, "listar lixeira");
  }
}

export const GET = comMetricasApi("bloco-notas/lixeira", handleGET);

/* Esvaziar a lixeira (a tela confirma antes). */
async function handleDELETE() {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  try {
    await esvaziarLixeira(acesso.usuario.id);
    return NextResponse.json({ ok: true, message: "Lixeira esvaziada." });
  } catch (error) {
    return respostaDeErro(error, "esvaziar lixeira");
  }
}

export const DELETE = comMetricasApi("bloco-notas/lixeira", handleDELETE);
