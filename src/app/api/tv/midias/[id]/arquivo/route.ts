import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarMidiaParaServir } from "@/lib/tv/midias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const PADRAO_RANGE = /^bytes=(\d+)-(\d*)$/;

/*
 * Suporta o header Range — nenhuma outra rota de arquivo do projeto
 * faz isso hoje (Downloads/anexos sempre mandam o arquivo inteiro),
 * mas vídeo precisa disso pra dar seek/buffer corretamente no player.
 */
async function handleGET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const midia = await buscarMidiaParaServir(id);
  if (!midia) {
    return NextResponse.json({ ok: false, message: "Mídia não encontrada." }, { status: 404 });
  }

  const range = request.headers.get("range");

  if (!range) {
    const stream = Readable.toWeb(
      createReadStream(midia.caminhoCompleto)
    ) as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": midia.tipoMime,
        "Content-Length": String(midia.tamanhoBytes),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = PADRAO_RANGE.exec(range);
  if (!match) {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${midia.tamanhoBytes}` },
    });
  }

  const inicio = Number(match[1]);
  const fim = match[2] ? Number(match[2]) : midia.tamanhoBytes - 1;

  if (inicio >= midia.tamanhoBytes || fim >= midia.tamanhoBytes || inicio > fim) {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${midia.tamanhoBytes}` },
    });
  }

  const stream = Readable.toWeb(
    createReadStream(midia.caminhoCompleto, { start: inicio, end: fim })
  ) as ReadableStream;

  return new NextResponse(stream, {
    status: 206,
    headers: {
      "Content-Type": midia.tipoMime,
      "Content-Range": `bytes ${inicio}-${fim}/${midia.tamanhoBytes}`,
      "Content-Length": String(fim - inicio + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

export const GET = comMetricasApi("tv/midias/[id]/arquivo", handleGET);
