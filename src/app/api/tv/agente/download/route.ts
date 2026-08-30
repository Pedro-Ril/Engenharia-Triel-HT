import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Serve o script do agente nativo direto do repositório (tv-agente/
 * agente.mjs) — é o mesmo arquivo pra Windows e Linux (Node.js
 * multiplataforma), então "plataforma" aqui só existe pra manter dois
 * botões separados no admin (e aparecer separado no monitoramento de
 * APIs) — não muda o conteúdo servido. Rota pública (ver
 * PREFIXOS_PUBLICOS em rotas-publicas.ts, prefixo "/api/tv"): quem
 * baixa é um mini-PC recém-formatado, sem sessão nenhuma no portal.
 */
async function handleGET() {
  try {
    const caminho = path.join(process.cwd(), "tv-agente", "agente.mjs");
    const conteudo = await readFile(caminho, "utf8");

    return new NextResponse(conteudo, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "content-disposition": 'attachment; filename="agente.mjs"',
      },
    });
  } catch (error) {
    console.error("Erro ao servir o agente de TV Corporativa:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível baixar o agente." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv/agente/download", handleGET);
