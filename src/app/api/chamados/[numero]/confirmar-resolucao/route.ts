import { NextResponse } from "next/server";

import { buscarChamadoPorNumero, confirmarResolucao } from "@/lib/chamados/chamados";
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
    const sucesso = await confirmarResolucao(chamado.id, autorNome);

    if (!sucesso) {
      return NextResponse.json(
        {
          ok: false,
          message: "Este chamado não está aguardando confirmação de resolução.",
        },
        { status: 409 }
      );
    }

    const atualizado = await buscarChamadoPorNumero(chamado.numero);
    return NextResponse.json({
      ok: true,
      message: "Resolução confirmada.",
      data: atualizado,
    });
  } catch (error) {
    console.error("Erro ao confirmar resolução do chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível confirmar a resolução." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("chamados/[numero]/confirmar-resolucao", handlePOST);
