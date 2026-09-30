import { ZipArchive, type ArchiverError } from "archiver";
import { NextResponse } from "next/server";
import { PassThrough, Readable } from "node:stream";
import * as XLSX from "xlsx";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { registrarLog } from "@/lib/monitoramento/logs";
import { comMetricasApi } from "@/lib/monitoramento/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORIGEM_LOG = "integra-tubest/exportar";

/*
 * Layout exigido pelo importador do TuBest, e ele é literal:
 * - A1 carrega sozinha o marcador da importação em lote;
 * - a linha 2 é o cabeçalho;
 * - os dados começam na linha 3.
 * Por isso a planilha é montada linha a linha, e não com um
 * aoa_to_sheet de cabeçalho + corpo como na exportação do Lantek.
 */
const MARCADOR = "#BatchImportNestPart";
const CABECALHO = ["Nome do arquivo", "Nome da peça", "Quantidade"];
const NOME_ABA = "Planilha1";

const SEM_MP = "SEM-MP";

interface LinhaExportacao {
  caminho?: unknown;
  codigo?: unknown;
  quantidade?: unknown;
  codigoMp?: unknown;
}

function normalizarQuantidade(valor: unknown): number | string {
  if (valor === null || valor === undefined || valor === "") return "";
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : String(valor);
}

/* Nome de arquivo do Windows: nada de \ / : * ? " < > | nem espaço solto. */
function sanitizarNome(valor: string, padrao: string): string {
  const limpo = valor
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);

  return limpo || padrao;
}

function montarPlanilha(linhas: LinhaExportacao[]): Buffer {
  const dados: (string | number)[][] = [
    [MARCADOR],
    CABECALHO,
    ...linhas.map((linha) => [
      String(linha.caminho ?? "").trim(),
      String(linha.codigo ?? "").trim(),
      normalizarQuantidade(linha.quantidade),
    ]),
  ];

  const planilha = XLSX.utils.aoa_to_sheet(dados);
  planilha["!cols"] = [{ wch: 60 }, { wch: 22 }, { wch: 12 }];

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, NOME_ABA);

  return XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/* Um grupo por matéria-prima, na ordem em que aparecem na lista. */
function agruparPorMp(linhas: LinhaExportacao[]): Map<string, LinhaExportacao[]> {
  const grupos = new Map<string, LinhaExportacao[]>();

  for (const linha of linhas) {
    const chave = sanitizarNome(String(linha.codigoMp ?? "").trim(), SEM_MP);
    const atual = grupos.get(chave);

    if (atual) atual.push(linha);
    else grupos.set(chave, [linha]);
  }

  return grupos;
}

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("integra-tubest");
  if (acesso.negado) return acesso.negado;

  try {
    const body = await request.json();
    const linhas = Array.isArray(body?.linhas) ? (body.linhas as LinhaExportacao[]) : [];
    const separarPorMp = body?.separarPorMp === true;
    const nomeBase = sanitizarNome(String(body?.nomeBase ?? "").trim(), "importacao-tubest");

    if (!linhas.length) {
      return NextResponse.json(
        { ok: false, message: "Não há registros para exportar." },
        { status: 400 }
      );
    }

    const semCaminho = linhas.filter((linha) => !String(linha.caminho ?? "").trim()).length;

    if (!separarPorMp) {
      const buffer = montarPlanilha(linhas);

      await registrarLog({
        nivel: semCaminho > 0 ? "aviso" : "info",
        origem: ORIGEM_LOG,
        mensagem: `${acesso.usuario.samAccountName} exportou ${linhas.length} linha(s) em ${nomeBase}.xlsx${
          semCaminho > 0 ? `, ${semCaminho} sem arquivo` : ""
        }.`,
      });

      /* Devolve os bytes: quem escolhe onde salvar é a pessoa, na tela. */
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${nomeBase}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const grupos = agruparPorMp(linhas);

    /*
     * Vários arquivos só podem descer como um download só -- daí o .zip.
     * Mesmo padrão de streaming do zip da Transferência de Arquivos.
     */
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const saida = new PassThrough();

    archive.on("warning", (aviso: ArchiverError) =>
      console.error("Aviso ao gerar o .zip do TuBest:", aviso)
    );
    archive.on("error", (erro: ArchiverError) => {
      console.error("Erro ao gerar o .zip do TuBest:", erro);
      saida.destroy(erro);
    });
    archive.pipe(saida);

    for (const [codigoMp, linhasDoGrupo] of grupos) {
      archive.append(montarPlanilha(linhasDoGrupo), {
        name: `${nomeBase}__${codigoMp}.xlsx`,
      });
    }

    archive.finalize();

    await registrarLog({
      nivel: semCaminho > 0 ? "aviso" : "info",
      origem: ORIGEM_LOG,
      mensagem: `${acesso.usuario.samAccountName} exportou ${linhas.length} linha(s) em ${grupos.size} arquivo(s) por matéria-prima (${nomeBase}.zip)${
        semCaminho > 0 ? `, ${semCaminho} sem arquivo` : ""
      }.`,
    });

    return new NextResponse(Readable.toWeb(saida) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${nomeBase}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao exportar planilha do TuBest:", error);

    await registrarLog({
      nivel: "erro",
      origem: ORIGEM_LOG,
      mensagem: "Erro inesperado ao gerar a planilha de importação.",
      detalhes: error instanceof Error ? error.stack ?? error.message : String(error),
    });

    return NextResponse.json(
      { ok: false, message: "Erro interno ao gerar a planilha." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("integra-tubest/exportar", handlePOST);
