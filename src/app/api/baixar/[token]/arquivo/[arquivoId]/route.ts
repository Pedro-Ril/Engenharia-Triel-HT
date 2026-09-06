import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarArquivoParaServir } from "@/lib/transferencia/transferencias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ token: string; arquivoId: string }>;
}

const PADRAO_RANGE = /^bytes=(\d+)-(\d*)$/;

/*
 * Pública de propósito — o link de download é feito pra funcionar
 * sem login (pode ir pra fora da empresa), a proteção é só o token
 * opaco de 256 bits na URL. Um lote pode ter vários arquivos (ver
 * portal_transferencia_arquivos), então cada arquivo é baixado
 * individualmente por `arquivoId` — quem quiser tudo de uma vez usa a
 * rota de .zip (`../zip`). Suporta Range (mesmo padrão de
 * src/app/api/tv/midias/[id]/arquivo/route.ts) — importante aqui
 * porque os arquivos podem ser bem grandes.
 */
async function handleGET(request: Request, context: RouteContext) {
  const { token, arquivoId } = await context.params;

  const arquivo = await buscarArquivoParaServir(token, arquivoId);
  if (!arquivo) {
    return NextResponse.json(
      { ok: false, message: "Este link expirou ou não existe." },
      { status: 404 }
    );
  }

  const caminhoCompleto = arquivo.caminhoCompleto;
  const tamanhoBytes = arquivo.tamanhoBytes;
  const nomeArquivo = encodeURIComponent(arquivo.nomeOriginal);

  const range = request.headers.get("range");

  if (!range) {
    const stream = Readable.toWeb(createReadStream(caminhoCompleto)) as ReadableStream;

    return new NextResponse(stream, {
      headers: {
        "Content-Type": arquivo.tipoMime,
        "Content-Length": String(tamanhoBytes),
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  const match = PADRAO_RANGE.exec(range);
  if (!match) {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${tamanhoBytes}` },
    });
  }

  const inicio = Number(match[1]);
  const fim = match[2] ? Number(match[2]) : tamanhoBytes - 1;

  if (inicio >= tamanhoBytes || fim >= tamanhoBytes || inicio > fim) {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${tamanhoBytes}` },
    });
  }

  const stream = Readable.toWeb(
    createReadStream(caminhoCompleto, { start: inicio, end: fim })
  ) as ReadableStream;

  return new NextResponse(stream, {
    status: 206,
    headers: {
      "Content-Type": arquivo.tipoMime,
      "Content-Range": `bytes ${inicio}-${fim}/${tamanhoBytes}`,
      "Content-Length": String(fim - inicio + 1),
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Accept-Ranges": "bytes",
    },
  });
}

export const GET = comMetricasApi("baixar/[token]/arquivo/[arquivoId]", handleGET);
