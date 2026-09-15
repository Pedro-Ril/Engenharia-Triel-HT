import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { buscarConfigSemaforo } from "@/lib/semaforo/config";
import { listarCameras } from "@/lib/semaforo/cameras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WHEP_BASE_URL_PADRAO = "http://127.0.0.1:8889";

/*
 * Só câmeras ativas, e só {id, nome, ordem, whepUrl} -- nunca host,
 * usuário, senha ou stream_uri_rtsp. A URL WHEP é montada aqui (path do
 * MediaMTX + base configurada em admin/semaforo/config), o navegador só
 * faz um POST de SDP offer nela, sem nunca saber o endereço real da câmera.
 */
export async function GET() {
  const acesso = await verificarAcessoModuloApi("semaforo");
  if (acesso.negado) return acesso.negado;

  try {
    const [cameras, config] = await Promise.all([listarCameras(true), buscarConfigSemaforo()]);
    const whepBaseUrl = config.mediamtxWhepBaseUrl || process.env.MEDIAMTX_WHEP_BASE_URL || WHEP_BASE_URL_PADRAO;

    const data = cameras
      .sort((a, b) => a.ordem - b.ordem)
      .map((camera) => ({
        id: camera.id,
        nome: camera.nome,
        ordem: camera.ordem,
        whepUrl: `${whepBaseUrl}/${camera.mediamtxPath}/whep`,
      }));

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Erro ao listar câmeras do Semáforo para visualização:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar as câmeras." },
      { status: 500 }
    );
  }
}
