import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { rodadaAtiva } from "@/lib/3dexperience/liberacao-desenhos";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * A rodada em andamento (ou agendada) para quem abre a tela: a da própria
 * pessoa primeiro (minha: true, a tela abre nela), senão a que está
 * ocupando o 3DX agora. data: null quando não há nenhuma.
 */
async function handleGET() {
  const acesso = await verificarAcessoModuloApi("3dexperience");
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await rodadaAtiva(acesso.usuario.id) });
  } catch (error) {
    console.error("Erro ao buscar a rodada de liberação em andamento:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível ver se há rodada em andamento." }, { status: 500 });
  }
}

export const GET = comMetricasApi("3dexperience/liberacao/ativa", handleGET);
