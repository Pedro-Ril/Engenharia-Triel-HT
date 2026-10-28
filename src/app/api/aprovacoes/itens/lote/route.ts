import { NextResponse, after } from "next/server";

import { ValidationError } from "@/lib/auth/errors";
import { extrairIpOrigem } from "@/lib/auth/login-historico";
import { isObject, optionalText, requiredText } from "@/lib/auth/validation";
import { buscarUsuarioPorId } from "@/lib/auth/usuarios";
import { decidirItensEmLote, type DecisaoItem, type ItemAumentoSalarial } from "@/lib/aprovacoes/aprovacoes";
import { requireAtendenteAprovacaoApi } from "@/lib/aprovacoes/autorizacao-aprovacoes";
import { notificarNivelDaVez, notificarSolicitanteDecisao } from "@/lib/aprovacoes/notificacoes-email";
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
async function avisar(decididos: DecisaoItem[], origem: string): Promise<void> {
  /* Terminou (aprovado/devolvido): avisa o solicitante. Subiu de nível: avisa quem decide agora. */
  const terminaram = new Map<number, ItemAumentoSalarial>();
  const subiram = new Map<number, string[]>();

  for (const { item, etapa } of decididos) {
    if (etapa.resultado === "avancou") {
      subiram.set(item.aprovacaoNumero, [...(subiram.get(item.aprovacaoNumero) ?? []), item.id]);
    } else if (!terminaram.has(item.aprovacaoNumero)) {
      terminaram.set(item.aprovacaoNumero, item);
    }
  }

  for (const item of terminaram.values()) {
    const solicitante = await buscarUsuarioPorId(item.criadoPorUsuarioId);
    await notificarSolicitanteDecisao(item, solicitante?.email ?? null, origem);
  }

  for (const [numero, itemIds] of subiram) {
    await notificarNivelDaVez(numero, itemIds, origem);
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

    /* "reprovar" ainda é aceito e vale como devolver (telas antigas abertas). */
    if (acao !== "aprovar" && acao !== "devolver" && acao !== "reprovar") {
      throw new ValidationError('A ação deve ser "aprovar" ou "devolver".');
    }
    const decisao = acao === "aprovar" ? "aprovar" : "devolver";

    /* Mesma regra da decisão individual: devolver exige motivo, aprovar não. */
    const comentario =
      decisao === "devolver"
        ? requiredText(body.comentario, "motivo da devolução", 2000)
        : optionalText(body.comentario, "comentário", 2000);

    const resultado = await decidirItensEmLote(itemIds, usuario, decisao, comentario);

    if (resultado.decididos.length > 0) {
      await registrarLog({
        nivel: "info",
        origem: "aprovacoes",
        mensagem: `${usuario.nomeExibicao} ${decisao === "aprovar" ? "aprovou" : "devolveu"} ${resultado.decididos.length} colaborador(es) em lote no painel, no seu nível.`,
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

      const origem = await origemPublicaEfetivaAprovacoes(request);
    /*
     * O aviso sai DEPOIS da resposta (after do Next): e-mail aqui já é
     * "melhor esforço" -- falha vira log e nunca derruba a ação --
     * então não faz sentido segurar a tela esperando o SMTP.
     */
      after(() => avisar(resultado.decididos, origem));
    }

    const subiram = resultado.decididos.filter((d) => d.etapa.resultado === "avancou").length;
    const finais = resultado.decididos.length - subiram;
    const partes = [
      subiram > 0 ? `${subiram} subiu(ram) para o próximo nível` : null,
      finais > 0 ? `${finais} ${decisao === "aprovar" ? "aprovado(s) em definitivo" : "devolvido(s) ao solicitante"}` : null,
      resultado.falhas.length > 0 ? `${resultado.falhas.length} não decidido(s): ${resultado.falhas[0].motivo}` : null,
    ].filter(Boolean);
    const mensagem = partes.join(" · ") || "Nada foi decidido.";

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
