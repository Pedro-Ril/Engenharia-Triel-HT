import { NextResponse } from "next/server";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { gerarCrxAssinado } from "@/lib/tv/extensao-captura";
import { buscarConfigTv } from "@/lib/tv/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Pacote .crx assinado (formato CRX3) da extensão de captura de tela —
 * baixado automaticamente pelo Chrome dos terminais via a política
 * ExtensionInstallForcelist (ver instalar.sh e update.xml/route.ts),
 * não por download manual. Rota pública (prefixo "/api/tv"): quem
 * busca é o próprio Chrome do mini-PC, sem sessão nenhuma no portal.
 */
async function handleGET(request: Request) {
  const config = await buscarConfigTv();
  const portalUrl = config.urlAgente || new URL(request.url).origin;

  const crx = new Uint8Array(gerarCrxAssinado(portalUrl));

  return new NextResponse(crx, {
    headers: {
      "content-type": "application/x-chrome-extension",
      "content-disposition": 'attachment; filename="extensao-captura.crx"',
    },
  });
}

export const GET = comMetricasApi("tv/agente/extensao-captura.crx", handleGET);
