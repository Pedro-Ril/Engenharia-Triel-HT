import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { registrarLog } from "@/lib/monitoramento/logs";
import { inteiroEntre, lerCorpoJson, respostaDeErro, rotaDoCatalogo, validarConfigEspecifica } from "@/lib/rotas-avulsas/admin";
import { buscarConfigRotaAvulsa, salvarConfigRotaAvulsa } from "@/lib/rotas-avulsas/rotas-avulsas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ chave: string }> };

/* Configuração de uma rota avulsa: liga/desliga, limites de requisição e a configuração própria dela. */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { chave } = await context.params;
    rotaDoCatalogo(chave);
    const config = await buscarConfigRotaAvulsa(chave);
    if (!config) return NextResponse.json({ ok: false, message: "Rota não cadastrada no banco." }, { status: 404 });
    return NextResponse.json({ ok: true, data: config });
  } catch (erro) {
    return respostaDeErro(erro, "buscar a configuração da rota avulsa", "Não foi possível buscar a configuração.");
  }
}

async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const { chave } = await context.params;
    const rota = rotaDoCatalogo(chave);
    const corpo = await lerCorpoJson(request);

    if (typeof corpo.ativo !== "boolean") throw new ValidationError("Informe se a rota fica ligada ou desligada.");

    const limitePorSegundo = inteiroEntre(corpo.limitePorSegundo, "requisições por segundo", 1, 50);
    const rajada = inteiroEntre(corpo.rajada, "rajada", 1, 200);
    const limitePorMinuto = inteiroEntre(corpo.limitePorMinuto, "requisições por minuto", 1, 10000);
    if (rajada < limitePorSegundo) throw new ValidationError("A rajada não pode ser menor que o limite por segundo.");

    const config = await salvarConfigRotaAvulsa({
      chave,
      ativo: corpo.ativo,
      limitePorSegundo,
      rajada,
      limitePorMinuto,
      config: validarConfigEspecifica(chave, corpo.config),
      atualizadoPor: acesso.usuario.samAccountName,
    });
    if (!config) return NextResponse.json({ ok: false, message: "Rota não cadastrada no banco." }, { status: 404 });

    await registrarLog({
      nivel: "info",
      origem: "rotas-avulsas",
      mensagem: `Configuração da rota "${rota.nome}" alterada por ${acesso.usuario.samAccountName} (${config.ativo ? "ligada" : "desligada"}).`,
      detalhes: JSON.stringify(config),
    });

    return NextResponse.json({ ok: true, message: "Configuração salva.", data: config });
  } catch (erro) {
    return respostaDeErro(erro, "salvar a configuração da rota avulsa", "Não foi possível salvar a configuração.");
  }
}

export const GET = comMetricasApi("admin/rotas-avulsas/[chave]", handleGET);
export const PATCH = comMetricasApi("admin/rotas-avulsas/[chave]", handlePATCH);
