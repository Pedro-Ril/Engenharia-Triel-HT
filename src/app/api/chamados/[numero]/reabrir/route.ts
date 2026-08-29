import { NextResponse } from "next/server";

import { buscarChamadoPorNumero, reabrirChamado } from "@/lib/chamados/chamados";
import { carregarContextoAcao, lerNomeConfirmado } from "@/lib/chamados/api-helpers";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ numero: string }>;
}

async function handlePOST(request: Request, context: RouteContext) {
  const { numero } = await context.params;
  const nomeConfirmado = await lerNomeConfirmado(request);

  const { contexto, erro } = await carregarContextoAcao(numero, nomeConfirmado);
  if (erro) return erro;

  const { chamado, usuario } = contexto;

  const autorNome = usuario?.nomeExibicao ?? chamado.solicitanteNome;

  try {
    const sucesso = await reabrirChamado(chamado.id, autorNome);

    if (!sucesso) {
      return NextResponse.json(
        { ok: false, message: "Este chamado não pode ser reaberto no estado atual." },
        { status: 409 }
      );
    }

    const atualizado = await buscarChamadoPorNumero(chamado.numero);
    return NextResponse.json({ ok: true, message: "Chamado reaberto.", data: atualizado });
  } catch (error) {
    console.error("Erro ao reabrir chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível reabrir o chamado." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("chamados/[numero]/reabrir", handlePOST);
