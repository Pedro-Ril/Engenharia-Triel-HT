import { NextResponse } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { buscarUsuarioPorId } from "@/lib/auth/usuarios";
import { decidirItensEmLote, type ItemAumentoSalarial } from "@/lib/aprovacoes/aprovacoes";
import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { notificarSolicitanteDecisao } from "@/lib/aprovacoes/notificacoes-email";
import { origemPublicaEfetivaAprovacoes } from "@/lib/aprovacoes/config";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function lerItemIds(body: Record<string, unknown>): string[] {
  const bruto = body.itemIds;

  if (!Array.isArray(bruto) || bruto.length === 0) {
    throw new ValidationError("Selecione ao menos um colaborador.");
  }

  if (bruto.length > 200) {
    throw new ValidationError("Selecione no máximo 200 colaboradores por vez.");
  }

  return bruto.map((id, indice) => requiredText(id, `colaborador (posição ${indice + 1})`, 36));
}

/*
 * Um e-mail por SOLICITAÇÃO, não por colaborador decidido: aprovar 3 de
 * um lote de 5 avisa o solicitante uma vez só. O texto já é genérico
 * (ver notificacoes-email.ts), então qualquer item do grupo serve de
 * base para montá-lo.
 */
async function avisarSolicitantes(decididos: ItemAumentoSalarial[], origem: string): Promise<void> {
  const porSolicitacao = new Map<number, ItemAumentoSalarial>();

  for (const item of decididos) {
    if (!porSolicitacao.has(item.aprovacaoNumero)) {
      porSolicitacao.set(item.aprovacaoNumero, item);
    }
  }

  for (const item of porSolicitacao.values()) {
    const solicitante = await buscarUsuarioPorId(item.criadoPorUsuarioId);
    await notificarSolicitanteDecisao(item, solicitante?.email ?? null, origem);
  }
}

async function handlePOST(request: Request) {
  const acesso = await requireAtendenteAprovacaoApi("aumento_salarial");
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    }

    const itemIds = lerItemIds(body);
    const acao = requiredText(body.acao, "ação", 20);

    if (acao !== "aprovar" && acao !== "reprovar") {
      throw new ValidationError('A ação deve ser "aprovar" ou "reprovar".');
    }

    /* Mesma regra da decisão individual: reprovar exige motivo, aprovar não. */
    const comentario =
      acao === "reprovar"
        ? requiredText(body.comentario, "motivo da reprovação", 2000)
        : optionalText(body.comentario, "comentário", 2000);

    const resultado = await decidirItensEmLote(
      itemIds,
      usuario,
      acao === "aprovar" ? "aprovado" : "reprovado",
      comentario
    );

    if (resultado.decididos.length > 0) {
      await registrarLog({
        nivel: "info",
        origem: "aprovacoes",
        mensagem: `${usuario.nomeExibicao} ${acao === "aprovar" ? "aprovou" : "reprovou"} ${resultado.decididos.length} colaborador(es) em lote no painel.`,
        detalhes: JSON.stringify({
          acao,
          total: itemIds.length,
          decididos: resultado.decididos.length,
          falhas: resultado.falhas,
        }),
        metodo: "POST",
        caminho: "/api/aprovacoes/itens/lote",
        ipOrigem: extrairIpOrigem(request),
      });

      await avisarSolicitantes(resultado.decididos, await origemPublicaEfetivaAprovacoes(request));
    }

    const mensagem =
      resultado.falhas.length === 0
        ? `${resultado.decididos.length} colaborador(es) ${acao === "aprovar" ? "aprovado(s)" : "reprovado(s)"}.`
        : `${resultado.decididos.length} decidido(s), ${resultado.falhas.length} não puderam ser decididos (já tinham decisão).`;

    return NextResponse.json({
      ok: true,
      message: mensagem,
      data: { decididos: resultado.decididos.length, falhas: resultado.falhas },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao decidir colaboradores em lote:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível concluir a decisão em lote." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("aprovacoes/itens/lote", handlePOST);
