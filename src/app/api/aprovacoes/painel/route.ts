import { NextResponse } from "next/server";

import { acessoPainelAprovacoes } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { listarItensPainel, type FiltrosPainel, type StatusItemAprovacao } from "@/lib/aprovacoes/aprovacoes";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusValidos: (StatusItemAprovacao | "todos")[] = ["pendente", "aprovado", "reprovado", "todos"];

async function handleGET(request: Request) {
  const acesso = await acessoPainelAprovacoes();
  if (acesso.negado) return acesso.negado;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") as StatusItemAprovacao | "todos" | null;
  const filtros: FiltrosPainel = {
    status: statusParam && statusValidos.includes(statusParam) ? statusParam : "pendente",
    busca: url.searchParams.get("busca") ?? "",
  };

  try {
    const itens = await listarItensPainel(acesso.tiposAtendidos, filtros);
    return NextResponse.json({
      ok: true,
      data: { itens, tiposAtendidos: acesso.tiposAtendidos },
    });
  } catch (error) {
    console.error("Erro ao listar itens do painel de aprovações:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar as pendências." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("aprovacoes/painel", handleGET);
