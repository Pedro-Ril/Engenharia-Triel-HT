import { NextResponse } from "next/server";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { gerarManifestoAtualizacaoXml } from "@/lib/tv/extensao-captura";
import { buscarConfigTv } from "@/lib/tv/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Manifesto de atualização (protocolo Omaha) que o Chrome consulta
 * periodicamente por causa da política ExtensionInstallForcelist (ver
 * instalar.sh) — aponta pra extensao.crx. Resposta estática (não lê
 * nada da query string que o Chrome manda) — mesmo padrão usado por
 * quem hospeda atualização de extensão fora da Web Store. Rota
 * pública (prefixo "/api/tv"): quem consulta é o Chrome do mini-PC.
 */
async function handleGET(request: Request) {
  const config = await buscarConfigTv();
  const portalUrl = config.urlAgente || new URL(request.url).origin;

  return new NextResponse(gerarManifestoAtualizacaoXml(portalUrl), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}

export const GET = comMetricasApi("tv/agente/extensao-captura.update", handleGET);
