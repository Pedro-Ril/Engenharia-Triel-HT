import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { registrarRetorno } from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { id } = await context.params;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const numeroNf = requiredText(parsedBody.numeroNf, "número da NF", 30);
    const observacoes = optionalText(parsedBody.observacoes, "observações", 1000);

    const equipamento = await registrarRetorno({
      equipamentoId: id,
      numeroNf,
      observacoes,
      dataAcao: hoje(),
      criadoPorUsuarioId: usuario.id,
      criadoPorNome: usuario.nomeExibicao,
    });

    return NextResponse.json({ ok: true, message: "Retorno ao estoque registrado.", data: equipamento });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao registrar retorno de equipamento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível registrar o retorno." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/retorno", handlePOST);
