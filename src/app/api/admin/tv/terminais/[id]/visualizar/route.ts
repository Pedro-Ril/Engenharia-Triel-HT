import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/autorizacao";
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
 * Chamada repetidamente (poll curto) pela tela de visualização ao
 * vivo enquanto ela estiver aberta — cada chamada renova o carimbo
 * que o terminal confere em GET /api/tv/deve-transmitir. Fechar a
 * tela (ou cair a conexão do admin) simplesmente para de renovar, e
 * o terminal encerra a transmissão sozinho quando o carimbo envelhece
 * (ver JANELA_VISUALIZACAO_MS em src/lib/tv/terminais.ts).
 */
async function handlePOST(_request: Request, context: RouteContext) {
  const acesso = await requireAdminApi();
  if (acesso.negado) return acesso.negado;

  const { id } = await context.params;

  if (!uniqueIdentifierPattern.test(id)) {
    return NextResponse.json(
      { ok: false, message: "O identificador do terminal é inválido." },
      { status: 400 }
    );
  }

  try {
    const encontrado = await solicitarVisualizacao(id);

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
    console.error("Erro ao solicitar visualização ao vivo de terminal de TV:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível iniciar a visualização ao vivo." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("admin/tv/terminais/[id]/visualizar", handlePOST);
