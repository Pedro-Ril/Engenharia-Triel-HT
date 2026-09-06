import { NextResponse } from "next/server";
import busboy from "busboy";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { ValidationError } from "@/lib/auth/errors";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { enviarEmail } from "@/lib/smtp/enviar-email";
import {
  montarBotaoEmailHtml,
  montarCartaoArquivosEmailHtml,
  montarCitacaoEmailHtml,
  montarEmailHtml,
  montarLinkEmailHtml,
} from "@/lib/smtp/template-email";
import {
  duracaoMaximaHorasEfetiva,
  pastaArmazenamentoObrigatoria,
} from "@/lib/transferencia/transferencia-config";
import { criarTransferencia, marcarEmailEnviado } from "@/lib/transferencia/transferencias";
import { validarEParsearDestinatarios } from "@/lib/transferencia/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/*
 * `busboy` (assim como todo parser de multipart baseado nos headers
 * HTTP puros) decodifica o parâmetro `filename=` do `Content-Disposition`
 * como Latin-1 — porque HTTP headers são, por especificação, Latin-1,
 * mesmo quando o navegador manda o nome do arquivo em UTF-8 de verdade
 * (ex: "ã", "é", "ç"). Resultado: acento vira sequência mojibake
 * ("Ã©" no lugar de "é"). Corrige revertendo a decodificação errada —
 * reinterpreta a string (já corrompida) como bytes Latin-1 e decodifica
 * de novo, agora como UTF-8 (que é o que o navegador realmente mandou).
 * Bug conhecido do busboy, não específico deste projeto.
 */
function corrigirNomeArquivo(nome: string): string {
  try {
    return Buffer.from(nome, "latin1").toString("utf8");
  } catch {
    return nome;
  }
}

function formatarDuracao(horas: number): string {
  if (horas % 24 === 0 && horas >= 24) {
    const dias = horas / 24;
    return `${dias} dia${dias === 1 ? "" : "s"}`;
  }
  return `${horas} hora${horas === 1 ? "" : "s"}`;
}

interface CamposFormulario {
  duracaoQuantidade?: string;
  duracaoUnidade?: string;
  mensagem?: string;
  enviarEmail?: string;
  destinatarioEmail?: string;
}

interface CamposValidados {
  duracaoHoras: number;
  mensagem: string | null;
  enviarEmailFlag: boolean;
  destinatarioEmail: string | null;
}

interface ArquivoGravado {
  caminhoCompleto: string;
  nomeArquivo: string;
  nomeOriginal: string;
  tipoMime: string;
  tamanhoBytes: number;
}

/*
 * Nenhuma rota de upload existente no portal usa streaming — todas
 * (Downloads, anexos de chamado, mídias de TV) carregam o arquivo
 * inteiro na memória via `request.formData()`/`arrayBuffer()` antes de
 * gravar. Aqui o requisito é "sem limite de tamanho", então o corpo da
 * requisição é lido e gravado em disco em pedaços via `busboy`, sem
 * nunca montar o arquivo inteiro em memória — ver plano de
 * implementação para o raciocínio completo.
 */
function validarCampos(campos: CamposFormulario, duracaoMaximaHoras: number): CamposValidados {
  const quantidade = Number(campos.duracaoQuantidade);
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new ValidationError("Informe uma duração válida para o link.");
  }

  const unidade = campos.duracaoUnidade;
  if (unidade !== "horas" && unidade !== "dias") {
    throw new ValidationError("A unidade de duração deve ser 'horas' ou 'dias'.");
  }

  const duracaoHoras = unidade === "dias" ? quantidade * 24 : quantidade;

  if (duracaoHoras > duracaoMaximaHoras) {
    throw new ValidationError(
      `A duração máxima permitida para o link é de ${duracaoMaximaHoras} horas.`
    );
  }

  const mensagem = campos.mensagem?.trim() || null;
  const enviarEmailFlag = campos.enviarEmail === "true";
  const destinatarioEmailBruto = campos.destinatarioEmail?.trim() || null;

  /*
   * Aceita vários e-mails separados por ";" — normaliza pro formato
   * "email1; email2" antes de gravar, pra ficar sempre consistente
   * independente de como o usuário digitou os espaços.
   */
  let destinatarioEmail = destinatarioEmailBruto;

  if (enviarEmailFlag) {
    if (!destinatarioEmailBruto) {
      throw new ValidationError("Informe ao menos um e-mail de destinatário.");
    }
    destinatarioEmail = validarEParsearDestinatarios(destinatarioEmailBruto).join("; ");
  }

  return { duracaoHoras, mensagem, enviarEmailFlag, destinatarioEmail };
}

