import { NextRequest, NextResponse } from "next/server";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { limparCodigoPdf, localizarPdfsDoItem } from "@/lib/pdf/roteiro-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Checagem leve (só lista a pasta de rede, sem juntar as folhas
 * num PDF único) — usada pra decidir se o botão "Ver desenho"
 * fica habilitado antes do operador clicar, já que nem todo item
 * tem 2D e 3D ao mesmo tempo.
 */
async function handleGET(
  req: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const { codigo: codigoParam } = await context.params;
    const codigo = limparCodigoPdf(codigoParam);

    if (!codigo) {
      return NextResponse.json(
        { ok: false, message: "Código do item inválido." },
        { status: 400 }
      );
    }

    const arquivosPdf = await localizarPdfsDoItem(codigo);

    return NextResponse.json({ ok: true, data: { disponivel: arquivosPdf.length > 0 } });
  } catch (error) {
    console.error("[Terminal Fábrica][PDF] Erro ao verificar disponibilidade:", error);

    return NextResponse.json(
      { ok: false, message: "Erro ao verificar disponibilidade do desenho." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("terminal-fabrica/item-pdf/[codigo]/existe", handleGET);
