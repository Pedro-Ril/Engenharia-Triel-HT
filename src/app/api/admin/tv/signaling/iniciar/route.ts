import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { iniciarSignalingSeNecessario } from "@/lib/tv/signaling-processo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Início manual — normalmente desnecessário, já que
 * src/instrumentation.ts sobe o processo sozinho junto com o `next
 * start`, mas serve pra recuperar sem precisar reiniciar o portal
 * inteiro caso o processo do servidor de sinalização tenha caído.
 */
async function handlePOST() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const online = await iniciarSignalingSeNecessario();

  return NextResponse.json({
    ok: true,
    message: online
      ? "Servidor de sinalização está online."
      : "Não foi possível confirmar que o servidor de sinalização subiu — veja os logs do servidor.",
    data: { online },
  });
}

export const POST = comMetricasApi("admin/tv/signaling/iniciar", handlePOST);
