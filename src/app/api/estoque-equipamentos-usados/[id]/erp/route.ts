import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { requiredUuidArray } from "@/lib/auth/validation";
import { buscarSituacaoErp, sincronizarExtrato } from "@/lib/estoque-equipamentos-usados/extrato-integracao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Situação do equipamento segundo o ERP e a cópia do extrato (o que a última sincronização trouxe). */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const situacao = await buscarSituacaoErp(requiredUuidArray([id], "equipamento")[0]);
    if (!situacao) return NextResponse.json({ ok: false, message: "Equipamento não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true, data: situacao });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao buscar a situação do equipamento no ERP:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível buscar a situação no ERP." }, { status: 500 });
  }
}

/* "Atualizar do ERP": sincroniza este equipamento agora, pelo extrato. */
async function handlePOST(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const equipamentoId = requiredUuidArray([id], "equipamento")[0];
    const [resultado] = await sincronizarExtrato({ equipamentoIds: [equipamentoId], disparadoPor: acesso.usuario.nomeExibicao });

    if (!resultado) {
      throw new ValidationError(
        "Este equipamento não é sincronizado: ele está baixado ou ainda não foi identificado no ERP pela NF de entrada."
      );
    }
    if (resultado.erro) {
      return NextResponse.json({ ok: false, message: resultado.erro, data: resultado }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      message: resultado.statusAntes !== resultado.statusDepois ? "Status atualizado pelo ERP." : "Extrato conferido com o ERP.",
      data: resultado,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao sincronizar o equipamento com o ERP:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível sincronizar com o ERP." }, { status: 500 });
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/[id]/erp", handleGET);
export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/erp", handlePOST);
