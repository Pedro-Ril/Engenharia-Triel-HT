import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { excluirDefinitivamente, restaurarDaLixeira } from "@/lib/bloco-notas/bloco-notas";
import { ehUuid, idInvalido, MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Restaurar da lixeira (com as subpáginas que saíram junto). */
async function handlePOST(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!ehUuid(id)) return idInvalido();

  try {
    await restaurarDaLixeira(acesso.usuario.id, id);
    return NextResponse.json({ ok: true, message: "Página restaurada." });
  } catch (error) {
    return respostaDeErro(error, "restaurar página");
  }
}

export const POST = comMetricasApi("bloco-notas/lixeira/[id]", handlePOST);

/* Excluir de vez (a tela confirma antes). */
async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!ehUuid(id)) return idInvalido();

  try {
    await excluirDefinitivamente(acesso.usuario.id, id);
    return NextResponse.json({ ok: true, message: "Página excluída definitivamente." });
  } catch (error) {
    return respostaDeErro(error, "excluir definitivamente");
  }
}

export const DELETE = comMetricasApi("bloco-notas/lixeira/[id]", handleDELETE);
