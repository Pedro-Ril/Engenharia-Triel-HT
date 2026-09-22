import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { isObject } from "@/lib/auth/validation";
import {
  buscarEquipamentoPorId,
  duplicarEquipamento,
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

/*
 * Duplicação completa é ação só de administrador, no mesmo lugar de
 * "Excluir" — ver duplicarEquipamento para o que é copiado. Gate de
 * admin checado aqui (403 explícito) e de novo dentro de
 * duplicarEquipamento (defesa em profundidade); a partir daí qualquer
 * ValidationError é validação de entrada (número inválido/já em uso) e
 * vira 400.
 */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Equipamento inválido." }, { status: 400 });
  }

  if (!usuario.ehAdministrador) {
    return NextResponse.json(
      { ok: false, message: "Apenas administradores podem duplicar equipamentos." },
      { status: 403 }
    );
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isObject(body)) {
    return NextResponse.json({ ok: false, message: "Requisição inválida." }, { status: 400 });
  }

  const novoNumero = Number(body.novoNumero);
  if (!Number.isInteger(novoNumero) || novoNumero <= 0) {
    return NextResponse.json(
      { ok: false, message: "Informe um número inteiro válido para o novo equipamento." },
      { status: 400 }
    );
  }

  try {
    const original = await buscarEquipamentoPorId(id);
    if (!original) {
      return NextResponse.json({ ok: false, message: "Equipamento não encontrado." }, { status: 404 });
    }

    const duplicado = await duplicarEquipamento(id, novoNumero, usuario);

    await registrarLog({
      nivel: "info",
      origem: "estoque-equipamentos-usados",
      mensagem: `${usuario.nomeExibicao} duplicou o equipamento #${original.numero} (${original.descricao}) como #${duplicado.numero}.`,
      detalhes: JSON.stringify({
        equipamentoOriginalId: original.id,
        numeroOriginal: original.numero,
        equipamentoNovoId: duplicado.id,
        numeroNovo: duplicado.numero,
        descricao: duplicado.descricao,
      }),
      metodo: "POST",
      caminho: new URL(request.url).pathname,
      ipOrigem: extrairIpOrigem(request),
    });

    return NextResponse.json({ ok: true, data: duplicado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao duplicar equipamento usado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível duplicar o equipamento." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/duplicar", handlePOST);
