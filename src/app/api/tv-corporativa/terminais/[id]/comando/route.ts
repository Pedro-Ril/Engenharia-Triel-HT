import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { solicitarComandoAgente } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/*
 * Versão restrita de POST /api/admin/tv/terminais/[id]/comando — só
 * aceita "atualizar_agente" (reiniciar a máquina física fica exclusivo
 * do painel admin, ver COMANDOS_AGENTE), e só pra terminal da própria
 * empresa do usuário (ver solicitarComandoAgente).
 */
async function handlePOST(_request: Request, context: RouteContext) {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do terminal é inválido." },
      { status: 400 }
    );
  }

  if (!acesso.usuario.ehAdministrador && !acesso.usuario.codigoEmpresa) {
    return NextResponse.json(
      { ok: false, message: "Seu usuário não está vinculado a uma empresa." },
      { status: 403 }
    );
  }

  try {
    const codigoEmpresaExigida = acesso.usuario.ehAdministrador
      ? undefined
      : (acesso.usuario.codigoEmpresa ?? undefined);

    const encontrado = await solicitarComandoAgente(id, "atualizar_agente", codigoEmpresaExigida);

    if (!encontrado) {
      return NextResponse.json(
        { ok: false, message: "Terminal não encontrado ou não pareado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Comando enviado — será executado no próximo contato do agente (até alguns minutos).",
    });
  } catch (error) {
    console.error("Erro ao enviar comando pro agente de TV (restrito):", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível enviar o comando." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("tv-corporativa/terminais/[id]/comando", handlePOST);
