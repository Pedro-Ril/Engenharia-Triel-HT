/*
 * Serviço de edição ao vivo do Bloco de Notas -- processo Node separado,
 * fora do `next start`, como o servidor de sinalização da TV
 * (tv-signaling/server.mjs). Sobe sozinho junto com o portal
 * (src/instrumentation.ts -> src/lib/bloco-notas/colaboracao-processo.ts)
 * ou à mão:
 *
 *   node --env-file=.env colaboracao/server.mjs     (npm run notas-colaboracao)
 *
 * Porta: NOTAS_COLAB_PORT (padrão 3012) -- precisa estar liberada no
 * firewall do servidor, os navegadores conectam direto nela.
 *
 * Hocuspocus + Yjs: cada página compartilhada é um documento
 * ("pagina:<id>"); as alterações de quem está editando são juntadas sem
 * conflito e repassadas a todos. O estado é gravado em
 * portal_notas_paginas.estado_colaborativo. O HTML "de leitura" ([conteudo],
 * busca) continua sendo gravado pelo próprio portal, a partir do navegador
 * de quem edita.
 *
 * Autorização: só aceita o passe emitido pelo portal
 * (GET /api/bloco-notas/paginas/[id]/colaboracao): JWT HS256 com a chave
 * AUTH_SESSION_SECRET, audience própria, válido para UMA página; quem tem
 * só 'ver' entra como somente leitura.
 */

import { Server } from "@hocuspocus/server";
import { jwtVerify } from "jose";
import sql from "mssql";
import * as Y from "yjs";

const PORTA = Number(process.env.NOTAS_COLAB_PORT) || 3012;
const AUDIENCIA = "bloco-notas-colaboracao";
const AUDIENCIA_REVALIDAR = "bloco-notas-colaboracao-revalidar";
const PREFIXO_DOCUMENTO = "pagina:";
const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* Campo do Yjs onde o Tiptap guarda o texto (padrão da extensão Collaboration). */
const CAMPO = "default";

function segredo() {
  const valor = process.env.AUTH_SESSION_SECRET;
  if (!valor) throw new Error("A variável de ambiente AUTH_SESSION_SECRET não foi configurada.");
  return new TextEncoder().encode(valor);
}

function booleano(nome, padrao) {
  const valor = process.env[nome];
  return valor === undefined ? padrao : valor.toLowerCase() === "true";
}

/* Mesma configuração do portal (src/lib/database/sql-server.ts), lida do mesmo .env. */
let conexao = null;
function banco() {
  if (!conexao) {
    conexao = new sql.ConnectionPool({
      server: process.env.DB_SERVER,
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectionTimeout: Number(process.env.DB_CONNECTION_TIMEOUT) || 15000,
      requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT) || 30000,
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      options: {
        encrypt: booleano("DB_ENCRYPT", true),
        trustServerCertificate: booleano("DB_TRUST_SERVER_CERTIFICATE", true),
      },
    })
      .connect()
      .catch((error) => {
        conexao = null;
        throw error;
      });
  }
  return conexao;
}

function paginaDoDocumento(nome) {
  const id = nome.startsWith(PREFIXO_DOCUMENTO) ? nome.slice(PREFIXO_DOCUMENTO.length) : "";
  return PADRAO_UUID.test(id) ? id.toLowerCase() : null;
}

/*
 * Primeira sessão ao vivo de uma página (sem estado gravado): o texto que
 * já existe (HTML) precisa entrar UMA vez. Quem semeia é o primeiro
 * navegador que pode editar -- o servidor escolhe e avisa só ele, para não
 * duplicar o texto quando duas pessoas abrem ao mesmo tempo.
 */
const MENSAGEM_SEMEAR = JSON.stringify({ tipo: "semear" });
const precisaSemear = new WeakSet();
const sementeEntregue = new WeakSet();

