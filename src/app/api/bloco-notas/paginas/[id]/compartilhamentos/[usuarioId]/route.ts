import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarCompartilhamentos, removerCompartilhamento } from "@/lib/bloco-notas/compartilhamento";
import { ehUuid, idInvalido, MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; usuarioId: string }>;
}

/* Tira o acesso de uma pessoa (a tela confirma antes). */
async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id, usuarioId } = await context.params;
  if (!ehUuid(id) || !ehUuid(usuarioId)) return idInvalido();

  try {
    await removerCompartilhamento(acesso.usuario.id, id, usuarioId);
    return NextResponse.json({ ok: true, data: await listarCompartilhamentos(acesso.usuario.id, id) });
  } catch (error) {
    return respostaDeErro(error, "remover compartilhamento");
  }
}

export const DELETE = comMetricasApi("bloco-notas/paginas/[id]/compartilhamentos/[usuarioId]", handleDELETE);
