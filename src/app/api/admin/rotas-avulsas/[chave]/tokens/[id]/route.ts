import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { requiredText, requiredUuidArray } from "@/lib/auth/validation";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";
import { lerCorpoJson, lerExpiracao, respostaDeErro, rotaDoCatalogo, validarEscopoToken } from "@/lib/rotas-avulsas/admin";
import { atualizarTokenRotaAvulsa, revogarTokenRotaAvulsa } from "@/lib/rotas-avulsas/rotas-avulsas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ chave: string; id: string }> };

/* Edita nome, impressoras e validade de um token ainda válido (o valor do token não muda). */
async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { chave, id } = await context.params;
    rotaDoCatalogo(chave);
    const corpo = await lerCorpoJson(request);

    const token = await atualizarTokenRotaAvulsa({
      rotaChave: chave,
      id: requiredUuidArray([id], "token")[0],
      nome: requiredText(corpo.nome, "sistema", 120),
      escopo: validarEscopoToken(chave, corpo.escopo),
      expiraEm: lerExpiracao(corpo.expiraEm),
    });
    if (!token) {
      return NextResponse.json({ ok: false, message: "Token não encontrado ou já revogado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, message: "Token atualizado.", data: token });
  } catch (erro) {
    return respostaDeErro(erro, "atualizar token da rota avulsa", "Não foi possível atualizar o token.");
  }
}

/* Revoga: o token para de valer na hora e não volta mais (a linha fica para o histórico). */
async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { chave, id } = await context.params;
    const rota = rotaDoCatalogo(chave);
    const token = await revogarTokenRotaAvulsa(chave, requiredUuidArray([id], "token")[0], acesso.usuario.samAccountName);
    if (!token) {
      return NextResponse.json({ ok: false, message: "Token não encontrado ou já revogado." }, { status: 404 });
    }

    await registrarLog({
      nivel: "aviso",
      origem: "rotas-avulsas",
      mensagem: `Token "${token.nome}" (${token.prefixo}…) da rota "${rota.nome}" revogado por ${acesso.usuario.samAccountName}.`,
    });

    return NextResponse.json({ ok: true, message: "Token revogado.", data: token });
  } catch (erro) {
    return respostaDeErro(erro, "revogar token da rota avulsa", "Não foi possível revogar o token.");
  }
}

export const PATCH = comMetricasApi("admin/rotas-avulsas/[chave]/tokens/[id]", handlePATCH);
export const DELETE = comMetricasApi("admin/rotas-avulsas/[chave]/tokens/[id]", handleDELETE);
