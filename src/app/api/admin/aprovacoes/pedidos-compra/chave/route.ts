import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { gerarChaveExterna, revogarChaveExterna } from "@/lib/aprovacoes/pedidos-compra-admin";
import { registrarLog } from "@/lib/monitoramento/logs";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Gera a chave do SupriConnect. O valor só aparece nesta resposta --
 * no banco fica o hash -- e a chave anterior para de valer na hora.
 */
async function handlePOST(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const resultado = await gerarChaveExterna(acesso.usuario.nomeExibicao);

    await registrarLog({
      nivel: "aviso",
      origem: "aprovacoes/pedidos-compra",
      mensagem: `Nova chave do SupriConnect gerada por ${acesso.usuario.nomeExibicao} (final ${resultado.config.chaveExternaFinal}).`,
      metodo: "POST",
      caminho: new URL(request.url).pathname,
    });

    return NextResponse.json({ ok: true, message: "Chave gerada.", data: resultado });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao gerar a chave do SupriConnect:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível gerar a chave do SupriConnect." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/aprovacoes/pedidos-compra/chave", handlePOST);

/* Revoga a chave: o SupriConnect deixa de conseguir enviar e consultar. */
async function handleDELETE(request: Request) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  try {
    const config = await revogarChaveExterna();

    await registrarLog({
      nivel: "aviso",
      origem: "aprovacoes/pedidos-compra",
      mensagem: `Chave do SupriConnect revogada por ${acesso.usuario.nomeExibicao}.`,
      metodo: "DELETE",
      caminho: new URL(request.url).pathname,
    });

    return NextResponse.json({ ok: true, message: "Chave revogada.", data: config });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao revogar a chave do SupriConnect:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível revogar a chave do SupriConnect." },
      { status: 500 }
    );
  }
}

export const DELETE = comMetricasApi("admin/aprovacoes/pedidos-compra/chave", handleDELETE);
