import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { isObject, optionalText } from "@/lib/auth/validation";
import { buscarUsuarioPorId } from "@/lib/auth/usuarios";
import { aprovarItem } from "@/lib/aprovacoes/aprovacoes";
import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { notificarSolicitanteDecisao } from "@/lib/aprovacoes/notificacoes-email";
import { optionalAjusteValores } from "@/lib/aprovacoes/validacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await requireAtendenteAprovacaoApi("aumento_salarial");
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const { itemId } = await context.params;

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const comentario = isObject(body) ? optionalText(body.comentario, "comentário", 2000) : null;
    const ajuste = optionalAjusteValores(body);

    const item = await aprovarItem(itemId, usuario, comentario, ajuste);

    await registrarLog({
      nivel: "info",
      origem: "aprovacoes",
      mensagem: `${usuario.nomeExibicao} aprovou ${item.funcionarioNome} na solicitação #${item.aprovacaoNumero}.`,
      detalhes: JSON.stringify({ itemId, aprovacaoNumero: item.aprovacaoNumero, comentario, ajustouValores: ajuste !== null }),
      metodo: "POST",
      caminho: `/api/aprovacoes/itens/${itemId}/aprovar`,
      ipOrigem: extrairIpOrigem(request),
    });

    const solicitante = await buscarUsuarioPorId(item.criadoPorUsuarioId);
    const origem = new URL(request.url).origin;
    await notificarSolicitanteDecisao(item, solicitante?.email ?? null, origem);

    return NextResponse.json({ ok: true, message: "Colaborador aprovado.", data: item });
  } catch (error) {
    if (error instanceof ValidationError) {
      const status = error.message.includes("já foi decidido") ? 409 : 400;
      return NextResponse.json({ ok: false, message: error.message }, { status });
    }

    console.error("Erro ao aprovar colaborador:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível aprovar o colaborador." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("aprovacoes/itens/[itemId]/aprovar", handlePOST);
