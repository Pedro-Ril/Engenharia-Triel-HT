import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import { buscarUsuariosParaSelecao } from "@/lib/auth/usuarios";
import { escopoDeCopia } from "@/lib/chamados/copia-escopo";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Só exige login (não admin) -- alimenta o seletor de "usuário em
 * cópia"/"abrir em nome de", usado por atendentes e solicitantes
 * comuns.
 *
 * `escopo=copia` prende a lista ao setor de quem está buscando,
 * quando a pessoa não for administrador, atendente ou da gerência
 * (ver copia-escopo.ts). O "abrir em nome de" não passa esse
 * parâmetro e segue enxergando todo mundo -- ele já é restrito a quem
 * tem o direito de abrir chamado por outra pessoa.
 *
 * Isto aqui é o que a TELA mostra; a recusa de verdade está no POST
 * de /api/chamados/[numero]/copia, que não confia no cliente.
 */
async function handleGET(request: Request) {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return NextResponse.json(
      { ok: false, message: "É necessário estar autenticado." },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const termo = url.searchParams.get("q") ?? "";
  const ehParaCopia = url.searchParams.get("escopo") === "copia";

  try {
    if (!ehParaCopia) {
      const usuarios = await buscarUsuariosParaSelecao(termo);
      return NextResponse.json({ ok: true, data: usuarios });
    }

    const escopo = await escopoDeCopia(usuario);

    if (escopo.irrestrito) {
      const usuarios = await buscarUsuariosParaSelecao(termo);
      return NextResponse.json({ ok: true, data: usuarios });
    }

    /*
     * Sem departamento no AD não há setor a que se prender -- devolve
     * vazio em vez de liberar geral, e a tela explica o porquê.
     */
    if (!escopo.departamento) {
      return NextResponse.json({
        ok: true,
        message:
          "Seu usuário está sem setor cadastrado, então não é possível escolher pessoas em cópia. Procure a TI.",
        data: [],
      });
    }

    const usuarios = await buscarUsuariosParaSelecao(termo, escopo.departamento);

    return NextResponse.json({ ok: true, data: usuarios });
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível buscar usuários." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("chamados/usuarios-busca", handleGET);
