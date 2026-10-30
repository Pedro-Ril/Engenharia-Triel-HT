import "server-only";

import http from "node:http";
import net from "node:net";
import tls from "node:tls";

/*
 * Cliente IPP mínimo (RFC 8010/8011), só com o que a rota de impressão
 * usa: Print-Job, Validate-Job, Get-Job-Attributes e
 * Get-Printer-Attributes. Fala direto com a impressora pela rede, sem
 * spooler do Windows e sem dependência nova.
 *
 * TLS (ipps): o certificado das impressoras é autoassinado, então não dá
 * para validar por cadeia. Em vez disso o Portal "fixa" a impressão
 * digital SHA-256 do certificado (cadastrada na administração) e confere
 * logo depois do handshake, ANTES de escrever qualquer byte — se não
 * bater, a conexão cai e o PDF não sai do Portal.
 */

export const OPERACAO = {
  printJob: 0x0002,
  validateJob: 0x0004,
  getJobAttributes: 0x0009,
  getPrinterAttributes: 0x000b,
} as const;

const TAG = {
  operacao: 0x01,
  trabalho: 0x02,
  fim: 0x03,
  integer: 0x21,
  boolean: 0x22,
  enum: 0x23,
  rangeOfInteger: 0x33,
  begCollection: 0x34,
  endCollection: 0x37,
  text: 0x41,
  name: 0x42,
  keyword: 0x44,
  uri: 0x45,
  charset: 0x47,
  naturalLanguage: 0x48,
  mimeMediaType: 0x49,
} as const;

export type ValorIpp = string | number | boolean | { min: number; max: number };

export interface AtributoIpp {
  tag: number;
  nome: string;
  valores: (string | number | boolean)[];
}

export interface RespostaIpp {
  status: number;
  atributos: Record<string, ValorIpp[]>;
}

export interface DestinoIpp {
  endereco: string;
  porta: number;
  caminho: string;
  usarTls: boolean;
  certificadoSha256: string | null;
}

export class ErroIpp extends Error {
  constructor(
    public readonly codigo: "conexao" | "tempo" | "certificado" | "resposta",
    mensagem: string
  ) {
    super(mensagem);
    this.name = "ErroIpp";
  }
}

/* ---------- codificação ---------- */

function codificarValor(tag: number, valor: string | number | boolean): Buffer {
  if (tag === TAG.integer || tag === TAG.enum) {
    const b = Buffer.alloc(4);
    b.writeInt32BE(valor as number);
    return b;
  }
  if (tag === TAG.boolean) return Buffer.from([valor ? 1 : 0]);
  return Buffer.from(String(valor), "utf8");
}

function codificarAtributo(atributo: AtributoIpp): Buffer {
  const partes: Buffer[] = [];
  atributo.valores.forEach((valor, indice) => {
    const nome = Buffer.from(indice === 0 ? atributo.nome : "", "utf8");
    const conteudo = codificarValor(atributo.tag, valor);
    const cabecalho = Buffer.alloc(1 + 2);
    cabecalho.writeUInt8(atributo.tag, 0);
    cabecalho.writeUInt16BE(nome.length, 1);
    const tamanho = Buffer.alloc(2);
    tamanho.writeUInt16BE(conteudo.length);
    partes.push(cabecalho, nome, tamanho, conteudo);
  });
  return Buffer.concat(partes);
}

export function codificarRequisicao(params: {
  operacao: number;
  idRequisicao: number;
  operacaoAttrs: AtributoIpp[];
  trabalhoAttrs?: AtributoIpp[];
}): Buffer {
  const cabecalho = Buffer.alloc(8);
  cabecalho.writeUInt8(1, 0);
  cabecalho.writeUInt8(1, 1); /* IPP 1.1: o mínimo que toda impressora aceita */
  cabecalho.writeUInt16BE(params.operacao, 2);
  cabecalho.writeUInt32BE(params.idRequisicao, 4);

  const partes: Buffer[] = [cabecalho, Buffer.from([TAG.operacao])];
  /* attributes-charset e attributes-natural-language precisam vir primeiro, nessa ordem. */
  partes.push(
    codificarAtributo({ tag: TAG.charset, nome: "attributes-charset", valores: ["utf-8"] }),
    codificarAtributo({ tag: TAG.naturalLanguage, nome: "attributes-natural-language", valores: ["pt-br"] }),
    ...params.operacaoAttrs.map(codificarAtributo)
  );
  if (params.trabalhoAttrs?.length) {
    partes.push(Buffer.from([TAG.trabalho]), ...params.trabalhoAttrs.map(codificarAtributo));
  }
  partes.push(Buffer.from([TAG.fim]));
  return Buffer.concat(partes);
}

