import { NextResponse } from "next/server";

import { requireAtendenteChamadosApi } from "@/lib/chamados/autorizacao-chamados";
import { listarFilaAtendimento } from "@/lib/chamados/chamados";
import type { PrioridadeChamado, StatusChamado } from "@/lib/chamados/chamados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusValidos: StatusChamado[] = [
  "aberto",
  "em_andamento",
  "aguardando_confirmacao",
  "resolvido",
  "fechado",
];
const prioridadesValidas: PrioridadeChamado[] = ["baixa", "media", "alta", "urgente"];

export async function GET(request: Request) {
  const resultadoAcesso = await requireAtendenteChamadosApi();
  if (resultadoAcesso.negado) return resultadoAcesso.negado;

  const { setorIds } = resultadoAcesso.acesso;
  const url = new URL(request.url);

  const statusParam = url.searchParams.get("status");
  const prioridadeParam = url.searchParams.get("prioridade");
  const busca = url.searchParams.get("busca") ?? undefined;
  const setorId = url.searchParams.get("setorId") ?? undefined;
  const empresa = url.searchParams.get("empresa") ?? undefined;
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1);
  /* Visões de gráfico/kanban pedem um lote maior (sem paginação de servidor) para agrupar tudo de uma vez. */
  const porPagina = Math.min(500, Math.max(1, Number(url.searchParams.get("porPagina")) || 20));

  try {
    const resultado = await listarFilaAtendimento({
      setorIds,
      setorId,
      empresa,
      status: statusValidos.includes(statusParam as StatusChamado)
        ? (statusParam as StatusChamado)
        : undefined,
      prioridade: prioridadesValidas.includes(prioridadeParam as PrioridadeChamado)
        ? (prioridadeParam as PrioridadeChamado)
        : undefined,
      busca: busca || undefined,
      pagina,
      porPagina,
    });

    return NextResponse.json({
      ok: true,
      data: {
        itens: resultado.itens,
        total: resultado.total,
        pagina,
        totalPaginas: Math.max(1, Math.ceil(resultado.total / porPagina)),
      },
    });
  } catch (error) {
    console.error("Erro ao listar fila de atendimento:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os chamados." },
      { status: 500 }
    );
  }
}
