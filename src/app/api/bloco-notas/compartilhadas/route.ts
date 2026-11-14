import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarCompartilhadasComigo } from "@/lib/bloco-notas/compartilhamento";
import { MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Páginas que outras pessoas abriram para mim (com as subpáginas). */
async function handleGET() {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarCompartilhadasComigo(acesso.usuario.id) });
  } catch (error) {
    return respostaDeErro(error, "compartilhadas comigo");
  }
}

export const GET = comMetricasApi("bloco-notas/compartilhadas", handleGET);
