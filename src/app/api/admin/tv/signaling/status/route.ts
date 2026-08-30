import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { signalingEstaOnline } from "@/lib/tv/signaling-processo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const online = await signalingEstaOnline();
  return NextResponse.json({ ok: true, data: { online } });
}

export const GET = comMetricasApi("admin/tv/signaling/status", handleGET);
