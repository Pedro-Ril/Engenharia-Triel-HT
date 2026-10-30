import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";
import { lerCorpoJson, respostaDeErro, validarDadosImpressora } from "@/lib/rotas-avulsas/admin";
import { criarImpressora, listarImpressoras } from "@/lib/rotas-avulsas/impressao/impressao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Impressoras que a rota avulsa de impressão pode usar. */
async function handleGET() {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarImpressoras() });
  } catch (erro) {
    return respostaDeErro(erro, "listar impressoras", "Não foi possível listar as impressoras.");
  }
}

async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const dados = validarDadosImpressora(await lerCorpoJson(request));
    const impressora = await criarImpressora(dados, acesso.usuario.samAccountName);
    if (!impressora) {
      return NextResponse.json({ ok: false, message: `Já existe uma impressora com o código ${dados.codigo}.` }, { status: 400 });
    }

    await registrarLog({
      nivel: "info",
      origem: "rotas-avulsas",
      mensagem: `Impressora ${impressora.codigo} (${impressora.endereco}) cadastrada por ${acesso.usuario.samAccountName}.`,
    });

    return NextResponse.json({ ok: true, message: "Impressora cadastrada.", data: impressora }, { status: 201 });
  } catch (erro) {
    return respostaDeErro(erro, "cadastrar impressora", "Não foi possível cadastrar a impressora.");
  }
}

export const GET = comMetricasApi("admin/impressao/impressoras", handleGET);
export const POST = comMetricasApi("admin/impressao/impressoras", handlePOST);