const servidor = new Server({
  port: PORTA,
  name: "bloco-notas",
  /* Grava ~2 s depois da última alteração (no máximo a cada 10 s digitando sem parar). */
  debounce: 2000,
  maxDebounce: 10000,
  quiet: true,
  websocketOptions: { maxPayload: 8 * 1024 * 1024 },

  async onAuthenticate({ token, documentName, connectionConfig }) {
    const paginaId = paginaDoDocumento(documentName);
    if (!paginaId) throw new Error("Documento inválido.");

    let payload;
    try {
      ({ payload } = await jwtVerify(token, segredo(), { audience: AUDIENCIA }));
    } catch {
      throw new Error("Passe inválido ou vencido.");
    }

    if (payload.pagina !== paginaId || typeof payload.sub !== "string") {
      throw new Error("Passe de outra página.");
    }

    connectionConfig.readOnly = payload.editar !== true;
    return { usuarioId: payload.sub, podeEditar: payload.editar === true };
  },

  async onLoadDocument({ documentName, document }) {
    const paginaId = paginaDoDocumento(documentName);
    const pool = await banco();
    const resultado = await pool
      .request()
      .input("id", sql.UniqueIdentifier, paginaId)
      .query("SELECT [estado_colaborativo] FROM dbo.portal_notas_paginas WHERE [id] = @id AND [excluida_em] IS NULL;");

    const linha = resultado.recordset[0];
    if (!linha) throw new Error("Página não encontrada.");

    if (linha.estado_colaborativo) {
      Y.applyUpdate(document, new Uint8Array(linha.estado_colaborativo));
    } else {
      precisaSemear.add(document);
    }
    return document;
  },

  async connected({ connection }) {
    const document = connection.document;
    if (!document || !precisaSemear.has(document) || sementeEntregue.has(document)) return;
    if (connection.readOnly) return;
    if (document.getXmlFragment(CAMPO).length > 0) {
      precisaSemear.delete(document);
      return;
    }
    sementeEntregue.add(document);
    connection.sendStateless(MENSAGEM_SEMEAR);
  },

  async onStoreDocument({ documentName, document }) {
    const paginaId = paginaDoDocumento(documentName);
    if (!paginaId) return;
    if (precisaSemear.has(document) && document.getXmlFragment(CAMPO).length > 0) {
      precisaSemear.delete(document);
    }
    /* Ainda vazio esperando a semente: não grava um estado vazio por cima do HTML. */
    if (precisaSemear.has(document)) return;

    const estado = Buffer.from(Y.encodeStateAsUpdate(document));
    const pool = await banco();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, paginaId)
      .input("estado", sql.VarBinary(sql.MAX), estado)
      .query("UPDATE dbo.portal_notas_paginas SET [estado_colaborativo] = @estado WHERE [id] = @id AND [excluida_em] IS NULL;");
  },

  /*
   * POST /revalidar (só do próprio servidor, com passe do portal): o dono
   * mudou o compartilhamento -> derruba as conexões dessas páginas. Os
   * navegadores reconectam sozinhos pedindo um passe novo, e quem perdeu o
   * acesso (ou passou a só ver) já volta com a regra nova.
   */
  async onRequest({ request, response }) {
    const caminho = (request.url ?? "").split("?")[0];
    if (caminho !== "/revalidar") return;

    const responder = (status, corpo) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(corpo));
      throw null; // encerra a cadeia de hooks sem a resposta padrão
    };

    const origem = request.socket?.remoteAddress ?? "";
    if (request.method !== "POST" || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(origem)) {
      responder(403, { ok: false });
    }

    const token = (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    try {
      await jwtVerify(token, segredo(), { audience: AUDIENCIA_REVALIDAR });
    } catch {
      responder(401, { ok: false });
    }

    let corpo = "";
    for await (const parte of request) {
      corpo += parte;
      if (corpo.length > 200_000) responder(413, { ok: false });
    }

    let ids = [];
    try {
      const lido = JSON.parse(corpo);
      ids = Array.isArray(lido.paginas) ? lido.paginas.filter((id) => typeof id === "string" && PADRAO_UUID.test(id)) : [];
    } catch {
      responder(400, { ok: false });
    }

    for (const id of ids) servidor.hocuspocus.closeConnections(PREFIXO_DOCUMENTO + id.toLowerCase());
    responder(200, { ok: true, total: ids.length });
  },

  /*
   * Quem ia semear saiu antes de mandar o texto: passa o pedido para outro
   * editor que ainda esteja na página (ou para o próximo que entrar).
   */
  async onDisconnect({ document }) {
    if (!document || !precisaSemear.has(document) || document.getXmlFragment(CAMPO).length > 0) return;
    let escolhido = false;
    document.broadcastStateless(MENSAGEM_SEMEAR, (conexaoAberta) => {
      if (escolhido || conexaoAberta.readOnly) return false;
      escolhido = true;
      return true;
    });
    if (!escolhido) sementeEntregue.delete(document);
  },
});

servidor
  .listen()
  .then(() => console.log(`Serviço de colaboração do Bloco de Notas ouvindo na porta ${PORTA}`))
  .catch((error) => {
    console.error("Não foi possível iniciar o serviço de colaboração do Bloco de Notas:", error);
    process.exit(1);
  });
