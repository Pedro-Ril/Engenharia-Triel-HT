import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarConfigTv } from "@/lib/tv/config";
import { criarTokenVisualizacao } from "@/lib/tv/terminal-token";
import { solicitarVisualizacao } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uniqueIdentifierPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/*
 * Versão restrita de POST /api/admin/tv/terminais/[id]/visualizar —
 * mesma lógica, só que gated por verificarAcessoModuloApi (não
 * requireAdminApi) e limitada a terminal da própria empresa do
 * usuário (ver solicitarVisualizacao).
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

    const encontrado = await solicitarVisualizacao(id, codigoEmpresaExigida);

    if (!encontrado) {
      return NextResponse.json(
        { ok: false, message: "Terminal não encontrado ou não pareado." },
        { status: 404 }
      );
    }

    const config = await buscarConfigTv();

    if (!config.signalingUrl) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Configure a URL do servidor de sinalização em TV Corporativa → Configurações antes de visualizar ao vivo.",
        },
        { status: 400 }
      );
    }

    const token = await criarTokenVisualizacao(id);

    return NextResponse.json({
      ok: true,
      data: { signalingUrl: config.signalingUrl, token },
    });
  } catch (error) {
    console.error("Erro ao solicitar visualização ao vivo de terminal de TV (restrito):", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível iniciar a visualização ao vivo." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("tv-corporativa/terminais/[id]/visualizar", handlePOST);
