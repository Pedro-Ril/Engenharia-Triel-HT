import { NextResponse } from "next/server";

import { buscarChamadoPorNumero, marcarComoResolvidoPendente } from "@/lib/chamados/chamados";
import { carregarContextoAcao, lerNomeConfirmado } from "@/lib/chamados/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ numero: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { numero } = await context.params;
  const nomeConfirmado = await lerNomeConfirmado(request);

  const { contexto, erro } = await carregarContextoAcao(numero, nomeConfirmado);
  if (erro) return erro;

  const { chamado, usuario, ehAtendente } = contexto;

  if (!ehAtendente || !usuario) {
    return NextResponse.json(
      { ok: false, message: "Apenas atendentes deste setor podem marcar o chamado como resolvido." },
      { status: 403 }
    );
  }

  try {
    const sucesso = await marcarComoResolvidoPendente(chamado.id, usuario.nomeExibicao);

    if (!sucesso) {
      return NextResponse.json(
        {
          ok: false,
          message: "Este chamado não está aberto ou em andamento — não é possível marcar como resolvido.",
        },
        { status: 409 }
      );
    }

    const atualizado = await buscarChamadoPorNumero(chamado.numero);
    return NextResponse.json({
      ok: true,
      message: "Chamado marcado como resolvido. Aguardando confirmação do solicitante.",
      data: atualizado,
    });
  } catch (error) {
    console.error("Erro ao marcar chamado como resolvido:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível marcar o chamado como resolvido." },
      { status: 500 }
    );
  }
}
