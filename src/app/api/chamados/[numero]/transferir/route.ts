import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { carregarContextoAcao } from "@/lib/chamados/api-helpers";
import { buscarChamadoPorNumero, listarSetoresParaChamado, transferirChamado } from "@/lib/chamados/chamados";
import { optionalUuid } from "@/lib/chamados/validacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ numero: string }>;
}

/*
 * Só quem atende o setor ATUAL do chamado pode transferi-lo — pra
 * outro atendente do mesmo setor, ou pra outro setor inteiro (ver
 * transferirChamado em src/lib/chamados/chamados.ts).
 */
async function handlePOST(request: Request, context: RouteContext) {
  const { numero } = await context.params;

  const { contexto, erro } = await carregarContextoAcao(numero, null);
  if (erro) return erro;

  const { chamado, usuario, ehAtendente } = contexto;

  if (!ehAtendente || !usuario) {
    return NextResponse.json(
      { ok: false, message: "Apenas atendentes deste setor podem transferir o chamado." },
      { status: 403 }
    );
  }

  if (chamado.status === "fechado") {
    return NextResponse.json(
      { ok: false, message: "Este chamado está fechado — reabra-o antes de transferir." },
      { status: 409 }
    );
  }

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const novoSetorId = requiredText(parsedBody.setorId, "setor", 60);
    const novoAtendenteUsuarioId = optionalUuid(parsedBody.atendenteUsuarioId, "atendente");

    const setores = await listarSetoresParaChamado();
    const setorNovo = setores.find((setor) => setor.id === novoSetorId);

    if (!setorNovo) {
      throw new ValidationError("O setor selecionado não existe ou não aceita chamados.");
    }

    const sucesso = await transferirChamado({
      chamadoId: chamado.id,
      novoSetorId,
      novoAtendenteUsuarioId,
      autorNome: usuario.nomeExibicao,
      setorAnteriorNome: chamado.setorNome,
      setorNovoNome: setorNovo.nome,
    });

    if (!sucesso) {
      return NextResponse.json(
        { ok: false, message: "Não foi possível transferir este chamado." },
        { status: 409 }
      );
    }

    const atualizado = await buscarChamadoPorNumero(chamado.numero);
    return NextResponse.json({ ok: true, message: "Chamado transferido.", data: atualizado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao transferir chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível transferir o chamado." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("chamados/[numero]/transferir", handlePOST);
