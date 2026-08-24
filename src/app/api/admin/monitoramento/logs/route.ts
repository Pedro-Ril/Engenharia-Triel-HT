import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import type { NivelLog } from "@/lib/monitoramento/logs";
import { listarLogs, listarOrigensDeLogs } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NIVEIS_VALIDOS: NivelLog[] = ["info", "aviso", "erro"];

export async function GET(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const nivelParam = url.searchParams.get("nivel");
  const nivel = NIVEIS_VALIDOS.includes(nivelParam as NivelLog)
    ? (nivelParam as NivelLog)
    : undefined;

  const origem = url.searchParams.get("origem") || undefined;
  const busca = url.searchParams.get("busca") || undefined;
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(url.searchParams.get("porPagina")) || 25));

  try {
    const [{ itens, total }, origens] = await Promise.all([
      listarLogs({ nivel, origem, busca, pagina, porPagina }),
      listarOrigensDeLogs(),
    ]);

    return NextResponse.json({ ok: true, data: { itens, total, origens } });
  } catch (error) {
    console.error("Erro ao listar logs:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar os logs." },
      { status: 500 }
    );
  }
}
