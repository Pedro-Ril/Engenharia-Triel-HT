import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import {
  atualizarPagina,
  buscarPagina,
  enviarParaLixeira,
  moverPagina,
  TAMANHO_TITULO,
} from "@/lib/bloco-notas/bloco-notas";
import { ehUuid, idInvalido, MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!ehUuid(id)) return idInvalido();

  try {
    const pagina = await buscarPagina(acesso.usuario.id, id);
    /* Página de outra pessoa responde igual a "não existe". */
    if (!pagina) {
      return NextResponse.json({ ok: false, message: "Página não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: pagina });
  } catch (error) {
    return respostaDeErro(error, "abrir página");
  }
}

export const GET = comMetricasApi("bloco-notas/paginas/[id]", handleGET);

/*
 * Gravação (automática, enquanto a pessoa escreve): titulo, conteudo
 * (com `versao` -- a que a tela abriu -- ou `forcar`), favorita. `paiId`
 * (inclusive null = raiz) move a página de lugar.
 */
async function handlePATCH(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!ehUuid(id)) return idInvalido();

  try {
    const corpo: unknown = await request.json();
    if (!isObject(corpo)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");

    if ("paiId" in corpo) {
      const paiId = corpo.paiId ?? null;
      if (paiId !== null && !ehUuid(paiId)) throw new ValidationError("Página de destino inválida.");
      await moverPagina(acesso.usuario.id, id, paiId);
      return NextResponse.json({ ok: true, message: "Página movida." });
    }

    if (corpo.titulo !== undefined && typeof corpo.titulo !== "string") {
      throw new ValidationError("Título inválido.");
    }
    if (typeof corpo.titulo === "string" && corpo.titulo.length > TAMANHO_TITULO * 2) {
      throw new ValidationError(`O título pode ter até ${TAMANHO_TITULO} caracteres.`);
    }
    if (corpo.conteudo !== undefined && typeof corpo.conteudo !== "string") {
      throw new ValidationError("Conteúdo inválido.");
    }
    if (corpo.favorita !== undefined && typeof corpo.favorita !== "boolean") {
      throw new ValidationError("O campo favorita deve ser verdadeiro ou falso.");
    }
    if (corpo.versao !== undefined && !Number.isInteger(corpo.versao)) {
      throw new ValidationError("Versão inválida.");
    }

    const resultado = await atualizarPagina(acesso.usuario.id, id, {
      titulo: corpo.titulo as string | undefined,
      conteudo: corpo.conteudo as string | undefined,
      favorita: corpo.favorita as boolean | undefined,
      versaoEsperada: corpo.versao as number | undefined,
      forcar: corpo.forcar === true,
      colaborativo: corpo.colaborativo === true,
    });

    return NextResponse.json({ ok: true, data: resultado });
  } catch (error) {
    return respostaDeErro(error, "salvar página");
  }
}

export const PATCH = comMetricasApi("bloco-notas/paginas/[id]", handlePATCH);

/* "Excluir" = mandar para a lixeira (com as subpáginas). */
async function handleDELETE(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!ehUuid(id)) return idInvalido();

  try {
    const total = await enviarParaLixeira(acesso.usuario.id, id);
    return NextResponse.json({ ok: true, message: "Página enviada para a lixeira.", data: { total } });
  } catch (error) {
    return respostaDeErro(error, "excluir página");
  }
}

export const DELETE = comMetricasApi("bloco-notas/paginas/[id]", handleDELETE);
