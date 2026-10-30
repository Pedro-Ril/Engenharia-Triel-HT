import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { requiredUuidArray } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";
import { lerCorpoJson, respostaDeErro, validarDadosImpressora } from "@/lib/rotas-avulsas/admin";
import { atualizarImpressora, buscarImpressora, excluirImpressora } from "@/lib/rotas-avulsas/impressao/impressao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const dados = validarDadosImpressora(await lerCorpoJson(request));
    const resultado = await atualizarImpressora(requiredUuidArray([id], "impressora")[0], dados, acesso.usuario.samAccountName);

    if (resultado === "duplicada") {
      return NextResponse.json({ ok: false, message: `Já existe uma impressora com o código ${dados.codigo}.` }, { status: 400 });
    }
    if (!resultado) return NextResponse.json({ ok: false, message: "Impressora não encontrada." }, { status: 404 });

    await registrarLog({
      nivel: "info",
      origem: "rotas-avulsas",
      mensagem: `Impressora ${resultado.codigo} alterada por ${acesso.usuario.samAccountName}.`,
      detalhes: JSON.stringify(resultado),
    });

    return NextResponse.json({ ok: true, message: "Impressora salva.", data: resultado });
  } catch (erro) {
    return respostaDeErro(erro, "salvar impressora", "Não foi possível salvar a impressora.");
  }
}

async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { id } = await context.params;
    const impressoraId = requiredUuidArray([id], "impressora")[0];
    const impressora = await buscarImpressora(impressoraId);
    if (!impressora || !(await excluirImpressora(impressoraId))) {
      return NextResponse.json({ ok: false, message: "Impressora não encontrada." }, { status: 404 });
    }

    await registrarLog({
      nivel: "aviso",
      origem: "rotas-avulsas",
      mensagem: `Impressora ${impressora.codigo} (${impressora.endereco}) excluída por ${acesso.usuario.samAccountName}.`,
    });

    return NextResponse.json({ ok: true, message: "Impressora excluída." });
  } catch (erro) {
    return respostaDeErro(erro, "excluir impressora", "Não foi possível excluir a impressora.");
  }
}

export const PATCH = comMetricasApi("admin/impressao/impressoras/[id]", handlePATCH);
export const DELETE = comMetricasApi("admin/impressao/impressoras/[id]", handleDELETE);
