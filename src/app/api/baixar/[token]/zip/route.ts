import { ZipArchive, type ArchiverError } from "archiver";
import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { PassThrough, Readable } from "node:stream";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarArquivosParaZip } from "@/lib/transferencia/transferencias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ token: string }>;
}

/*
 * Pública, mesmo espírito de `../arquivo/[arquivoId]` — só que gera um
 * .zip com todos os arquivos do lote, em streaming (nunca monta o
 * .zip inteiro em memória nem em disco antes de responder). Por isso
 * não dá pra saber o tamanho final de antemão (sem `Content-Length`)
 * nem oferecer retomada (sem suporte a `Range` aqui, diferente da
 * rota de arquivo individual) — trade-off aceito para poder zipar
 * lotes de qualquer tamanho sem buffer.
 */
async function handleGET(_request: Request, context: RouteContext) {
  const { token } = await context.params;

  const dados = await buscarArquivosParaZip(token);
  if (!dados) {
    return NextResponse.json(
      { ok: false, message: "Este link expirou ou não existe." },
      { status: 404 }
    );
  }

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const saida = new PassThrough();

  archive.on("warning", (aviso: ArchiverError) =>
    console.error("Aviso ao gerar .zip de transferência:", aviso)
  );
  archive.on("error", (erro: ArchiverError) => {
    console.error("Erro ao gerar .zip de transferência:", erro);
    saida.destroy(erro);
  });
  archive.pipe(saida);

  const nomesUsados = new Map<string, number>();

  for (const arquivo of dados.arquivos) {
    let nomeNoZip = arquivo.nomeOriginal;
    const usos = nomesUsados.get(nomeNoZip) ?? 0;
    if (usos > 0) {
      const extensao = nomeNoZip.includes(".") ? nomeNoZip.slice(nomeNoZip.lastIndexOf(".")) : "";
      const base = extensao ? nomeNoZip.slice(0, -extensao.length) : nomeNoZip;
      nomeNoZip = `${base} (${usos})${extensao}`;
    }
    nomesUsados.set(arquivo.nomeOriginal, usos + 1);

    archive.append(createReadStream(arquivo.caminhoCompleto), { name: nomeNoZip });
  }

  archive.finalize();

  const stream = Readable.toWeb(saida) as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="arquivos.zip"`,
    },
  });
}

export const GET = comMetricasApi("baixar/[token]/zip", handleGET);
