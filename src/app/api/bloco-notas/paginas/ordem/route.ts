import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";
import { reordenarPaginas } from "@/lib/bloco-notas/bloco-notas";
import { ehUuid, MODULO_BLOCO_NOTAS, respostaDeErro } from "@/lib/bloco-notas/rota";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Nova ordem das páginas irmãs (arrastar na lista): { paiId: id | null, ids: [...] }. */
async function handlePUT(request: Request) {
  const acesso = await verificarAcessoModuloApi(MODULO_BLOCO_NOTAS);
  if (acesso.negado) return acesso.negado;

  try {
    const corpo: unknown = await request.json();
    if (!isObject(corpo) || !Array.isArray(corpo.ids)) {
      throw new ValidationError("Informe a nova ordem das páginas.");
    }

    const paiId = corpo.paiId ?? null;
    if (paiId !== null && !ehUuid(paiId)) throw new ValidationError("Página de destino inválida.");
    if (corpo.ids.length > 1000 || !corpo.ids.every(ehUuid)) {
      throw new ValidationError("A lista de páginas contém um valor inválido.");
    }

    await reordenarPaginas(acesso.usuario.id, paiId, corpo.ids as string[]);
    return NextResponse.json({ ok: true, message: "Ordem salva." });
  } catch (error) {
    return respostaDeErro(error, "reordenar páginas");
  }
}

export const PUT = comMetricasApi("bloco-notas/paginas/ordem", handlePUT);
