import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { obterAmbienteAtivo } from "@/lib/estrutura-substituicao/estrutura-substituicao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Consultada pela tela de Substituição de item na estrutura pra
 * mostrar um indicador visual (produção/teste) — evita qualquer
 * dúvida sobre em qual ambiente uma troca vai ser aplicada de verdade.
 */
async function handleGET() {
  const acesso = await verificarAcessoModuloApi("substituicao-estrutura");
  if (acesso.negado) return acesso.negado;

  try {
    const ambiente = await obterAmbienteAtivo();
    return NextResponse.json({ ok: true, data: { ambiente } });
  } catch (error) {
    console.error("Erro ao obter ambiente ativo de substituição de estrutura:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível obter o ambiente ativo." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("estrutura-substituicao/ambiente", handleGET);
