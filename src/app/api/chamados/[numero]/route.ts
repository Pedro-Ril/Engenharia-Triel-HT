import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { verificarAcessoChamado } from "@/lib/chamados/autorizacao-chamados";
import {
  atribuirAtendente,
  atualizarPrioridade,
  buscarChamadoPorNumero,
} from "@/lib/chamados/chamados";
import { optionalUuid, requiredPrioridade } from "@/lib/chamados/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ numero: string }>;
}

function parseNumero(valor: string): number | null {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

export async function GET(request: Request, context: RouteContext) {
  const { numero: numeroParam } = await context.params;
  const numero = parseNumero(numeroParam);

  if (!numero) {
    return NextResponse.json(
      { ok: false, message: "Número de chamado inválido." },
      { status: 400 }
    );
  }

  const usuario = await getUsuarioAutenticado();
  const nomeConfirmado = new URL(request.url).searchParams.get("nome");

  try {
    const chamado = await buscarChamadoPorNumero(numero);

    if (!chamado) {
      return NextResponse.json(
        { ok: false, message: "Chamado não encontrado." },
        { status: 404 }
      );
    }

    const { podeVer, ehAtendente } = await verificarAcessoChamado(
      chamado,
      usuario,
      nomeConfirmado
    );

    if (!podeVer) {
      return NextResponse.json(
        { ok: false, message: "Você não tem acesso a este chamado." },
        { status: 403 }
      );
    }

    const mensagensVisiveis = ehAtendente
      ? chamado.mensagens
      : chamado.mensagens.filter((mensagem) => !mensagem.interno);

    return NextResponse.json({
      ok: true,
      data: { ...chamado, mensagens: mensagensVisiveis, ehAtendente },
    });
  } catch (error) {
    console.error("Erro ao buscar chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o chamado." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { numero: numeroParam } = await context.params;
  const numero = parseNumero(numeroParam);

  if (!numero) {
    return NextResponse.json(
      { ok: false, message: "Número de chamado inválido." },
      { status: 400 }
    );
  }

  const usuario = await getUsuarioAutenticado();

  try {
    const chamado = await buscarChamadoPorNumero(numero);

    if (!chamado) {
      return NextResponse.json(
        { ok: false, message: "Chamado não encontrado." },
        { status: 404 }
      );
    }

    const { ehAtendente } = await verificarAcessoChamado(chamado, usuario);

    if (!ehAtendente) {
      return NextResponse.json(
        { ok: false, message: "Apenas atendentes deste setor podem alterar o chamado." },
        { status: 403 }
      );
    }

    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    if (parsedBody.prioridade !== undefined) {
      await atualizarPrioridade(chamado.id, requiredPrioridade(parsedBody.prioridade));
    }

    if (parsedBody.atendenteUsuarioId !== undefined) {
      await atribuirAtendente(
        chamado.id,
        optionalUuid(parsedBody.atendenteUsuarioId, "atendente")
      );
    }

    const atualizado = await buscarChamadoPorNumero(numero);

    return NextResponse.json({ ok: true, message: "Chamado atualizado.", data: atualizado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao atualizar chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível atualizar o chamado." },
      { status: 500 }
    );
  }
}
