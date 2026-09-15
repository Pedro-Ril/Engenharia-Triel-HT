import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { iniciarMediaMtxSeNecessario } from "@/lib/semaforo/mediamtx-processo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Início manual — normalmente desnecessário, já que
 * src/instrumentation.ts sobe o processo sozinho junto com o `next
 * start`, mas serve pra recuperar sem precisar reiniciar o portal
 * inteiro caso o processo do MediaMTX tenha caído.
 */
async function handlePOST() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const online = await iniciarMediaMtxSeNecessario();

  return NextResponse.json({
    ok: true,
    message: online
      ? "MediaMTX está online."
      : "Não foi possível confirmar que o MediaMTX subiu — veja os logs do servidor.",
    data: { online },
  });
}

export const POST = comMetricasApi("admin/semaforo/mediamtx/iniciar", handlePOST);
