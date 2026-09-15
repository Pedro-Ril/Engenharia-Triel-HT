import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { listarCameras } from "@/lib/semaforo/cameras";
import { montarWhepUrl } from "@/lib/semaforo/mediamtx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const cameras = await listarCameras(true);

    const data = await Promise.all(
      cameras
        .sort((a, b) => a.ordem - b.ordem)
        .map(async (camera) => ({
          id: camera.id,
          nome: camera.nome,
          ordem: camera.ordem,
          whepUrl: await montarWhepUrl(camera.mediamtxPath),
        }))
    );

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("Erro ao listar câmeras do Semáforo para visualização:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar as câmeras." },
      { status: 500 }
    );
  }
}
