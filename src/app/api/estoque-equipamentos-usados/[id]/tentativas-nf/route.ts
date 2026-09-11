import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import {
  buscarEquipamentoPendenteNfParaTentativa,
  listarTentativasNf,
  tentarBuscarNfEntrada,
} from "@/lib/estoque-equipamentos-usados/nf-entrada-integracao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

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
    const tentativas = await listarTentativasNf(id);
    return NextResponse.json({ ok: true, data: tentativas });
  } catch (error) {
    console.error("Erro ao buscar tentativas de integração de NF de entrada:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar as tentativas de integração." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estoque-equipamentos-usados/[id]/tentativas-nf", handleGET);

/*
 * "Tentar agora" (manual, botão no modal de tentativas) — mesma lógica do
 * job automático (tentarBuscarNfEntrada nunca lança por causa da chamada
 * ao ERP em si, só registra o log), só que disparadoPor leva o nome de
 * quem clicou em vez de null. A checagem de elegibilidade (empresa/
 * cliente/mascara presentes, NF ainda não preenchida) acontece antes e
 * essa sim vira erro 400 — não é uma tentativa de verdade se faltam
 * parâmetros pra montar a consulta.
 */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json({ ok: false, message: "Equipamento inválido." }, { status: 400 });
  }

  try {
    const pendente = await buscarEquipamentoPendenteNfParaTentativa(id);
    await tentarBuscarNfEntrada(pendente, usuario.nomeExibicao);

    const tentativas = await listarTentativasNf(id);
    return NextResponse.json({ ok: true, message: "Tentativa concluída.", data: tentativas });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao tentar integração manual de NF de entrada:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível concluir a tentativa." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("estoque-equipamentos-usados/[id]/tentativas-nf", handlePOST);