/* ---------- decodificação ---------- */

export function decodificarResposta(buf: Buffer): RespostaIpp {
  if (buf.length < 9) throw new ErroIpp("resposta", "Resposta IPP curta demais.");
  const status = buf.readUInt16BE(2);
  const atributos: Record<string, ValorIpp[]> = {};

  let o = 8;
  let ultimo: string | null = null;
  let profundidadeColecao = 0;

  while (o < buf.length) {
    const tag = buf.readUInt8(o);
    o += 1;
    if (tag === TAG.fim) break;
    if (tag <= 0x0f) {
      ultimo = null;
      continue;
    }
    if (o + 2 > buf.length) break;
    const tamNome = buf.readUInt16BE(o);
    o += 2;
    const nome = buf.toString("utf8", o, o + tamNome);
    o += tamNome;
    if (o + 2 > buf.length) break;
    const tamValor = buf.readUInt16BE(o);
    o += 2;
    const bruto = buf.subarray(o, o + tamValor);
    o += tamValor;

    /* Coleções (ex.: media-col) não são usadas aqui: pula o conteúdo inteiro. */
    if (tag === TAG.begCollection) {
      profundidadeColecao += 1;
      continue;
    }
    if (tag === TAG.endCollection) {
      profundidadeColecao = Math.max(0, profundidadeColecao - 1);
      continue;
    }
    if (profundidadeColecao > 0) continue;

    let valor: ValorIpp;
    if ((tag === TAG.integer || tag === TAG.enum) && tamValor === 4) valor = bruto.readInt32BE(0);
    else if (tag === TAG.boolean) valor = bruto[0] === 1;
    else if (tag === TAG.rangeOfInteger && tamValor === 8) valor = { min: bruto.readInt32BE(0), max: bruto.readInt32BE(4) };
    else if (tag >= 0x40) valor = bruto.toString("utf8");
    else continue; /* dateTime, resolution etc.: não usados */

    if (nome) {
      ultimo = nome;
      atributos[nome] = [valor];
    } else if (ultimo) {
      atributos[ultimo].push(valor);
    }
  }

  return { status, atributos };
}

export function statusOk(status: number): boolean {
  return status < 0x0100;
}

const DESCRICAO_STATUS: Record<number, string> = {
  0x0400: "requisição inválida",
  0x0401: "proibido",
  0x0402: "exige autenticação",
  0x0403: "não autorizado",
  0x0405: "tempo esgotado",
  0x0406: "não encontrado",
  0x0407: "não existe mais",
  0x0408: "requisição grande demais",
  0x0409: "documento grande demais",
  0x040a: "formato de documento não suportado",
  0x040b: "valor de atributo não suportado",
  0x040d: "valores conflitantes",
  0x0500: "erro interno da impressora",
  0x0501: "operação não suportada",
  0x0502: "serviço indisponível",
  0x0503: "versão de IPP não suportada",
  0x0504: "erro do dispositivo",
  0x0505: "erro temporário",
  0x0506: "impressora não está aceitando trabalhos",
  0x0507: "impressora ocupada",
  0x0508: "trabalho cancelado",
};

export function descreverStatus(status: number): string {
  const codigo = `0x${status.toString(16).padStart(4, "0")}`;
  return DESCRICAO_STATUS[status] ? `${DESCRICAO_STATUS[status]} (${codigo})` : `status IPP ${codigo}`;
}

/* job-state (RFC 8011 5.3.7) */
export type EstadoTrabalhoIpp = "na_fila" | "imprimindo" | "impresso" | "cancelado" | "erro";

export function estadoDoTrabalho(jobState: number | undefined): EstadoTrabalhoIpp | null {
  switch (jobState) {
    case 3:
    case 4:
      return "na_fila";
    case 5:
    case 6:
      return "imprimindo";
    case 7:
      return "cancelado";
    case 8:
      return "erro";
    case 9:
      return "impresso";
    default:
      return null;
  }
}

