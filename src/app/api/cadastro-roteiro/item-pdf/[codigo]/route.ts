import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";

const PDF_DIR =
  process.env.PDF_DESENHOS_DIR ||
  "\\\\servidorgeral\\Derivados\\Triel-HT\\DESENHOS";

function limparCodigo(codigo: string) {
  return String(codigo || "")
    .trim()
    .replace(/[^0-9A-Za-z_-]/g, "");
}

function escaparRegex(valor: string) {
  return String(valor || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function obterSequencia(nomeArquivo: string, codigo: string) {
  const nome = String(nomeArquivo || "").toLowerCase();
  const codigoLower = String(codigo || "").toLowerCase();

  if (nome === `${codigoLower}.pdf`) return 0;

  const regex = new RegExp(
    `^${escaparRegex(codigoLower)}_(\\d+)\\.pdf$`,
    "i"
  );

  const match = nome.match(regex);

  return match ? Number(match[1]) : 999999;
}

async function localizarPdfsDoItem(codigo: string) {
  const arquivos = await fs.readdir(PDF_DIR);

  const codigoRegex = escaparRegex(codigo);
  const regex = new RegExp(`^${codigoRegex}(?:_\\d+)?\\.pdf$`, "i");

  return arquivos
    .filter((arquivo) => regex.test(arquivo))
    .sort((a, b) => obterSequencia(a, codigo) - obterSequencia(b, codigo))
    .map((arquivo) => path.join(PDF_DIR, arquivo));
}

async function montarPdfUnico(arquivosPdf: string[]) {
  const pdfFinal = await PDFDocument.create();

  for (const arquivo of arquivosPdf) {
    console.log("[PDF] Adicionando arquivo:", arquivo);

    const bytes = await fs.readFile(arquivo);

    const pdfOrigem = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
    });

    const paginas = await pdfFinal.copyPages(
      pdfOrigem,
      pdfOrigem.getPageIndices()
    );

    paginas.forEach((pagina) => pdfFinal.addPage(pagina));
  }

  return pdfFinal.save();
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  const acesso = await verificarAcessoModuloApi("cadastro-roteiro");
  if (acesso.negado) return acesso.negado;

  try {
    const { codigo: codigoParam } = await context.params;
    const codigo = limparCodigo(codigoParam);

    if (!codigo) {
      return NextResponse.json(
        {
          success: false,
          message: "Código do item inválido.",
        },
        { status: 400 }
      );
    }

    console.log("[PDF] Diretório:", PDF_DIR);
    console.log("[PDF] Código pesquisado:", codigo);

    const arquivosPdf = await localizarPdfsDoItem(codigo);

    if (arquivosPdf.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Não localizou PDFs para abrir.",
          codigo,
        },
        { status: 404 }
      );
    }

    const pdfBytes = await montarPdfUnico(arquivosPdf);
    const buffer = Buffer.from(pdfBytes);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${codigo}_detalhamento.pdf"`,
        "Cache-Control": "no-store",
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error: any) {
    console.error("[PDF] Erro ao montar PDF:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Erro ao localizar ou montar PDF do item.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}