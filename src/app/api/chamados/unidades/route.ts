import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { buscarUsuarioPorId } from "@/lib/auth/usuarios";
import { getSetoresQueAtende } from "@/lib/chamados/autorizacao-chamados";
import { optionalUuid } from "@/lib/chamados/validacao";
import { opcoesUnidadeParaChamado } from "@/lib/empresas/unidades";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Opções de unidade para o formulário de abertura. Sem parâmetro: as do
 * próprio usuário logado (anônimo -> nenhuma). Com ?usuarioId=: as do
 * alvo do "abrir em nome de" -- só para quem pode fazer isso (atendente
 * de algum setor ou admin), a mesma regra de POST /api/chamados.
 */
async function handleGET(request: Request) {
  try {
    const usuario = await getUsuarioAutenticado();
    const usuarioIdAlvo = optionalUuid(new URL(request.url).searchParams.get("usuarioId"), "usuário");

    if (!usuario) {
      return NextResponse.json({ ok: true, data: await opcoesUnidadeParaChamado(null) });
    }

    if (!usuarioIdAlvo || usuarioIdAlvo.toLowerCase() === usuario.id.toLowerCase()) {
      return NextResponse.json({ ok: true, data: await opcoesUnidadeParaChamado(usuario) });
    }

    const setoresAtendidos = await getSetoresQueAtende(usuario);
    if (setoresAtendidos !== null && setoresAtendidos.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Você não pode abrir chamado em nome de outra pessoa." },
        { status: 403 }
      );
    }

    const alvo = await buscarUsuarioPorId(usuarioIdAlvo);
    if (!alvo) {
      return NextResponse.json({ ok: false, message: "Usuário não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: await opcoesUnidadeParaChamado(alvo) });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao listar unidades para chamado:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar as unidades." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("chamados/unidades", handleGET);
