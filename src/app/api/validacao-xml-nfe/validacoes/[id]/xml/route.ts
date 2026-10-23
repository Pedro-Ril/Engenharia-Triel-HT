import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarXmlDaValidacao } from "@/lib/validacao-xml-nfe/validacoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Download do XML guardado com a validação. */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("validacao-xml-nfe");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Identificador inválido." }, { status: 400 });
  }

  try {
    const registro = await buscarXmlDaValidacao(id);

    if (!registro) {
      return NextResponse.json({ ok: false, message: "Validação não encontrada." }, { status: 404 });
    }

    const nome = /\.xml$/i.test(registro.arquivo) ? registro.arquivo : `${registro.arquivo}.xml`;

    return new NextResponse(registro.xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(nome)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao baixar XML da validação:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível baixar o XML." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("validacao-xml-nfe/validacoes/[id]/xml", handleGET);
