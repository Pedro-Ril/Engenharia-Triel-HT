import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarMinhasSolicitacoes } from "@/lib/aprovacoes/aprovacoes";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "aprovacoes-minhas-solicitacoes";

async function handleGET() {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  try {
    const itens = await listarMinhasSolicitacoes(usuario.id);
    return NextResponse.json({ ok: true, data: itens });
  } catch (error) {
    console.error("Erro ao listar minhas solicitações de aprovação:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar suas solicitações." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("aprovacoes/minhas", handleGET);
