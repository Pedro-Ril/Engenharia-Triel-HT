import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { requiredUuidArray } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { inteiroEntre, respostaDeErro, rotaDoCatalogo } from "@/lib/rotas-avulsas/admin";
import { listarLogsRotaAvulsa, type ResultadoLogRotaAvulsa } from "@/lib/rotas-avulsas/rotas-avulsas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ chave: string }> };

const RESULTADOS: ResultadoLogRotaAvulsa[] = ["aceito", "recusado", "erro"];

/* Log de requisições da rota, mais recentes primeiro, com filtros e o resumo das últimas 24 h. */
async function handleGET(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { chave } = await context.params;
    rotaDoCatalogo(chave);
    const params = new URL(request.url).searchParams;

    const resultado = params.get("resultado");
    const tokenId = params.get("token");
    const busca = params.get("busca")?.trim().slice(0, 200) || null;
    const porPagina = inteiroEntre(params.get("porPagina") ?? "25", "itens por página", 1, 100);
    const pagina = inteiroEntre(params.get("pagina") ?? "1", "página", 1, 100000);

    const dados = await listarLogsRotaAvulsa({
      rotaChave: chave,
      resultado: RESULTADOS.includes(resultado as ResultadoLogRotaAvulsa) ? (resultado as ResultadoLogRotaAvulsa) : null,
      tokenId: tokenId ? requiredUuidArray([tokenId], "token")[0] : null,
      busca,
      pagina,
      porPagina,
    });

    return NextResponse.json({ ok: true, data: { ...dados, pagina, porPagina } });
  } catch (erro) {
    return respostaDeErro(erro, "listar o log da rota avulsa", "Não foi possível carregar o log.");
  }
}

export const GET = comMetricasApi("admin/rotas-avulsas/[chave]/logs", handleGET);
