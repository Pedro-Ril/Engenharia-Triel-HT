import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText, requiredText, requiredUuidArray } from "@/lib/auth/validation";
import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { decidirPedidosCompra, type DirecionarPedidos } from "@/lib/aprovacoes/pedidos-compra";
import { registrarLog } from "@/lib/monitoramento/logs";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* "todos" (ou ausente) | "sugestao" | id de uma pessoa do próximo nível. */
function lerDirecionamento(valor: unknown): DirecionarPedidos {
  if (valor === undefined || valor === null || valor === "" || valor === "todos") return "todos";
  if (valor === "sugestao") return "sugestao";
  return { usuarioId: requiredUuidArray([valor], "direcionar para")[0] };
}

/*
 * Aprova ou devolve, no nível do usuário, um ou vários pedidos de
 * compra. Devolver exige motivo (o comprador precisa saber o que
 * ajustar); aprovar não. Aprovando, dá para direcionar o próximo nível
 * a uma pessoa dele (`direcionarPara`) -- só ela verá o pedido. O SupriConnect fica sabendo pela consulta de
 * decisões (GET /api/externo/...?desde=) quando a cadeia termina.
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
    if (acao !== "aprovar" && acao !== "devolver") {
      throw new ValidationError('A ação deve ser "aprovar" ou "devolver".');
    }

    const comentario =
      acao === "devolver"
        ? requiredText(body.comentario, "motivo da devolução", 2000)
        : optionalText(body.comentario, "comentário", 2000);

    const resultado = await decidirPedidosCompra({
      ids: [...new Set(ids)],
      usuario: acesso.usuario,
      acao,
      comentario,
      direcionarPara: lerDirecionamento(body.direcionarPara),
    });

    if (resultado.decididos.length > 0) {
      await registrarLog({
        nivel: "info",
        origem: "aprovacoes/pedidos-compra",
        mensagem: `${acesso.usuario.nomeExibicao} ${acao === "aprovar" ? "aprovou" : "devolveu"} ${resultado.decididos.length} pedido(s) de compra no seu nível.`,
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
