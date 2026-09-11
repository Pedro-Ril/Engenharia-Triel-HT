import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import {
  buscarEquipamentoPorId,
  excluirEquipamento,
} from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "estoque-equipamentos-usados";

const uniqueIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Equipamento inválido." }, { status: 400 });
  }

  try {
    const equipamento = await buscarEquipamentoPorId(id);

    if (!equipamento) {
      return NextResponse.json({ ok: false, message: "Equipamento não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: equipamento });
  } catch (error) {
    console.error("Erro ao buscar equipamento usado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar o equipamento." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/[id]", handleGET);

/*
 * Exclusão definitiva é ação só de administrador (checado dentro de
 * excluirEquipamento) — o ciclo de vida normal termina em "baixa", não
 * em apagar o registro. Pedido explícito: toda exclusão fica registrada
 * em portal_logs (visível em Administração → Monitoramento → Logs),
 * mesmo padrão já usado em transferência de arquivos.
 */
async function handleDELETE(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Equipamento inválido." }, { status: 400 });
  }

  try {
    const equipamento = await excluirEquipamento(id, usuario);

    if (!equipamento) {
      return NextResponse.json({ ok: false, message: "Equipamento não encontrado." }, { status: 404 });
    }

    await registrarLog({
      nivel: "info",
      origem: "estoque-equipamentos-usados",
      mensagem: `${usuario.nomeExibicao} excluiu o equipamento #${equipamento.numero} (${equipamento.descricao}).`,
      detalhes: JSON.stringify({
        equipamentoId: equipamento.id,
        numero: equipamento.numero,
        descricao: equipamento.descricao,
        numeroSerie: equipamento.numeroSerie,
        status: equipamento.status,
      }),
      metodo: "DELETE",
      caminho: new URL(request.url).pathname,
      ipOrigem: extrairIpOrigem(request),
    });

    return NextResponse.json({ ok: true, message: "Equipamento excluído." });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 403 });
    }

    console.error("Erro ao excluir equipamento usado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível excluir o equipamento." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("estoque-equipamentos-usados/[id]", handleDELETE);
