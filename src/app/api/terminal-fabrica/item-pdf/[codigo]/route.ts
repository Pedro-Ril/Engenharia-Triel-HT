import { NextRequest, NextResponse } from "next/server";
import {
  limparCodigoPdf,
  localizarPdfsDoItem,
  montarPdfUnico,
} from "@/lib/pdf/roteiro-pdf";

/*
 * Rota pública (sem login) — o terminal de fábrica é um kiosk
 * de uso compartilhado no chão de fábrica, sem usuário logado
 * (ver src/lib/auth/rotas-publicas.ts, prefixo
 * "/api/terminal-fabrica"). Mesma lógica de busca/junção de
 * PDF do cadastro-roteiro, só que sem a checagem de permissão
 * por módulo.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const { codigo: codigoParam } = await context.params;
    const codigo = limparCodigoPdf(codigoParam);

    if (!codigo) {
      return NextResponse.json(
        {
          success: false,
          message: "Código do item inválido.",
        },
        { status: 400 }
      );
    }

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
  } catch (error) {
    console.error("[Terminal Fábrica][PDF] Erro ao montar PDF:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Erro ao localizar ou montar PDF do item.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
