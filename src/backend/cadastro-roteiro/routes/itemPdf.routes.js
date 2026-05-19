const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

const router = express.Router();

const PDF_DIR =
  process.env.PDF_DESENHOS_DIR ||
  "\\\\servidorgeral\\Derivados\\Triel-HT\\DESENHOS";

function limparCodigo(codigo) {
  return String(codigo || "")
    .trim()
    .replace(/[^0-9A-Za-z_-]/g, "");
}

function escaparRegex(valor) {
  return String(valor || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function obterSequencia(nomeArquivo, codigo) {
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

async function localizarPdfsDoItem(codigo) {
  const arquivos = await fs.readdir(PDF_DIR);

  const codigoRegex = escaparRegex(codigo);
  const regex = new RegExp(`^${codigoRegex}(?:_\\d+)?\\.pdf$`, "i");

  return arquivos
    .filter((arquivo) => regex.test(arquivo))
    .sort((a, b) => obterSequencia(a, codigo) - obterSequencia(b, codigo))
    .map((arquivo) => path.join(PDF_DIR, arquivo));
}

async function montarPdfUnico(arquivosPdf) {
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

router.get("/item-pdf/:codigo", async (req, res) => {
  try {
    const codigo = limparCodigo(req.params.codigo);

    if (!codigo) {
      return res.status(400).json({
        success: false,
        message: "Código do item inválido.",
      });
    }

    console.log("[PDF] Diretório:", PDF_DIR);
    console.log("[PDF] Código pesquisado:", codigo);

    const arquivosPdf = await localizarPdfsDoItem(codigo);

    console.log("[PDF] Arquivos encontrados:", arquivosPdf);

    if (arquivosPdf.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Não localizou PDFs para abrir.",
        codigo,
      });
    }

    const pdfBytes = await montarPdfUnico(arquivosPdf);
    const buffer = Buffer.from(pdfBytes);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${codigo}_detalhamento.pdf"`
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Length", buffer.length);

    return res.send(buffer);
  } catch (error) {
    console.error("[PDF] Erro ao montar PDF:", error);

    return res.status(500).json({
      success: false,
      message: "Erro ao localizar ou montar PDF do item.",
      error: error.message,
    });
  }
});

module.exports = router;