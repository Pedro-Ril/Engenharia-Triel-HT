import { NextResponse } from "next/server";

import { buscarChamadoPorNumero, fecharChamado } from "@/lib/chamados/chamados";
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
      { ok: false, message: "Apenas atendentes deste setor podem fechar o chamado." },
      { status: 403 }
    );
  }

  try {
    const sucesso = await fecharChamado(chamado.id, usuario.nomeExibicao);

    if (!sucesso) {
      return NextResponse.json(
        { ok: false, message: "Este chamado não está resolvido — não é possível fechar." },
        { status: 409 }
      );
    }

    const atualizado = await buscarChamadoPorNumero(chamado.numero);
    return NextResponse.json({ ok: true, message: "Chamado fechado.", data: atualizado });
  } catch (error) {
    console.error("Erro ao fechar chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível fechar o chamado." },
      { status: 500 }
    );
  }
}