async function handlePOST(request: Request) {
  const acesso = await verificarAcessoModuloApi("transferencia-arquivos");
  if (acesso.negado) return acesso.negado;
  const { usuario } = acesso;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data") || !request.body) {
    return NextResponse.json({ ok: false, message: "Requisição inválida." }, { status: 400 });
  }

  let pastaArmazenamento: string;
  let duracaoMaximaHoras: number;

  try {
    pastaArmazenamento = await pastaArmazenamentoObrigatoria();
    duracaoMaximaHoras = await duracaoMaximaHorasEfetiva();
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }
    throw error;
  }

  await mkdir(pastaArmazenamento, { recursive: true });

  const campos: CamposFormulario = {};
  let camposValidados: CamposValidados | null = null;
  let erroValidacao: string | null = null;
  const arquivoPromises: Promise<ArquivoGravado>[] = [];
  /* Pra poder apagar os arquivos parciais se o upload falhar no meio (conexão caiu, form malformado). */
  const caminhosParciais: string[] = [];

  const bb = busboy({
    headers: Object.fromEntries(request.headers),
  });

  bb.on("field", (nome, valor) => {
    (campos as Record<string, string>)[nome] = valor;
  });

  bb.on("file", (_nome, stream, info) => {
    /*
     * Os campos de metadado são anexados ao FormData antes dos
     * arquivos (ver enviarTransferencia no service do cliente), então
     * na hora do primeiro "file" a validação já pode rodar — feita só
     * uma vez e reaproveitada pros arquivos seguintes do mesmo lote.
     */
    if (!camposValidados && !erroValidacao) {
      try {
        camposValidados = validarCampos(campos, duracaoMaximaHoras);
      } catch (error) {
        erroValidacao = error instanceof ValidationError ? error.message : "Dados inválidos.";
      }
    }

    if (erroValidacao) {
      stream.resume();
      return;
    }

    const nomeOriginalCorrigido = corrigirNomeArquivo(info.filename || "arquivo");
    const extensao = path.extname(nomeOriginalCorrigido) || "";
    const nomeArquivo = `${randomUUID()}${extensao}`;
    const caminhoCompleto = path.join(pastaArmazenamento, nomeArquivo);
    caminhosParciais.push(caminhoCompleto);

    let tamanhoBytes = 0;
    stream.on("data", (chunk: Buffer) => {
      tamanhoBytes += chunk.length;
    });

    const writeStream = createWriteStream(caminhoCompleto);

    arquivoPromises.push(
      new Promise<ArquivoGravado>((resolveArquivo, rejectArquivo) => {
        writeStream.on("finish", () => {
          resolveArquivo({
            caminhoCompleto,
            nomeArquivo,
            nomeOriginal: nomeOriginalCorrigido.slice(0, 260),
            tipoMime: info.mimeType || "application/octet-stream",
            tamanhoBytes,
          });
        });
        writeStream.on("error", rejectArquivo);
        stream.on("error", rejectArquivo);
      })
    );

    stream.pipe(writeStream);
  });

  const finalizacao = new Promise<void>((resolveFinal, rejectFinal) => {
    bb.on("error", (error) => rejectFinal(error as Error));

    bb.on("close", () => {
      Promise.all(arquivoPromises)
        .then(() => resolveFinal())
        .catch(rejectFinal);
    });
  });

  const nodeStream = Readable.fromWeb(request.body as import("node:stream/web").ReadableStream);
  nodeStream.on("error", (error) => bb.destroy(error));
  nodeStream.pipe(bb);

  let arquivos: ArquivoGravado[] = [];

  try {
    await finalizacao;
    arquivos = await Promise.all(arquivoPromises);
  } catch (error) {
    await Promise.all(caminhosParciais.map((caminho) => unlink(caminho).catch(() => {})));

    console.error("Erro ao processar upload de transferência:", error);
    return NextResponse.json(
      { ok: false, message: "Falha ao receber o arquivo. Tente novamente." },
      { status: 500 }
    );
  }

  if (erroValidacao) {
    return NextResponse.json({ ok: false, message: erroValidacao }, { status: 400 });
  }

  if (arquivos.length === 0 || !camposValidados) {
    return NextResponse.json({ ok: false, message: "Nenhum arquivo enviado." }, { status: 400 });
  }

  /*
   * Rebind pra `const` — `camposValidados` é `let` reatribuído dentro
   * dos callbacks do busboy, então o TypeScript não confia na
   * checagem de nulidade acima pra manter o tipo estreitado no
   * restante da função (vira `never` em alguns pontos).
   */
  const camposFinais: CamposValidados = camposValidados;

  const arquivoVazio = arquivos.find((arquivo) => arquivo.tamanhoBytes === 0);
  if (arquivoVazio) {
    await Promise.all(arquivos.map((arquivo) => unlink(arquivo.caminhoCompleto).catch(() => {})));
    return NextResponse.json(
      { ok: false, message: `O arquivo "${arquivoVazio.nomeOriginal}" está vazio.` },
      { status: 400 }
    );
  }

  try {
    const transferencia = await criarTransferencia({
      arquivos: arquivos.map((arquivo) => ({
        nomeOriginal: arquivo.nomeOriginal,
        tipoMime: arquivo.tipoMime,
        tamanhoBytes: arquivo.tamanhoBytes,
        caminhoArquivo: arquivo.nomeArquivo,
      })),
      mensagem: camposFinais.mensagem,
      enviadoPorUsuarioId: usuario.id,
      destinatarioEmail: camposFinais.destinatarioEmail,
      duracaoHoras: camposFinais.duracaoHoras,
    });

    const linkDownload = `${new URL(request.url).origin}/baixar/${transferencia.token}`;
    let emailEnviado = false;
    let avisoEmail: string | null = null;

    if (camposFinais.enviarEmailFlag && camposFinais.destinatarioEmail) {
      try {
        const duracaoTexto = formatarDuracao(camposFinais.duracaoHoras);
        const tituloArquivos =
          arquivos.length === 1
            ? "compartilhou um arquivo com você."
            : `compartilhou ${arquivos.length} arquivos com você.`;

        await enviarEmail({
          destinatario: camposFinais.destinatarioEmail.split(";").map((email) => email.trim()),
          assunto:
            arquivos.length === 1
              ? `${usuario.nomeExibicao} compartilhou um arquivo com você — Portal Triel-HT`
              : `${usuario.nomeExibicao} compartilhou ${arquivos.length} arquivos com você — Portal Triel-HT`,
          corpoHtml: montarEmailHtml(`
            <p style="margin: 0 0 18px; font-size: 16px;">
              <strong>${usuario.nomeExibicao}</strong> ${tituloArquivos}
            </p>

            ${montarCartaoArquivosEmailHtml(
              arquivos.map((arquivo) => ({
                nome: arquivo.nomeOriginal,
                tamanho: formatarTamanho(arquivo.tamanhoBytes),
              }))
            )}

            ${camposFinais.mensagem ? montarCitacaoEmailHtml(camposFinais.mensagem) : ""}

            ${montarBotaoEmailHtml("Baixar arquivo" + (arquivos.length > 1 ? "s" : ""), linkDownload)}

            ${montarLinkEmailHtml(linkDownload)}

            <p style="margin: 0; font-size: 13px; color: #6b7280;">
              Este link expira em ${duracaoTexto}.
            </p>
          `),
          corpoTexto: `${usuario.nomeExibicao} ${tituloArquivos}\n${arquivos.map((arquivo) => `- ${arquivo.nomeOriginal} (${formatarTamanho(arquivo.tamanhoBytes)})`).join("\n")}\n${camposFinais.mensagem ?? ""}\n${linkDownload}\nEste link expira em ${duracaoTexto}.`,
        });
        await marcarEmailEnviado(transferencia.id);
        emailEnviado = true;
      } catch (error) {
        avisoEmail = error instanceof Error ? error.message : "Não foi possível enviar o e-mail.";
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Arquivo enviado.",
      data: { ...transferencia, linkDownload, emailEnviado, avisoEmail },
    });
  } catch (error) {
    await Promise.all(arquivos.map((arquivo) => unlink(arquivo.caminhoCompleto).catch(() => {})));

    if (error instanceof ValidationError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    console.error("Erro ao registrar transferência:", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível registrar a transferência." },
      { status: 500 }
    );
  }
}

export const POST = comMetricasApi("transferencia-arquivos/upload", handlePOST);
