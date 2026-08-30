import { NextResponse } from "next/server";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarHeartbeatSemFalhar, requireTerminalApi } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  const acesso = await requireTerminalApi(request);
  if (acesso.negado) return acesso.negado;

  await registrarHeartbeatSemFalhar(acesso.terminal.id);

  return NextResponse.json({ ok: true });
}

export const POST = comMetricasApi("tv/heartbeat", handlePOST);
