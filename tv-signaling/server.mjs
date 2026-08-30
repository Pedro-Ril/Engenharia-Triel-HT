/*
 * Servidor de sinalização WebRTC da TV Corporativa — processo Node
 * separado, fora do `next start` (ver plano de implementação e
 * CLAUDE.md). Responsabilidade única: repassar mensagens
 * offer/answer/ice-candidate entre a aba do terminal (que captura a
 * própria tela) e a aba do admin que está assistindo — nunca toca em
 * mídia, só texto/JSON. Roda com:
 *
 *   node --env-file=.env tv-signaling/server.mjs
 *
 * (também disponível como `npm run tv-signaling` a partir da raiz do
 * repo). Porta configurável via TV_SIGNALING_PORT (padrão 3010); a
 * URL pública correspondente é cadastrada pelo admin em TV Corporativa
 * → Configurações (portal_tv_config.signaling_url), não aqui — este
 * processo não sabe nem precisa saber por qual endereço externo é
 * alcançado.
 *
 * Deliberadamente sem acesso ao SQL Server: a autorização de quem
 * pode conectar como terminal ou como espectador é inteira via JWT
 * (mesmo secret TV_TERMINAL_TOKEN_SECRET do token de dispositivo — ver
 * src/lib/tv/terminal-token.ts), então este processo não precisa de
 * string de conexão nem de credenciais de banco.
 */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { jwtVerify } from "jose";

const PORTA = Number(process.env.TV_SIGNALING_PORT) || 3010;

function getSecretKey() {
  const secret = process.env.TV_TERMINAL_TOKEN_SECRET;

  if (!secret) {
    throw new Error("A variável de ambiente TV_TERMINAL_TOKEN_SECRET não foi configurada.");
  }

  return new TextEncoder().encode(secret);
}

/*
 * Token de terminal (papel implícito, sem `role`) e token de
 * visualização (`role: "viewer"`, curta duração — ver
 * criarTokenVisualizacao) compartilham o mesmo secret; só o campo
 * `role` distingue os dois papéis aqui.
 */
async function autenticarConexao(token) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());

    if (typeof payload.sub !== "string") return null;

    const papel = payload.role === "viewer" ? "viewer" : "terminal";
    return { terminalId: payload.sub, papel };
  } catch {
    return null;
  }
}

/* terminalId -> { terminalWs: WebSocket|null, viewerWs: WebSocket|null } */
const pares = new Map();

function obterOuCriarPar(terminalId) {
  let par = pares.get(terminalId);
  if (!par) {
    par = { terminalWs: null, viewerWs: null };
    pares.set(terminalId, par);
  }
  return par;
}

function limparParSeVazio(terminalId) {
  const par = pares.get(terminalId);
  if (par && !par.terminalWs && !par.viewerWs) {
    pares.delete(terminalId);
  }
}

function enviar(ws, mensagem) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(mensagem));
  }
}

const servidorHttp = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("tv-signaling ok");
});

const wss = new WebSocketServer({ server: servidorHttp });

wss.on("connection", async (ws, request) => {
  const url = new URL(request.url, "http://localhost");
  const token = url.searchParams.get("token");

  const autenticacao = token ? await autenticarConexao(token) : null;

  if (!autenticacao) {
    enviar(ws, { type: "error", message: "Token inválido ou ausente." });
    ws.close(4001, "unauthorized");
    return;
  }

  const { terminalId, papel } = autenticacao;
  const par = obterOuCriarPar(terminalId);

  if (papel === "terminal") {
    if (par.terminalWs && par.terminalWs !== ws) {
      par.terminalWs.close(4002, "replaced");
    }
    par.terminalWs = ws;

    if (par.viewerWs) {
      enviar(ws, { type: "watch-request" });
    }
  } else {
    if (par.viewerWs && par.viewerWs !== ws) {
      enviar(ws, { type: "error", message: "Já existe alguém assistindo este terminal." });
      ws.close(4003, "viewer-busy");
      return;
    }
    par.viewerWs = ws;

    if (par.terminalWs) {
      enviar(par.terminalWs, { type: "watch-request" });
    } else {
      enviar(ws, { type: "waiting", message: "Aguardando o terminal conectar..." });
    }
  }

  ws.on("message", (dados) => {
    let mensagem;
    try {
      mensagem = JSON.parse(dados.toString());
    } catch {
      return;
    }

    const tiposRelevados = ["offer", "answer", "ice-candidate"];
    if (!tiposRelevados.includes(mensagem.type)) return;

    const destino = ws === par.terminalWs ? par.viewerWs : par.terminalWs;
    enviar(destino, mensagem);
  });

  ws.on("close", () => {
    if (papel === "terminal" && par.terminalWs === ws) {
      par.terminalWs = null;
      enviar(par.viewerWs, { type: "terminal-offline" });
    } else if (papel === "viewer" && par.viewerWs === ws) {
      par.viewerWs = null;
      enviar(par.terminalWs, { type: "viewer-left" });
    }
    limparParSeVazio(terminalId);
  });
});

servidorHttp.listen(PORTA, () => {
  console.log(`tv-signaling ouvindo na porta ${PORTA}`);
});
