import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { ajustarPesoItem, ErroGravacaoFatores } from "@/lib/engenharia-versatil/fator-conversao";
import { lerPlanilhaEnviada } from "@/lib/engenharia-versatil/planilha-enviada";
import { lerPeso } from "@/lib/engenharia-versatil/separacao-regras";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Peso divergente: grava no ERP (ambiente da administração) o peso
 * líquido que o usuário escolheu e, na mesma transação, o fator para KG.
 * Multipart: planilha + codigo + peso (kg; aceita vírgula). A tela confirma
 * antes de chamar.
 */
async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("engenharia-versatil");
  if (acesso.negado) return acesso.negado;

  try {
    const { conteudo, nome, form } = await lerPlanilhaEnviada(request);
    const codigo = String(form.get("codigo") ?? "").trim();
    if (!/^[0-9A-Za-z._-]{1,50}$/.test(codigo)) throw new ValidationError("Código do item inválido.");
    const peso = lerPeso(form.get("peso"));
    if (peso === null) throw new ValidationError("Informe o peso correto (em kg).");

    const resultado = await ajustarPesoItem(conteudo, nome, codigo, peso, acesso.usuario);

    await registrarLog({
      nivel: "info",
      origem: "engenharia-versatil/peso",
      mensagem: `${acesso.usuario.nomeExibicao} ajustou o peso de ${codigo} no ERP (${resultado.ambiente}): ${resultado.pesoAntes ?? "-"} -> ${resultado.pesoDepois ?? "-"} kg.`,
      metodo: "POST",
      caminho: new URL(request.url).pathname,
    });

    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    if (error instanceof ErroGravacaoFatores) {
      return NextResponse.json({ ok: false, message: error.message, data: { chamadas: error.chamadas } }, { status: 400 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    console.error("Erro ao ajustar o peso no ERP:", error);
    return NextResponse.json({ ok: false, message: "Não foi possível ajustar o peso no ERP." }, { status: 500 });
  }
}

export const POST = comMetricasApi("engenharia-versatil/fatores/peso", handlePOST);
