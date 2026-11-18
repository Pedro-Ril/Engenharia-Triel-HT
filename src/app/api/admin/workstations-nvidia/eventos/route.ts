import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { listarEventos } from "@/lib/workstations-nvidia/eventos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleGET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const maquinaId = url.searchParams.get("maquinaId") || null;
  const pagina = Number(url.searchParams.get("pagina") ?? "1");

  if (maquinaId && !uniqueIdentifierPattern.test(maquinaId)) {
    return NextResponse.json(
      { ok: false, message: "O identificador da máquina é inválido." },
      { status: 400 }
    );
  }

  try {
    const resultado = await listarEventos({
      maquinaId,
      pagina: Number.isInteger(pagina) && pagina > 0 ? pagina : 1,
    });
    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    console.error("Erro ao listar o histórico de Workstations NVIDIA:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o histórico." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("admin/workstations-nvidia/eventos", handleGET);
