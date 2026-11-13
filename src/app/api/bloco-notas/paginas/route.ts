import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject, optionalText } from "@/lib/auth/validation";
import { criarPagina, listarPaginas, TAMANHO_TITULO } from "@/lib/bloco-notas/bloco-notas";
import { ehUuid, MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Árvore de páginas do PRÓPRIO usuário (resumo, sem conteúdo) + quantas estão na lixeira. */
async function handleGET() {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  try {
    return NextResponse.json({ ok: true, data: await listarPaginas(acesso.usuario.id) });
  } catch (error) {
    return respostaDeErro(error, "listar páginas");
  }
}

export const GET = comMetricasApi("bloco-notas/paginas", handleGET);

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  try {
    const corpo: unknown = await request.json().catch(() => ({}));
    if (!isObject(corpo)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");

    const paiId = corpo.paiId ?? null;
    if (paiId !== null && !ehUuid(paiId)) throw new ValidationError("Página de destino inválida.");

    const pagina = await criarPagina(acesso.usuario.id, {
      paiId,
      titulo: optionalText(corpo.titulo, "título", TAMANHO_TITULO) ?? "",
    });

    return NextResponse.json({ ok: true, data: pagina }, { status: 201 });
  } catch (error) {
    return respostaDeErro(error, "criar página");
  }
}

export const POST = comMetricasApi("bloco-notas/paginas", handlePOST);
