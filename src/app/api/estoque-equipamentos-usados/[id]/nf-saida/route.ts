import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, requiredText } from "@/lib/auth/validation";
import { buscarEquipamentoPorId } from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import { consultarNfSaidaSemRegistrar } from "@/lib/estoque-equipamentos-usados/nf-saida-integracao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/*
 * Busca sob demanda a NF de saída no ERP (empréstimo, consignação ou
 * venda) — chamada quando o usuário digita/sai do campo "Número da NF"
 * num desses modais, antes mesmo da movimentação existir. Só devolve o
 * resultado pra tela pré-preencher os campos — NÃO registra nada em
 * "Tentativa de integração": se o usuário abandonar sem confirmar a
 * movimentação, essa consulta não deve aparecer no histórico do
 * equipamento (só no log genérico de chamadas externas). O registro de
 * tentativa de verdade acontece dentro do POST da movimentação em si
 * (emprestimo/consignacao/baixa), no momento da confirmação.
 */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  try {
    const parsedBody: unknown = await request.json();
    if (!isObject(parsedBody)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const numeroNf = requiredText(parsedBody.numeroNf, "número da NF", 30);

    const equipamento = await buscarEquipamentoPorId(id);
    if (!equipamento) {
      return NextResponse.json({ ok: false, message: "Equipamento não encontrado." }, { status: 404 });
    }

    if (!equipamento.codigoEmpresa) {
      return NextResponse.json(
        { ok: false, message: "Este equipamento não tem empresa preenchida — não é possível consultar o ERP." },
        { status: 400 }
      );
    }

    const resultado = await consultarNfSaidaSemRegistrar({
      codigoEmpresa: equipamento.codigoEmpresa,
      numeroNf,
      idItem: equipamento.erpIdItem,
    });

    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao consultar NF de saída:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível consultar a NF de saída." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/nf-saida", handlePOST);
