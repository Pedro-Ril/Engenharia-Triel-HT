import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { buscarImagemNota } from "@/lib/bloco-notas/imagens";
import { ehUuid, idInvalido, MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Só o dono vê a imagem; de outra pessoa responde como inexistente. */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!ehUuid(id)) return idInvalido();

  try {
    const imagem = await buscarImagemNota(acesso.usuario.id, id);
    if (!imagem) {
      return NextResponse.json({ ok: false, message: "Imagem não encontrada." }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(imagem.conteudo), {
      headers: {
        "Content-Type": imagem.tipoMime,
        /* private: navegador da própria pessoa guarda, proxy/cache compartilhado não. */
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return respostaDeErro(error, "abrir imagem");
  }
}

export const GET = comMetricasApi("bloco-notas/imagens/[id]", handleGET);
