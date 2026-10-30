import "server-only";

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { normalizarNumeroNf } from "./extrato-regras";

/*
 * Localiza o PDF de uma NF de saída nossa na pasta de rede do financeiro.
 * Organização da pasta (\\SERVIDORGERAL\Triel\Financeiro\publico\NFE\Matriz):
 *   {ano}\{mês}\NF {número} - {cliente}[ - {nº do equipamento}].PDF
 * O nome da pasta do mês varia ("Fevereiro 2025", "5 - Maio"), e na mesma
 * pasta ficam "Manifesto NF ...", "Boleto NF ...", "CCe NF ..." -- por isso
 * o arquivo precisa COMEÇAR com "NF {número}".
 */

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* A pasta é do mês? Aceita o nome ("Fevereiro 2025", "MARÇO") ou o número na frente ("5 - Maio", "05"). */
export function pastaEhDoMes(nomePasta: string, mes: number): boolean {
  const nome = semAcento(nomePasta);
  if (new RegExp(`\\b${MESES[mes - 1]}\\b`).test(nome)) return true;
  return new RegExp(`^0?${mes}\\s*(-|\\b)`).test(nome);
}

/*
 * Entre os arquivos de uma pasta, o PDF da NF: começa com "NF {número}"
 * (sem outro dígito colado). Se houver mais de um, prefere o que cita o
 * número do equipamento (ex.: "NF 69491 - EREPREST - 897.PDF").
 */
export function escolherArquivoNf(nomes: string[], numeroNf: string, numeroEquipamento: number | null): string | null {
  const numero = normalizarNumeroNf(numeroNf);
  if (!numero) return null;
  const padrao = new RegExp(`^NF\\s*0*${numero}(?!\\d).*\\.pdf$`, "i");
  const candidatos = nomes.filter((nome) => padrao.test(nome.trim()));
  if (candidatos.length <= 1) return candidatos[0] ?? null;
  if (numeroEquipamento !== null) {
    const doEquipamento = candidatos.find((nome) => new RegExp(`(^|\\D)${numeroEquipamento}(\\D|$)`).test(nome.replace(/^NF\s*\d+/i, "")));
    if (doEquipamento) return doEquipamento;
  }
  return candidatos.sort((a, b) => a.length - b.length)[0];
}

async function listar(pasta: string): Promise<{ arquivos: string[]; pastas: string[] }> {
  try {
    const itens = await readdir(pasta, { withFileTypes: true });
    return {
      arquivos: itens.filter((i) => i.isFile()).map((i) => i.name),
      pastas: itens.filter((i) => i.isDirectory()).map((i) => i.name),
    };
  } catch {
    return { arquivos: [], pastas: [] };
  }
}

/*
 * Procura no ano da emissão: primeiro a(s) pasta(s) do mês, depois as
 * demais pastas do ano e o próprio ano. Virada de ano: NF de janeiro pode
 * ter ido para o ano anterior e a de dezembro para o seguinte.
 */
export async function localizarPdfNfSaida(params: {
  pastaBase: string;
  numeroNf: string;
  dataEmissao: string;
  numeroEquipamento: number | null;
}): Promise<string | null> {
  const ano = Number(params.dataEmissao.slice(0, 4));
  const mes = Number(params.dataEmissao.slice(5, 7));
  if (!ano || !mes) return null;

  const anos = [ano, ...(mes === 1 ? [ano - 1] : []), ...(mes === 12 ? [ano + 1] : [])];
  for (const anoBusca of anos) {
    const pastaAno = path.join(params.pastaBase, String(anoBusca));
    const raiz = await listar(pastaAno);
    if (raiz.pastas.length === 0 && raiz.arquivos.length === 0) continue;

    const doMes = anoBusca === ano ? raiz.pastas.filter((p) => pastaEhDoMes(p, mes)) : [];
    const outras = raiz.pastas.filter((p) => !doMes.includes(p));

    for (const pasta of [...doMes, ...outras]) {
      const { arquivos } = await listar(path.join(pastaAno, pasta));
      const achado = escolherArquivoNf(arquivos, params.numeroNf, params.numeroEquipamento);
      if (achado) return path.join(pastaAno, pasta, achado);
    }
    const naRaiz = escolherArquivoNf(raiz.arquivos, params.numeroNf, params.numeroEquipamento);
    if (naRaiz) return path.join(pastaAno, naRaiz);
  }
  return null;
}

export const TAMANHO_MAXIMO_PDF_NF = 8 * 1024 * 1024;

export async function lerPdfNf(caminho: string): Promise<Buffer | null> {
  const info = await stat(caminho);
  if (info.size === 0 || info.size > TAMANHO_MAXIMO_PDF_NF) return null;
  const conteudo = await readFile(caminho);
  return conteudo.subarray(0, 5).toString("latin1") === "%PDF-" ? conteudo : null;
}
