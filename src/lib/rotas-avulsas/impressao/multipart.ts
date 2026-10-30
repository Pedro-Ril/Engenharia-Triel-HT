import "server-only";

import { Readable } from "node:stream";
import type { ReadableStream as ReadableStreamNode } from "node:stream/web";

import busboy from "busboy";

/*
 * Lê o multipart/form-data da impressão em memória, com teto: um único
 * arquivo (campo "arquivo"), poucos campos de texto curtos. Passou do
 * tamanho, para de ler e devolve 413 — não espera o resto chegar.
 */
export class ErroMultipart extends Error {
  constructor(
    public readonly status: number,
    mensagem: string
  ) {
    super(mensagem);
    this.name = "ErroMultipart";
  }
}

export interface MultipartImpressao {
  campos: Record<string, string>;
  arquivo: { nome: string; tipo: string; dados: Buffer } | null;
}

/* busboy decodifica o filename como Latin-1; o cliente normalmente mandou UTF-8. */
function corrigirNomeArquivo(nome: string): string {
  try {
    return Buffer.from(nome, "latin1").toString("utf8");
  } catch {
    return nome;
  }
}

export function lerMultipart(request: Request, maxBytesArquivo: number): Promise<MultipartImpressao> {
  return new Promise((resolve, reject) => {
    if (!request.body) {
      reject(new ErroMultipart(400, "Requisição sem corpo."));
      return;
    }

    let bb: busboy.Busboy;
    try {
      bb = busboy({
        headers: Object.fromEntries(request.headers),
        limits: { files: 1, fileSize: maxBytesArquivo, fields: 10, fieldSize: 1024, parts: 12, headerPairs: 50 },
      });
    } catch {
      reject(new ErroMultipart(400, "Corpo multipart/form-data inválido."));
      return;
    }

    const origem = Readable.fromWeb(request.body as unknown as ReadableStreamNode);
    const campos: Record<string, string> = {};
    let arquivo: MultipartImpressao["arquivo"] = null;
    let erro: ErroMultipart | null = null;
    let leituraArquivo: Promise<void> = Promise.resolve();

    const abortar = (falha: ErroMultipart) => {
      if (!erro) erro = falha;
    };

    bb.on("field", (nome, valor, info) => {
      if (info.valueTruncated) abortar(new ErroMultipart(400, `O campo ${nome} é longo demais.`));
      campos[nome] = valor;
    });

    bb.on("file", (nome, stream, info) => {
      if (nome !== "arquivo" || arquivo || erro) {
        if (nome !== "arquivo") abortar(new ErroMultipart(400, `Campo de arquivo inesperado: ${nome}. Use "arquivo".`));
        stream.resume();
        return;
      }
      const pedacos: Buffer[] = [];
      leituraArquivo = new Promise((fim) => {
        stream.on("data", (pedaco: Buffer) => pedacos.push(pedaco));
        stream.on("limit", () => {
          /* Para de ler o upload na hora: não adianta receber (e descartar) o resto. */
          origem.unpipe(bb);
          origem.destroy();
          reject(new ErroMultipart(413, `O arquivo passa do tamanho máximo de ${Math.round(maxBytesArquivo / 1024 / 1024)} MB.`));
        });
        stream.on("close", () => {
          arquivo = {
            nome: corrigirNomeArquivo(info.filename || "documento.pdf").slice(0, 255),
            tipo: info.mimeType || "application/octet-stream",
            dados: Buffer.concat(pedacos),
          };
          fim();
        });
      });
    });

    bb.on("filesLimit", () => abortar(new ErroMultipart(400, "Envie um único arquivo por requisição.")));
    bb.on("fieldsLimit", () => abortar(new ErroMultipart(400, "Campos demais na requisição.")));
    bb.on("partsLimit", () => abortar(new ErroMultipart(400, "Partes demais na requisição.")));
    bb.on("error", () => reject(new ErroMultipart(400, "Corpo multipart/form-data inválido.")));
    bb.on("close", () => {
      leituraArquivo.then(() => {
        if (erro) reject(erro);
        else resolve({ campos, arquivo });
      });
    });

    origem.on("error", () => bb.destroy(new Error("leitura")));
    origem.pipe(bb);
  });
}