/* ---------- transporte ---------- */

export function normalizarImpressaoDigital(valor: string): string {
  return valor.replace(/[^0-9a-f]/gi, "").toUpperCase();
}

export function uriImpressora(destino: DestinoIpp): string {
  return `${destino.usarTls ? "ipps" : "ipp"}://${destino.endereco}:${destino.porta}${destino.caminho}`;
}

function abrirConexao(destino: DestinoIpp, prazoMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new ErroIpp("tempo", "A impressora não respondeu a tempo."));
    }, prazoMs);

    const falhar = (erro: Error) => {
      clearTimeout(timer);
      reject(erro instanceof ErroIpp ? erro : new ErroIpp("conexao", `Não foi possível conectar na impressora (${erro.message}).`));
    };

    const socket: net.Socket = destino.usarTls
      ? tls.connect(
          {
            host: destino.endereco,
            port: destino.porta,
            servername: net.isIP(destino.endereco) ? undefined : destino.endereco,
            rejectUnauthorized: false,
            minVersion: "TLSv1.2",
          },
          () => {
            const recebida = normalizarImpressaoDigital((socket as tls.TLSSocket).getPeerCertificate().fingerprint256 ?? "");
            const esperada = normalizarImpressaoDigital(destino.certificadoSha256 ?? "");
            if (!esperada || recebida !== esperada) {
              socket.destroy();
              falhar(new ErroIpp("certificado", "O certificado da impressora não confere com o cadastrado."));
              return;
            }
            clearTimeout(timer);
            resolve(socket);
          }
        )
      : net.connect({ host: destino.endereco, port: destino.porta }, () => {
          clearTimeout(timer);
          resolve(socket);
        });

    socket.once("error", falhar);
  });
}

const LIMITE_RESPOSTA = 1024 * 1024;

export async function enviarIpp(
  destino: DestinoIpp,
  corpoIpp: Buffer,
  documento: Buffer | null,
  prazoMs: number
): Promise<RespostaIpp> {
  const socket = await abrirConexao(destino, Math.min(prazoMs, 10_000));
  const corpo = documento ? Buffer.concat([corpoIpp, documento]) : corpoIpp;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: destino.endereco,
        port: destino.porta,
        path: destino.caminho,
        method: "POST",
        agent: false,
        createConnection: () => socket,
        headers: { "Content-Type": "application/ipp", "Content-Length": corpo.length },
      },
      (res) => {
        const pedacos: Buffer[] = [];
        let total = 0;
        res.on("data", (pedaco: Buffer) => {
          total += pedaco.length;
          if (total > LIMITE_RESPOSTA) {
            req.destroy(new ErroIpp("resposta", "Resposta da impressora grande demais."));
            return;
          }
          pedacos.push(pedaco);
        });
        res.on("end", () => {
          clearTimeout(timer);
          if (res.statusCode !== 200) {
            reject(new ErroIpp("resposta", `A impressora respondeu HTTP ${res.statusCode}.`));
            return;
          }
          try {
            resolve(decodificarResposta(Buffer.concat(pedacos)));
          } catch (erro) {
            reject(erro);
          }
        });
      }
    );

    const timer = setTimeout(() => req.destroy(new ErroIpp("tempo", "A impressora não respondeu a tempo.")), prazoMs);
    req.on("error", (erro) => {
      clearTimeout(timer);
      reject(erro instanceof ErroIpp ? erro : new ErroIpp("conexao", `Falha na comunicação com a impressora (${erro.message}).`));
    });
    req.end(corpo);
  });
}

