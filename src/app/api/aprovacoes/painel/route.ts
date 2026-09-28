import { NextResponse } from "next/server";

import { acessoPainelAprovacoes } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import {
  listarItensPainel,
  listarOpcoesFiltroPainel,
  type FiltrosPainel,
  type OrdemPainel,
  type StatusItemAprovacao,
} from "@/lib/aprovacoes/aprovacoes";
import { ehTipoAprovacao } from "@/lib/aprovacoes/tipos-aprovacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusValidos: (StatusItemAprovacao | "todos")[] = ["pendente", "aprovado", "reprovado", "todos"];
const ordensValidas: OrdemPainel[] = ["fila", "colaborador", "recentes"];

async function handleGET(request: Request) {
  const acesso = await acessoPainelAprovacoes();
  if (acesso.negado) return acesso.negado;

  const parametros = new URL(request.url).searchParams;
  const statusParam = parametros.get("status") as StatusItemAprovacao | "todos" | null;
  const ordemParam = parametros.get("ordem") as OrdemPainel | null;
  const tipoParam = parametros.get("tipo");

  const filtros: FiltrosPainel = {
    status: statusParam && statusValidos.includes(statusParam) ? statusParam : "pendente",
    busca: parametros.get("busca") ?? "",
    tipo: tipoParam && ehTipoAprovacao(tipoParam) ? tipoParam : "",
    departamento: parametros.get("departamento") ?? "",
    setor: parametros.get("setor") ?? "",
    ordem: ordemParam && ordensValidas.includes(ordemParam) ? ordemParam : "fila",
  };

  try {
    const [itens, opcoes] = await Promise.all([
      listarItensPainel(acesso.tiposAtendidos, filtros),
      listarOpcoesFiltroPainel(acesso.tiposAtendidos),
    ]);

    return NextResponse.json({
      ok: true,
      data: { itens, tiposAtendidos: acesso.tiposAtendidos, ...opcoes },
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
