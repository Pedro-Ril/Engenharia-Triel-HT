import { NextResponse } from "next/server";

import { buscarSlotVigente } from "@/lib/tv/grades";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { aplicarVisualizacaoNaUrl } from "@/lib/terminal-fabrica/visualizacao-3d";
import { buscarVisualizacaoDoAparelho } from "@/lib/terminal-fabrica/visualizacao";
import { requireTerminalApi } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  const acesso = await requireTerminalApi(request);
  if (acesso.negado) return acesso.negado;

  if (!acesso.terminal.gradeId) {
    return NextResponse.json({ ok: true, data: null });
  }

  try {
    const slotBruto = await buscarSlotVigente(acesso.terminal.gradeId);

    /* A página do Terminal de Fábrica recebe em qual app o 3D abre neste aparelho. */
    const visualizacao = slotBruto?.itens.some((item) => item.urlPaginaWeb?.includes("/terminal-fabrica"))
      ? await buscarVisualizacaoDoAparelho(acesso.terminal.id)
      : null;
    const slot =
      slotBruto && visualizacao
        ? {
            ...slotBruto,
            itens: slotBruto.itens.map((item) =>
              item.urlPaginaWeb ? { ...item, urlPaginaWeb: aplicarVisualizacaoNaUrl(item.urlPaginaWeb, visualizacao) } : item
            ),
          }
        : slotBruto;

    return NextResponse.json({
      ok: true,
      data: {
        slot,
        intervaloAtualizacaoSegundos: acesso.terminal.intervaloAtualizacaoSegundos,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar grade atual de terminal de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar a programação." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv/grade-atual", handleGET);
