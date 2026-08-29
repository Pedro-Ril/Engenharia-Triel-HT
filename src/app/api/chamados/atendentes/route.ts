import { NextResponse } from "next/server";

import { listarAtendentesDisponiveisParaSetor } from "@/lib/chamados/atendentes";
import { requireAtendenteChamadosApi } from "@/lib/chamados/autorizacao-chamados";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Usada pelo modal de transferência de chamado — atendente/admin
 * troca o setor de destino e a lista de possíveis atendentes
 * daquele setor é buscada aqui (ver listarAtendentesDisponiveisParaSetor).
 */
async function handleGET(request: Request) {
  const resultadoAcesso = await requireAtendenteChamadosApi();
  if (resultadoAcesso.negado) return resultadoAcesso.negado;

  const setorId = new URL(request.url).searchParams.get("setorId");

  if (!setorId) {
    return NextResponse.json({ ok: false, message: "Informe o setor." }, { status: 400 });
  }

  try {
    const atendentes = await listarAtendentesDisponiveisParaSetor(setorId);
    return NextResponse.json({ ok: true, data: atendentes });
  } catch (error) {
    console.error("Erro ao listar atendentes disponíveis:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os atendentes." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("chamados/atendentes", handleGET);
