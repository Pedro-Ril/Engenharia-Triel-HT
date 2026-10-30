import { autenticarRotaAvulsa, responder } from "@/lib/rotas-avulsas/autenticacao";
import {
  atualizarSituacaoTrabalho,
  buscarTrabalhoDoToken,
  ROTA_IMPRESSAO,
  trabalhoPublico,
} from "@/lib/rotas-avulsas/impressao/impressao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * Situação de um trabalho de impressão: na_fila / imprimindo / impresso /
 * cancelado / erro. Enquanto está em andamento, pergunta à impressora na
 * hora. Cada token só enxerga os próprios trabalhos (de outro token = 404).
 */
async function handleGET(request: Request, context: RouteContext) {
  const autenticacao = await autenticarRotaAvulsa(request, ROTA_IMPRESSAO);
  if (!autenticacao.ok) return autenticacao.resposta;

  const { ctx } = autenticacao;
  const { id } = await context.params;

  try {
    const trabalho = FORMATO_UUID.test(id) ? await buscarTrabalhoDoToken(id, ctx.token.id) : null;
    if (!trabalho) {
      return responder(ctx, {
        status: 404,
        resultado: "recusado",
        motivo: "Trabalho não encontrado para este token.",
        corpo: { ok: false, message: "Trabalho não encontrado." },
        detalhes: { trabalhoId: id.slice(0, 60) },
      });
    }

    const atual = await atualizarSituacaoTrabalho(trabalho);
    return responder(ctx, {
      status: 200,
      resultado: "aceito",
      motivo: null,
      corpo: { ok: true, data: trabalhoPublico(atual) },
      detalhes: { trabalhoId: atual.id, estado: atual.estado, jobId: atual.ippJobId },
    });
  } catch (erro) {
    console.error("Erro ao consultar trabalho de impressão:", erro);
    return responder(ctx, {
      status: 500,
      resultado: "erro",
      motivo: erro instanceof Error ? erro.message : "Erro inesperado.",
      corpo: { ok: false, message: "Não foi possível consultar o trabalho." },
    });
  }
}

export const GET = comMetricasApi("externo/impressao/trabalhos/[id]", handleGET);
