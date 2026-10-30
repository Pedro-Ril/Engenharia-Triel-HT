import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { requiredText } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";
import { lerCorpoJson, lerExpiracao, respostaDeErro, rotaDoCatalogo, validarEscopoToken } from "@/lib/rotas-avulsas/admin";
import { criarTokenRotaAvulsa, listarTokensRotaAvulsa } from "@/lib/rotas-avulsas/rotas-avulsas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ chave: string }> };

async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { chave } = await context.params;
    rotaDoCatalogo(chave);
    return NextResponse.json({ ok: true, data: await listarTokensRotaAvulsa(chave) });
  } catch (erro) {
    return respostaDeErro(erro, "listar os tokens da rota avulsa", "Não foi possível listar os tokens.");
  }
}

/* Cria um token. O valor volta só nesta resposta; o banco guarda apenas o hash. */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { chave } = await context.params;
    const rota = rotaDoCatalogo(chave);
    const corpo = await lerCorpoJson(request);

    const { token, valor } = await criarTokenRotaAvulsa({
      rotaChave: chave,
      nome: requiredText(corpo.nome, "sistema", 120),
      escopo: validarEscopoToken(chave, corpo.escopo),
      expiraEm: lerExpiracao(corpo.expiraEm),
      criadoPor: acesso.usuario.samAccountName,
    });

    await registrarLog({
      nivel: "info",
      origem: "rotas-avulsas",
      mensagem: `Token "${token.nome}" (${token.prefixo}…) criado na rota "${rota.nome}" por ${acesso.usuario.samAccountName}.`,
    });

    return NextResponse.json({ ok: true, message: "Token criado.", data: { token, valor } }, { status: 201 });
  } catch (erro) {
    return respostaDeErro(erro, "criar token da rota avulsa", "Não foi possível criar o token.");
  }
}

export const GET = comMetricasApi("admin/rotas-avulsas/[chave]/tokens", handleGET);
export const POST = comMetricasApi("admin/rotas-avulsas/[chave]/tokens", handlePOST);
