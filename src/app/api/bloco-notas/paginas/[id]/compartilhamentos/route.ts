import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { compartilharPagina, listarCompartilhamentos } from "@/lib/bloco-notas/compartilhamento";
import { ehUuid, idInvalido, MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* Com quem a página está compartilhada (só o dono vê/muda). */
async function handleGET(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!ehUuid(id)) return idInvalido();

  try {
    return NextResponse.json({ ok: true, data: await listarCompartilhamentos(acesso.usuario.id, id) });
  } catch (error) {
    return respostaDeErro(error, "listar compartilhamentos");
  }
}

export const GET = comMetricasApi("bloco-notas/paginas/[id]/compartilhamentos", handleGET);

/* Inclui uma pessoa ou muda a permissão dela: { usuarioId, permissao: "ver" | "editar" }. */
async function handlePOST(request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;
  if (!ehUuid(id)) return idInvalido();

  try {
    const corpo: unknown = await request.json();
    if (!isObject(corpo)) throw new ValidationError("O corpo da requisição deve ser um objeto JSON.");
    if (!ehUuid(corpo.usuarioId)) throw new ValidationError("Escolha a pessoa.");
    if (corpo.permissao !== "ver" && corpo.permissao !== "editar") {
      throw new ValidationError("Permissão inválida.");
    }

    await compartilharPagina(acesso.usuario.id, id, corpo.usuarioId, corpo.permissao);
    return NextResponse.json({ ok: true, data: await listarCompartilhamentos(acesso.usuario.id, id) });
  } catch (error) {
    return respostaDeErro(error, "compartilhar");
  }
}

export const POST = comMetricasApi("bloco-notas/paginas/[id]/compartilhamentos", handlePOST);
