import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import {
  atualizarValidacaoErp,
  buscarEquipamentoPorId,
} from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import { validarEquipamentoNoErp } from "@/lib/estoque-equipamentos-usados/erp-integracao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

interface RouteContext {
  params: Promise<{ id: string }>;
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

    const codigoErp = requiredText(parsedBody.codigoErp, "código do item no ERP", 50);

    const equipamentoAtual = await buscarEquipamentoPorId(id);
    if (!equipamentoAtual) {
      return NextResponse.json({ ok: false, message: "Equipamento não encontrado." }, { status: 404 });
    }

    const validado = await validarEquipamentoNoErp(codigoErp, equipamentoAtual.codigoEmpresa);

    if (!validado) {
      return NextResponse.json(
        { ok: false, message: "Esse código não foi encontrado no ERP." },
        { status: 404 }
      );
    }

    await atualizarValidacaoErp(id, {
      erpCodigoItem: validado.codigoErp,
      erpIdItem: validado.idErp,
      erpDataEntrada: validado.dataEntrada,
      validadoPor: usuario.nomeExibicao,
    });

    const equipamento = await buscarEquipamentoPorId(id);
    return NextResponse.json({ ok: true, message: "Equipamento validado no ERP.", data: equipamento });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao validar equipamento no ERP:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível validar o equipamento no ERP." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/validar-erp", handlePOST);
