import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { buscarPessoasParaCompartilhar } from "@/lib/bloco-notas/compartilhamento";
import { MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Pessoas ativas do portal para "Compartilhar com": ?q= (mínimo 2 letras). */
async function handleGET(request: Request) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  try {
    const termo = new URL(request.url).searchParams.get("q") ?? "";
    return NextResponse.json({ ok: true, data: await buscarPessoasParaCompartilhar(acesso.usuario.id, termo) });
  } catch (error) {
    return respostaDeErro(error, "buscar pessoas");
  }
}

export const GET = comMetricasApi("bloco-notas/pessoas", handleGET);
