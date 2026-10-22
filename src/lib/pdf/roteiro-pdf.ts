import "server-only";

import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";

/*
 * Compartilhado entre a rota de PDF do cadastro-roteiro (com
 * login) e a do terminal de fábrica (pública/kiosk) — mesma
 * pasta de desenhos, mesma regra de nomes de arquivo
 * ("CODIGO.pdf", "CODIGO_1.pdf", "CODIGO_2.pdf", ...), mesma
 * junção de todas as folhas num único PDF.
 */
const PDF_DIR =
  process.env.PDF_DESENHOS_DIR ||
  "\\\\servidorgeral\\Derivados\\Triel-HT\\DESENHOS";

export function limparCodigoPdf(codigo: string): string {
  return String(codigo || "")
    .trim()
    .replace(/[^0-9A-Za-z_-]/g, "");
}

/*
 * Os PDFs do item são "CODIGO.pdf" e "CODIGO_N.pdf". Em vez de listar a
 * pasta -- mais de 265 mil arquivos na rede, ~8 s por clique --, pergunta
 * por cada nome possível. A listagem prendia as poucas threads de disco
 * e rede do Node: com alguns cliques seguidos, até a conexão com o banco
 * ficava na fila, dava timeout e o portal inteiro caía. Cada consulta
 * direta leva poucos milissegundos.
 *
 * As folhas nem sempre começam em _1 e têm buracos (na pasta há código
 * que começa em _3 e salto de 11 números), então a busca anda em blocos
 * e só para depois de dois blocos seguidos sem nenhum arquivo (há
 * código cuja primeira folha é a _16 ou a _18). O número
 * também aparece com zeros à esquerda ("_00000", "_000001", "_01"):
 * cada sequência é procurada nas larguras que existem na pasta.
 */
const BLOCO_SEQUENCIAS = 12;
const MAXIMO_SEQUENCIAS = 300;
const BLOCOS_VAZIOS_PARA_PARAR = 2;
const LARGURAS_COM_ZEROS = [2, 3, 5, 6];

function nomesDaSequencia(codigo: string, sequencia: number): string[] {
  const simples = String(sequencia);
  const larguras = LARGURAS_COM_ZEROS.filter((largura) => largura > simples.length);

  return [simples, ...larguras.map((largura) => simples.padStart(largura, "0"))].map(
    (numero) => `${codigo}_${numero}.pdf`
  );
}

async function arquivoExiste(caminho: string): Promise<boolean> {
  try {
    return (await fs.stat(caminho)).isFile();
  } catch {
    return false;
  }
}

export async function localizarPdfsDoItem(codigo: string): Promise<string[]> {
  const encontrados: string[] = [];
  let blocosVazios = 0;

  const base = path.join(PDF_DIR, `${codigo}.pdf`);
  if (await arquivoExiste(base)) encontrados.push(base);

  for (let inicio = 0; inicio <= MAXIMO_SEQUENCIAS; inicio += BLOCO_SEQUENCIAS) {
    /* Em ordem de sequência: a ordem das folhas no PDF final. */
    const caminhos = Array.from({ length: BLOCO_SEQUENCIAS }, (_, i) =>
      nomesDaSequencia(codigo, inicio + i)
    )
      .flat()
      .map((nome) => path.join(PDF_DIR, nome));
    const existem = await Promise.all(caminhos.map(arquivoExiste));
    const doBloco = caminhos.filter((_, i) => existem[i]);

    if (doBloco.length === 0) {
      blocosVazios += 1;
      if (blocosVazios >= BLOCOS_VAZIOS_PARA_PARAR) break;
      continue;
    }

    blocosVazios = 0;
    encontrados.push(...doBloco);
  }

  return encontrados;
}

export async function montarPdfUnico(arquivosPdf: string[]): Promise<Uint8Array> {
  const pdfFinal = await PDFDocument.create();

  for (const arquivo of arquivosPdf) {
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
