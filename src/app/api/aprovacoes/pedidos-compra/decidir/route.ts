import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText, requiredUuidArray } from "@/lib/auth/validation";
import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { decidirPedidosCompra } from "@/lib/aprovacoes/pedidos-compra";
import { registrarLog } from "@/lib/monitoramento/logs";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Aprova ou reprova um ou vários pedidos de compra. Mesma regra do
 * reajuste: reprovar exige motivo, aprovar não. O SupriConnect fica
 * sabendo pela consulta de decisões (GET /api/externo/...?desde=).
 */
async function handlePOST(request: Request) {
  const acesso = await requireAtendenteAprovacaoApi("pedido_compra");
  if (acesso.negado) return acesso.negado;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const ids = requiredUuidArray(body.ids, "pedidos");
    if (ids.length > 200) {
      throw new ValidationError("Selecione no máximo 200 pedidos por vez.");
    }

    const acao = requiredText(body.acao, "ação", 20);
    if (acao !== "aprovar" && acao !== "reprovar") {
      throw new ValidationError('A ação deve ser "aprovar" ou "reprovar".');
    }

    const comentario =
      acao === "reprovar"
        ? requiredText(body.comentario, "motivo da reprovação", 2000)
        : optionalText(body.comentario, "comentário", 2000);

    const resultado = await decidirPedidosCompra({
      ids: [...new Set(ids)],
      usuario: acesso.usuario,
      decisao: acao === "aprovar" ? "aprovado" : "reprovado",
      comentario,
    });

    if (resultado.decididos.length > 0) {
      await registrarLog({
        nivel: "info",
        origem: "aprovacoes/pedidos-compra",
        mensagem: `${acesso.usuario.nomeExibicao} ${acao === "aprovar" ? "aprovou" : "reprovou"} ${resultado.decididos.length} pedido(s) de compra.`,
        detalhes: JSON.stringify(resultado.decididos),
        metodo: "POST",
        caminho: new URL(request.url).pathname,
      });
    }

    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao decidir pedidos de compra:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível registrar a decisão." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("aprovacoes/pedidos-compra/decidir", handlePOST);
