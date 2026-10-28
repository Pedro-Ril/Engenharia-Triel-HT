import { NextResponse, after } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { isObject, optionalText } from "@/lib/auth/validation";
import { reenviarItem } from "@/lib/aprovacoes/aprovacoes";
import { origemPublicaEfetivaAprovacoes } from "@/lib/aprovacoes/config";
import { notificarNivelDaVez } from "@/lib/aprovacoes/notificacoes-email";
import { registrarLog } from "@/lib/monitoramento/logs";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODULO_CHAVE = "aprovacoes-minhas-solicitacoes";

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

/*
 * O solicitante ajusta o colaborador devolvido e reenvia: a cadeia
 * recomeça do nível 1, que é avisado por e-mail.
 */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_CHAVE);
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { itemId } = await context.params;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");

    const item = await reenviarItem(itemId, usuario, {
      valorReajuste: Number(body.valorReajuste),
      percentualReajuste: Number(body.percentualReajuste),
      comentario: optionalText(body.comentario, "comentário", 2000),
    });

    await registrarLog({
      nivel: "info",
      origem: "aprovacoes",
      mensagem: `${usuario.nomeExibicao} reenviou ${item.funcionarioNome} na solicitação #${item.aprovacaoNumero}.`,
      metodo: "POST",
      caminho: `/api/aprovacoes/minhas/itens/${itemId}/reenviar`,
      ipOrigem: extrairIpOrigem(request),
    });

    const origem = await origemPublicaEfetivaAprovacoes(request);
    after(() => notificarNivelDaVez(item.aprovacaoNumero, [item.id], origem, "reenviada"));

    return NextResponse.json({ ok: true, message: "Reenviado para aprovação.", data: item });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao reenviar colaborador:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível reenviar." }, { status: 500 });
  }
}

export const POST = comMetricasApi("aprovacoes/minhas/itens/[itemId]/reenviar", handlePOST);