/* Lê a impressão digital do certificado TLS (para o admin fixar no cadastro). */
export function lerCertificado(endereco: string, porta: number): Promise<{ sha256: string; assunto: string | null; validoAte: string | null }> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: endereco,
        port: porta,
        servername: net.isIP(endereco) ? undefined : endereco,
        rejectUnauthorized: false,
        minVersion: "TLSv1.2",
        timeout: 8000,
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        if (!cert?.fingerprint256) {
          reject(new ErroIpp("certificado", "A impressora não apresentou certificado."));
          return;
        }
        resolve({
          sha256: cert.fingerprint256,
          assunto: (Array.isArray(cert.subject?.CN) ? cert.subject.CN[0] : cert.subject?.CN) ?? null,
          validoAte: cert.valid_to ? new Date(cert.valid_to).toISOString() : null,
        });
      }
    );
    socket.on("timeout", () => {
      socket.destroy();
      reject(new ErroIpp("tempo", "A impressora não respondeu a tempo."));
    });
    socket.on("error", (erro) => reject(new ErroIpp("conexao", `Não foi possível conectar em TLS (${erro.message}).`)));
  });
}

/* ---------- operações ---------- */

let proximoId = 1;
function idRequisicao(): number {
  proximoId = (proximoId % 0x7fffffff) + 1;
  return proximoId;
}

function atributosDoTrabalho(params: { copias: number; frenteVerso: boolean }): AtributoIpp[] {
  return [
    { tag: TAG.integer, nome: "copies", valores: [params.copias] },
    { tag: TAG.keyword, nome: "sides", valores: [params.frenteVerso ? "two-sided-long-edge" : "one-sided"] },
  ];
}

function cortarBytes(texto: string, maxBytes: number): string {
  let resultado = texto.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  while (Buffer.byteLength(resultado, "utf8") > maxBytes) resultado = resultado.slice(0, -1);
  return resultado || "Portal Triel-HT";
}

export async function imprimirPdf(
  destino: DestinoIpp,
  params: { pdf: Buffer; usuario: string; nomeTrabalho: string; copias: number; frenteVerso: boolean; validarSomente?: boolean }
): Promise<RespostaIpp> {
  const corpo = codificarRequisicao({
    operacao: params.validarSomente ? OPERACAO.validateJob : OPERACAO.printJob,
    idRequisicao: idRequisicao(),
    operacaoAttrs: [
      { tag: TAG.uri, nome: "printer-uri", valores: [uriImpressora(destino)] },
      { tag: TAG.name, nome: "requesting-user-name", valores: [cortarBytes(params.usuario, 255)] },
      { tag: TAG.name, nome: "job-name", valores: [cortarBytes(params.nomeTrabalho, 255)] },
      { tag: TAG.mimeMediaType, nome: "document-format", valores: ["application/pdf"] },
    ],
    trabalhoAttrs: atributosDoTrabalho(params),
  });
  return enviarIpp(destino, corpo, params.validarSomente ? null : params.pdf, params.validarSomente ? 15_000 : 60_000);
}

export async function consultarTrabalhoIpp(destino: DestinoIpp, jobId: number): Promise<RespostaIpp> {
  const corpo = codificarRequisicao({
    operacao: OPERACAO.getJobAttributes,
    idRequisicao: idRequisicao(),
    operacaoAttrs: [
      { tag: TAG.uri, nome: "printer-uri", valores: [uriImpressora(destino)] },
      { tag: TAG.integer, nome: "job-id", valores: [jobId] },
      { tag: TAG.name, nome: "requesting-user-name", valores: ["Portal Triel-HT"] },
      {
        tag: TAG.keyword,
        nome: "requested-attributes",
        valores: ["job-state", "job-state-reasons", "job-state-message", "job-impressions-completed"],
      },
    ],
  });
  return enviarIpp(destino, corpo, null, 10_000);
}

export async function consultarImpressoraIpp(destino: DestinoIpp): Promise<RespostaIpp> {
  const corpo = codificarRequisicao({
    operacao: OPERACAO.getPrinterAttributes,
    idRequisicao: idRequisicao(),
    operacaoAttrs: [
      { tag: TAG.uri, nome: "printer-uri", valores: [uriImpressora(destino)] },
      { tag: TAG.name, nome: "requesting-user-name", valores: ["Portal Triel-HT"] },
      {
        tag: TAG.keyword,
        nome: "requested-attributes",
        valores: [
          "printer-make-and-model",
          "printer-state",
          "printer-state-reasons",
          "printer-state-message",
          "printer-is-accepting-jobs",
          "document-format-supported",
          "sides-supported",
          "copies-supported",
        ],
      },
    ],
  });
  return enviarIpp(destino, corpo, null, 10_000);
}
