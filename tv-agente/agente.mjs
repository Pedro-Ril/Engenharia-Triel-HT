#!/usr/bin/env node
/*
 * Agente nativo da TV Corporativa — roda no mini-PC (Windows ou
 * Linux) dedicado à TV física, fora do navegador (ver plano de
 * implementação em CLAUDE.md/histórico do projeto). Responsabilidades:
 *
 *   1. Ler um identificador real e persistente do sistema operacional
 *      (MachineGuid do registro no Windows, /etc/machine-id no Linux)
 *      — sobrevive a limpar cache/dados do navegador, só muda numa
 *      reinstalação do SO. É isso que garante "nunca perder o
 *      cadastro" do terminal.
 *   2. Lançar o Chrome/Edge instalado na máquina em modo kiosk
 *      IMEDIATAMENTE — com `?token=` se já pareado, ou só com
 *      `?hardwareId=` caso contrário (o player já sabe mostrar a tela
 *      do código e fazer seu próprio polling de pareamento nesse
 *      caso — reaproveitado de propósito: o agente NÃO espera parear
 *      antes de abrir o navegador, porque isso deixava a tela do
 *      código invisível — o agente só loga em stdout, que fica
 *      inacessível assim que o X toma conta da tela em modo gráfico).
 *      As flags do Chrome autoaceitam a captura de tela usada pela
 *      visualização ao vivo (só funciona porque é este agente quem
 *      lança o navegador, não o usuário manualmente).
 *   3. Em paralelo, se ainda não tinha token salvo, faz seu próprio
 *      pareamento contra o portal (mesmo endpoint que o player já usa)
 *      e guarda o token recebido num arquivo FORA do perfil do
 *      navegador — garante que o agente sempre tem sua própria cópia,
 *      mesmo que o cache do navegador seja limpo depois.
 *   4. Supervisionar o processo do navegador e relançar se cair.
 *   5. Verificar periodicamente (INTERVALO_VERIFICAR_CONFIG_MS) se há
 *      uma versão nova do próprio script (hash em
 *      GET /api/tv/agente/config) ou uma página inicial diferente
 *      configurada pra este terminal — se o hash mudou, baixa o
 *      script novo, sobrescreve a si mesmo e sai com código 1 pro
 *      supervisor do sistema operacional (systemd/Tarefa Agendada,
 *      ambos configurados pelo instalador pra reiniciar sozinhos)
 *      relançar já com o código novo; se só a página mudou, apenas
 *      reinicia o navegador com a URL nova, sem reiniciar o processo
 *      inteiro.
 *   6. Verificar num ciclo bem mais curto (INTERVALO_VERIFICAR_COMANDO_MS,
 *      GET /api/tv/agente/comando) se o admin pediu "Reiniciar
 *      terminal"/"Atualizar agente" manualmente — separado do item 5
 *      pra esses comandos manuais chegarem em segundos, não minutos.
 *   7. Só no Linux: verificar (INTERVALO_VERIFICAR_REDE_MS) se a
 *      máquina está sem rede (nem cabo nem Wi-Fi) via `nmcli` e, nesse
 *      caso, tentar conectar numa das redes Wi-Fi cadastradas em TV
 *      Corporativa → Configurações (lista única, compartilhada por
 *      todos os terminais — ver verificarConexaoRede/
 *      tentarReconectarWifi). A lista fica cacheada em disco (mesma
 *      pasta de token.json) pra o agente conseguir tentar reconectar
 *      mesmo sem conseguir falar com o portal nesse momento.
 *
 * Sem dependências além do Node.js já instalado no mini-PC — nenhum
 * `npm install` necessário lá (ver /api/tv/agente/instalar.sh e
 * instalar.ps1, que verificam se o Node está presente antes de
 * baixar este arquivo).
 *
 * Configuração via variável de ambiente PORTAL_TV_URL, setada pelo
 * instalador com a URL do portal detectada no momento do download —
 * nunca hardcoded aqui, pra o mesmo agente servir qualquer instalação
 * do portal.
 */

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus, freemem, homedir, networkInterfaces, platform, totalmem } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORTAL_URL = (process.env.PORTAL_TV_URL || "").replace(/\/+$/, "");

if (!PORTAL_URL) {
  console.error("Defina a variável de ambiente PORTAL_TV_URL antes de rodar o agente.");
  process.exit(1);
}

const EH_WINDOWS = platform() === "win32";

/*
 * No Windows o agente roda como SYSTEM (tarefa agendada), daí faz
 * sentido um caminho de máquina inteira (ProgramData). No Linux ele
 * roda como o usuário dedicado do kiosk (tvkiosk), sem escrita em
 * `/etc` — usar a pasta de dados do próprio usuário evita precisar de
 * privilégio nenhum, e continua satisfazendo o requisito original de
 * "fora do perfil do navegador" (não é o profile do Chrome).
 */
const DIRETORIO_DADOS = EH_WINDOWS
  ? path.join(process.env.PROGRAMDATA || "C:\\ProgramData", "PortalTrielHT", "tv-agente")
  : path.join(homedir(), ".local", "share", "portal-triel-ht", "tv-agente");

const ARQUIVO_TOKEN = path.join(DIRETORIO_DADOS, "token.json");
const ARQUIVO_HASH = path.join(DIRETORIO_DADOS, "versao.sha256");
/* Última lista de redes Wi-Fi recebida do portal (ver verificarConfiguracaoAgente) -- cache local pra sobreviver a ficar sem rede pra falar com o portal (ver verificarEReconectarRede). */
const ARQUIVO_REDES_WIFI = path.join(DIRETORIO_DADOS, "redes-wifi.json");
const ARQUIVO_SCRIPT_ATUAL = fileURLToPath(import.meta.url);
const INTERVALO_POLL_PAREAMENTO_MS = 5000;
const INTERVALO_RELANCAR_MS = 3000;
const INTERVALO_VERIFICAR_CONFIG_MS = 5 * 60 * 1000;
/*
 * Bem mais curto que INTERVALO_VERIFICAR_CONFIG_MS -- ficar minutos
 * sem tentar reconectar depois de perder a rede é ruim demais pra uma
 * TV de sinalização. Só usado no Linux (ver main()).
 */
const INTERVALO_VERIFICAR_REDE_MS = 30 * 1000;
/*
 * Bem mais curto que INTERVALO_VERIFICAR_CONFIG_MS de propósito — só
 * pra "Reiniciar terminal"/"Atualizar agente" (comando manual do
 * admin) chegarem em segundos, sem telemetria nem checagem de hash
 * junto (ver /api/tv/agente/comando, endpoint dedicado e leve).
 */
const INTERVALO_VERIFICAR_COMANDO_MS = 5000;
const CAMINHO_PADRAO = "/tv";

function garantirDiretorioDados() {
  if (!existsSync(DIRETORIO_DADOS)) {
    mkdirSync(DIRETORIO_DADOS, { recursive: true });
  }
}

function lerIdentificadorHardware() {
  if (EH_WINDOWS) {
    const saida = execFileSync(
      "reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
      { encoding: "utf8" }
    );
    const encontrado = saida.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);

    if (!encontrado) {
      throw new Error("Não foi possível ler o MachineGuid do registro do Windows.");
    }

    return encontrado[1].trim();
  }

  return readFileSync("/etc/machine-id", "utf8").trim();
}

function lerTokenSalvo() {
  if (!existsSync(ARQUIVO_TOKEN)) return null;

  try {
    const dados = JSON.parse(readFileSync(ARQUIVO_TOKEN, "utf8"));
    return typeof dados.deviceToken === "string" ? dados.deviceToken : null;
  } catch {
    return null;
  }
}

function salvarToken(token) {
  garantirDiretorioDados();
  writeFileSync(ARQUIVO_TOKEN, JSON.stringify({ deviceToken: token }, null, 2));
}

/*
 * Confere se o token salvo ainda é aceito pelo portal antes de
 * reutilizá-lo — sem isso, um terminal revogado pelo admin ficaria
 * preso mostrando a tela de pareamento no navegador pra sempre, já
 * que o agente nunca saberia que precisa parear de novo (o navegador
 * sozinho não tem como avisar o agente, são processos separados).
 * Falha de rede (sem `error.status`) não invalida o token — evita
 * reparear à toa só porque a rede caiu num boot.
 */
async function tokenAindaValido(token) {
  try {
    const resposta = await fetch(`${PORTAL_URL}/api/tv/heartbeat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    return resposta.status !== 401;
  } catch (error) {
    console.error("Não foi possível verificar o token salvo (rede indisponível):", error.message);
    return true;
  }
}

function calcularHash(conteudo) {
  return createHash("sha256").update(conteudo).digest("hex");
}

function lerHashSalvo() {
  if (!existsSync(ARQUIVO_HASH)) return null;

  try {
    return readFileSync(ARQUIVO_HASH, "utf8").trim();
  } catch {
    return null;
  }
}

function salvarHash(hash) {
  garantirDiretorioDados();
  writeFileSync(ARQUIVO_HASH, hash);
}

/*
 * Sobrescreve o próprio arquivo do script via escrita num temporário
 * seguido de rename (atômico no mesmo diretório, tanto em NTFS quanto
 * em sistemas de arquivo Linux comuns) — evita deixar um script
 * corrompido no disco se o processo cair no meio da escrita.
 */
function substituirScriptAtual(conteudoNovo) {
  const caminhoTemp = `${ARQUIVO_SCRIPT_ATUAL}.novo`;
  writeFileSync(caminhoTemp, conteudoNovo);
  renameSync(caminhoTemp, ARQUIVO_SCRIPT_ATUAL);
}

function obterHashLocal() {
  const salvo = lerHashSalvo();
  if (salvo) return salvo;

  const calculado = calcularHash(readFileSync(ARQUIVO_SCRIPT_ATUAL, "utf8"));
  salvarHash(calculado);
  return calculado;
}

/*
 * Compara o hash do script rodando agora com o hash que o portal
 * reporta como atual (GET /api/tv/agente/config) — se forem
 * diferentes, baixa o script novo, confere que o hash bate mesmo
 * (proteção contra download incompleto/corrompido) e substitui o
 * arquivo. Devolve true quando uma atualização foi aplicada, sinal
 * pra quem chamou reiniciar o processo.
 */
async function aplicarAtualizacaoSeHouver(hashRemoto) {
  const hashLocal = obterHashLocal();

  if (hashRemoto === hashLocal) return false;

  console.log("Nova versão do agente disponível — baixando...");

  const resposta = await fetch(`${PORTAL_URL}/api/tv/agente/download`);
  const conteudoNovo = await resposta.text();
  const hashBaixado = calcularHash(conteudoNovo);

  if (hashBaixado !== hashRemoto) {
    console.error("Hash do script baixado não confere com o esperado — atualização abortada.");
    return false;
  }

  substituirScriptAtual(conteudoNovo);
  salvarHash(hashBaixado);
  console.log("Agente atualizado — reiniciando processo...");
  return true;
}

/*
 * IP de rede local da própria máquina (não o que o servidor vê na
 * conexão — pode divergir atrás de NAT) — o que ajuda de verdade um
 * técnico a achar fisicamente o terminal na rede. Primeira interface
 * IPv4 não-interna que encontrar; null se a máquina não tiver nenhuma
 * (incomum, mas não trava o agente por causa disso).
 */
function obterIpLocal() {
  const interfaces = networkInterfaces();

  for (const nome of Object.keys(interfaces)) {
    for (const iface of interfaces[nome] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }

  return null;
}

/*
 * %CPU via amostragem de os.cpus() antes/depois de uma janela curta —
 * funciona em Windows e Linux (diferente de os.loadavg(), que o
 * Windows não suporta de verdade).
 */
function medirUsoCpu() {
  const antes = cpus();

  return new Promise((resolve) => {
    setTimeout(() => {
      const depois = cpus();
      let idleDelta = 0;
      let totalDelta = 0;

      for (let i = 0; i < antes.length; i++) {
        const a = antes[i].times;
        const b = depois[i].times;
        const totalA = a.user + a.nice + a.sys + a.idle + a.irq;
        const totalB = b.user + b.nice + b.sys + b.idle + b.irq;
        idleDelta += b.idle - a.idle;
        totalDelta += totalB - totalA;
      }

      const percentual = totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0;
      resolve(Math.round(percentual * 10) / 10);
    }, 200);
  });
}

function medirUsoMemoria() {
  const total = totalmem();
  const livre = freemem();
  return Math.round(((total - livre) / total) * 1000) / 10;
}

/*
 * Só no Linux (ver instalar.sh -- instala e habilita o NetworkManager).
 * "cabeada"/"wifi" vencem por prioridade nessa ordem: se qualquer
 * interface ethernet estiver "connected", nem olha pra Wi-Fi. tipo
 * null (não "desconectado") sinaliza falha em rodar o `nmcli` em si
 * (não instalado ainda -- terminal antigo cujo instalador não rodou de
 * novo, ver comentário em instalar.sh sobre autoupdate só trocar o
 * agente.mjs) -- diferente de "desconectado" (nmcli funcionou, mas
 * nenhuma interface está de fato conectada).
 */
function verificarConexaoRede() {
  try {
    const saidaStatus = execFileSync(
      "nmcli",
      ["-t", "-f", "DEVICE,TYPE,STATE", "device", "status"],
      { encoding: "utf8" }
    );
    const dispositivos = saidaStatus
      .trim()
      .split("\n")
      .map((linha) => linha.split(":"));

    if (dispositivos.some(([, tipo, estado]) => tipo === "ethernet" && estado === "connected")) {
      return { tipo: "cabeada", ssid: null, intensidade: null };
    }

    const conectadaWifi = dispositivos.some(
      ([, tipo, estado]) => tipo === "wifi" && estado === "connected"
    );
    if (!conectadaWifi) {
      return { tipo: "desconectado", ssid: null, intensidade: null };
    }

    const saidaRedes = execFileSync("nmcli", ["-t", "-f", "IN-USE,SSID,SIGNAL", "dev", "wifi"], {
      encoding: "utf8",
    });
    const redeAtiva = saidaRedes
      .trim()
      .split("\n")
      .map((linha) => linha.split(":"))
      .find(([emUso]) => emUso === "*");

    return {
      tipo: "wifi",
      ssid: redeAtiva?.[1] ?? null,
      intensidade: redeAtiva?.[2] ? Number(redeAtiva[2]) : null,
    };
  } catch (error) {
    console.error("Erro ao verificar estado da conexão de rede (nmcli):", error.message);
    return { tipo: null, ssid: null, intensidade: null };
  }
}

/* Tenta cada rede em ordem de prioridade, parando na primeira que conectar. Nunca lança -- só loga sucesso/erro (mesmo espírito de iniciarProcessoControleCursor). */
function tentarReconectarWifi(redes) {
  for (const rede of redes) {
    try {
      console.log(`Sem conexão -- tentando rede Wi-Fi "${rede.ssid}"...`);
      execFileSync("nmcli", ["device", "wifi", "connect", rede.ssid, "password", rede.senha], {
        stdio: "ignore",
      });
      console.log(`Conectado à rede Wi-Fi "${rede.ssid}".`);
      return;
    } catch (error) {
      console.error(`Falha ao conectar na rede Wi-Fi "${rede.ssid}":`, error.message);
    }
  }
}

function salvarRedesWifiCache(redes) {
  try {
    writeFileSync(ARQUIVO_REDES_WIFI, JSON.stringify(redes), "utf8");
  } catch (error) {
    console.error("Erro ao gravar cache local de redes Wi-Fi:", error.message);
  }
}

function lerRedesWifiCache() {
  try {
    return JSON.parse(readFileSync(ARQUIVO_REDES_WIFI, "utf8"));
  } catch {
    /* Ainda sem cache (agente nunca conseguiu falar com o portal) -- nada pra tentar. */
    return [];
  }
}

/*
 * Comando pedido pelo admin em Dispositivos (ver
 * POST /api/admin/tv/terminais/[id]/comando), entregue no próximo
 * poll deste agente — não resgata um agente travado, só funciona
 * enquanto ele continua consultando normalmente.
 *
 * "reiniciar_maquina" precisa de privilégio pra reiniciar o SO: no
 * Linux o agente roda como o usuário sem privilégios do kiosk
 * (tvkiosk), então depende da regra sudoers sem senha que o
 * instalador cadastra só pra este comando específico (ver
 * instalar.sh) — sem ela, a chamada falha e só loga o erro, não
 * derruba o agente. No Windows um usuário comum já pode reiniciar a
 * própria máquina, sem precisar de nada especial.
 */
function executarComandoRemoto(comando, processoAtual) {
  if (comando === "reiniciar_maquina") {
    console.log("Reinicialização da máquina solicitada pelo admin...");
    try {
      if (EH_WINDOWS) {
        execFileSync("shutdown", ["/r", "/t", "5"]);
      } else {
        execFileSync("sudo", ["/sbin/reboot"]);
      }
    } catch (error) {
      console.error("Não foi possível reiniciar a máquina:", error.message);
    }
  } else if (comando === "atualizar_agente") {
    console.log("Reinício do agente solicitado pelo admin...");
    /* Mesmo cuidado do self-update por hash — ver verificarConfiguracaoAgente. */
    processoAtual?.removeAllListeners("exit");
    processoAtual?.kill();
    process.exit(1);
  }
}

async function aguardarPareamento(hardwareId) {
  console.log(
    "Aguardando pareamento — cadastre este terminal em Administração → TV Corporativa → Dispositivos com o código abaixo."
  );

  let ultimoCodigoExibido = null;

  for (;;) {
    try {
      const resposta = await fetch(
        `${PORTAL_URL}/api/tv/pareamento?hardwareId=${encodeURIComponent(hardwareId)}`
      );
      const corpo = await resposta.json();

      if (corpo.ok && corpo.data?.pareado && corpo.data.deviceToken) {
        return corpo.data.deviceToken;
      }

      if (corpo.ok && corpo.data?.codigo && corpo.data.codigo !== ultimoCodigoExibido) {
        ultimoCodigoExibido = corpo.data.codigo;
        console.log(`Código de pareamento: ${corpo.data.codigo}`);
      }
    } catch (error) {
      console.error("Erro ao consultar pareamento:", error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, INTERVALO_POLL_PAREAMENTO_MS));
  }
}

function localizarNavegador() {
  const candidatos = EH_WINDOWS
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        // Em algumas versões do Ubuntu, "apt-get install chromium"/"chromium-browser"
        // é só um pacote de transição que instala a versão snap (binário fica
        // aqui, não em /usr/bin) — cobre esse caso sem precisar saber de
        // antemão qual dos dois o apt resolveu na máquina.
        "/snap/bin/chromium",
      ];

  const encontrado = candidatos.find((caminho) => existsSync(caminho));

  if (!encontrado) {
    throw new Error(
      "Nenhum navegador compatível encontrado (Chrome ou Edge). Instale um deles no mini-PC antes de rodar o agente."
    );
  }

  return encontrado;
}

/*
 * Sem token ainda (primeiro boot, antes de parear): abre com
 * ?hardwareId= em vez de bloquear esperando o pareamento acontecer.
 * O player (TvPlayer.tsx) já sabe mostrar a tela de código e fazer
 * seu próprio polling de pareamento nesse caso — reaproveita esse
 * fluxo já existente em vez do agente tentar mostrar o código
 * sozinho (não tem como: uma vez que o X toma conta da tela em modo
 * gráfico, o stdout do agente fica invisível pra quem olha a TV).
 */
/*
 * --kiosk sozinho conta com um window manager pra aplicar as dicas de
 * fullscreen (EWMH) que o Chrome/Chromium pede — mas o X deste kiosk é
 * deliberadamente "puro", sem nenhum WM rodando (ver instalar.sh), então
 * não tem quem force a janela a ocupar a tela inteira. Visto ao vivo
 * numa build de Chromium ARM (Raspberry Pi): a janela abria ocupando só
 * metade da tela física, mesmo com --kiosk e com o X já na resolução
 * nativa correta. Resolvido lendo a geometria real da tela via `xrandr`
 * e passando --window-size/--window-position explícitos — não depende
 * de nenhum WM pra funcionar.
 */
function detectarResolucaoTela() {
  if (EH_WINDOWS) return null;

  try {
    const saida = execFileSync("xrandr", ["--query"], { encoding: "utf8" });
    const match = saida.match(/ connected(?: primary)? (\d+)x(\d+)\+(\d+)\+(\d+)/);
    if (!match) return null;

    const [, largura, altura, x, y] = match;
    return { largura: Number(largura), altura: Number(altura), x: Number(x), y: Number(y) };
  } catch (error) {
    console.error("Não foi possível detectar a resolução da tela via xrandr:", error.message);
    return null;
  }
}

/*
 * `caminhoInicial` pode vir com sua própria query string (ex:
 * "/estoque-equipamentos-usados/painel?fullscreen=1", pra usar como
 * página inicial de um terminal específico) — concatenar "?token=..."
 * direto quebrava isso, produzindo dois "?" na mesma URL
 * ("...painel?fullscreen=1?token=xxx"), o que faz o parâmetro
 * "fullscreen" virar "1?token=xxx" em vez de "1" (o fullscreen
 * automático nunca dispara) e o "token" nunca chegar como parâmetro de
 * verdade (o pareamento quebra junto). URL/URLSearchParams monta isso
 * certo nos dois casos, com ou sem query string já presente.
 */
function lancarKiosk(caminhoNavegador, token, hardwareId, caminhoInicial) {
  const urlPlayerObj = new URL(caminhoInicial, PORTAL_URL);
  if (token) {
    urlPlayerObj.searchParams.set("token", token);
  } else {
    urlPlayerObj.searchParams.set("hardwareId", hardwareId);
    /* Só faz sentido antes de parear -- é a tela do código quem mostra isso, pra ajudar a identificar fisicamente o terminal certo (ex: vários lado a lado) na hora de digitar o código no admin. */
    const ipLocal = obterIpLocal();
    if (ipLocal) urlPlayerObj.searchParams.set("ip", ipLocal);
  }
  const urlPlayer = urlPlayerObj.toString();

  const resolucaoTela = detectarResolucaoTela();
  if (resolucaoTela) {
    console.log(
      `Resolução da tela detectada via xrandr: ${resolucaoTela.largura}x${resolucaoTela.altura} em (${resolucaoTela.x},${resolucaoTela.y})`
    );
  }

  const flags = [
    `--app=${urlPlayer}`,
    "--kiosk",
    ...(resolucaoTela
      ? [
          `--window-size=${resolucaoTela.largura},${resolucaoTela.altura}`,
          `--window-position=${resolucaoTela.x},${resolucaoTela.y}`,
        ]
      : []),
    "--use-fake-ui-for-media-stream",
    "--auto-select-desktop-capture-source=Entire screen",
    "--lang=en-US",
    /*
     * A extensão de captura de tela (instalada via política, ver
     * instalar.sh) nunca vai ter o "verified_contents.json" assinado
     * que só a Chrome Web Store consegue gerar — sem essa flag, o
     * verificador de integridade do Chrome trata isso como corrompido
     * ("Content verify job failed ... reason:1") e trava o service
     * worker dela pra sempre (DidStartWorkerFail em loop, visto ao
     * vivo), fazendo chrome.runtime.sendMessage nunca receber
     * resposta. "none" desliga esse verificador por completo.
     */
    "--extension-content-verification=none",
    /*
     * WebRtcPipeWireCapturer: sem ambiente de desktop nem compositor
     * neste X mínimo (ver instalar.sh — kiosk puro), não existe
     * xdg-desktop-portal nem PipeWire rodando, e o Chrome moderno no
     * Linux tenta capturar tela via PipeWire/portal por padrão quando
     * disponível — forçando de volta a captura X11 nativa evita isso.
     * Translate: forçar LANG=en_US (ver env mais abaixo) faz o Chrome
     * achar que a UI está em inglês enquanto o conteúdo do portal está
     * em português, disparando a barra de tradução automática — sem
     * lugar num kiosk sem ninguém pra clicar "Não" (visto ao vivo).
     * (Duas features no mesmo --disable-features de propósito: o
     * Chrome só respeita a ÚLTIMA ocorrência dessa flag se repetida.)
     */
    "--disable-features=WebRtcPipeWireCapturer,Translate",
    /*
     * navigator.mediaDevices (getDisplayMedia, usado pela
     * visualização ao vivo) só existe em contexto seguro (HTTPS ou
     * localhost) — a maioria das instalações reais acessa o portal
     * por HTTP num IP de rede interna (ex: http://192.168.5.142:3000),
     * que o Chrome trata como inseguro, deixando navigator.mediaDevices
     * undefined. Essa flag manda o Chrome tratar essa origem
     * específica como segura mesmo sendo HTTP puro — só funciona
     * combinada com --user-data-dir apontando pra um perfil
     * não-padrão (restrição documentada do Chrome; sem isso a flag é
     * ignorada silenciosamente).
     */
    `--unsafely-treat-insecure-origin-as-secure=${PORTAL_URL}`,
    `--user-data-dir=${path.join(DIRETORIO_DADOS, "chrome-profile")}`,
    "--noerrdialogs",
    "--disable-infobars",
    "--no-first-run",
    "--overscroll-history-navigation=0",
    /*
     * Log geral do Chrome pro arquivo agente.log (ver redirecionamento
     * em instalar.sh) — infraestrutura de diagnóstico permanente,
     * criada depois de descobrir ao vivo que getDisplayMedia()
     * rejeitava a captura com "NotReadableError" mesmo com a fonte
     * "selecionada": o log mostrou device.id=screen:0:0 sendo rejeitado
     * por screen_capturer->SelectSource(), ou seja, o atalho de
     * auto-select do getDisplayMedia fabrica um ID de tela que não
     * bate com o ID real que o capturador X11/XRandR espera. Sem esse
     * log não haveria como enxergar isso (stdout do Chrome fica preso
     * atrás do X, invisível na tela).
     */
    "--enable-logging=stderr",
    "--v=1",
  ];

  /*
   * getDisplayMedia() nesse cenário fica sujeito ao bug descrito
   * acima — a extensão de captura (ver src/lib/tv/extensao-captura.ts)
   * usa chrome.desktopCapture, que passa pela enumeração REAL de telas
   * (o mesmo capturador X11 usado internamente), evitando o ID
   * fabricado. Instalada via política do Chrome (ExtensionInstallForcelist,
   * ver instalar.sh) — Google Chrome oficial ignora --load-extension
   * fora do modo desenvolvedor, então o agente não precisa (e não
   * consegue) carregá-la sozinho; o próprio Chrome busca e instala.
   * TvPlayer.tsx detecta se ela está presente (chrome.runtime
   * injetado) e cai pro getDisplayMedia() padrão quando não está
   * (ex: Windows, ainda sem essa política).
   */

  /*
   * --auto-select-desktop-capture-source casa pelo TÍTULO exibido no
   * diálogo do chrome.desktopCapture, e esse título só sai em inglês
   * se o Chrome realmente estiver rodando em en-US — visto ao vivo:
   * mesmo com --lang=en-US, o diálogo apareceu em português ("Ecrã
   * inteiro"), quase certamente porque o --user-data-dir persistente
   * já tinha uma preferência de idioma salva de testes anteriores
   * (antes dessa flag existir), e --lang sozinho não sobrescreve isso
   * depois do primeiro uso do perfil. Forçar LANG/LC_ALL no ambiente
   * do processo é mais robusto: cobre tanto esse caso quanto qualquer
   * diálogo nativo que dependa de locale do SO em vez do --lang do
   * Chrome.
   */
  const env = { ...process.env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8", LANGUAGE: "en_US" };

  return spawn(caminhoNavegador, flags, { stdio: "inherit", env });
}

/*
 * Testado ao vivo (TLT01): o Chrome NÃO esconde o cursor sozinho por
 * inatividade nesta página -- esse comportamento só existe pra
 * conteúdo que usa a Fullscreen API de verdade (vídeo em tela cheia
 * etc.), que o player da TV não usa. Quem escondia o cursor sempre
 * foi só a flag "-nocursor" do próprio X (ver instalar.sh) -- sem
 * ela, o X desenha o cursor normalmente o tempo todo, mesmo parado.
 *
 * Por isso, no Linux, pra uma TV passiva (exibirCursor desligado, o
 * padrão) continuar sem cursor visível, o agente precisa rodar
 * "unclutter" -- ferramenta padrão de kiosk que esconde o cursor
 * depois de alguns segundos parado e mostra de novo em qualquer
 * movimento -- e desligá-lo quando "exibirCursor" estiver ligado
 * (ex: TLT01), deixando o cursor sempre visível.
 *
 * No Windows a situação é diferente (não testada ao vivo ainda): o
 * agente roda como SYSTEM via tarefa agendada, o que pode impedir o
 * cursor de ser desenhado nessa sessão de qualquer jeito -- mantém-se
 * aqui o "nudge" (mover o mouse sinteticamente) como tentativa quando
 * exibirCursor estiver ligado, mas isso ainda não foi confirmado
 * funcionando de verdade num terminal Windows real.
 */
function iniciarProcessoControleCursor(exibirCursor) {
  if (EH_WINDOWS) {
    if (!exibirCursor) return null;

    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "while ($true) {",
      "  $p = [System.Windows.Forms.Cursor]::Position",
      "  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(($p.X + 1), $p.Y)",
      "  Start-Sleep -Milliseconds 200",
      "  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($p.X, $p.Y)",
      "  Start-Sleep -Seconds 3",
      "}",
    ].join("; ");

    return spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script], {
      stdio: "ignore",
    });
  }

  if (exibirCursor) return null;

  try {
    execFileSync("which", ["unclutter"], { stdio: "ignore" });
  } catch {
    console.error(
      '"unclutter" não está instalado (necessário no Linux pra esconder o cursor quando exibirCursor estiver desligado) -- rode "sudo apt-get install unclutter".'
    );
    return null;
  }

  /*
   * Flags de traço único -- testado ao vivo (TLT01): o pacote "unclutter"
   * do apt instala a versão clássica (não "unclutter-xfixes"), cujas
   * flags são "-idle"/"-jitter", não "--timeout"/"--jitter". Passar as
   * flags erradas faz o processo imprimir a mensagem de uso e sair
   * (código 1) na hora, sem nenhum erro visível pra este script -- só
   * silenciosamente não escondia o cursor. "-root" garante que também
   * some sobre a janela raiz, não só sobre a do Chrome.
   */
  return spawn("unclutter", ["-idle", "3", "-jitter", "2", "-root"], { stdio: "ignore" });
}

/* true = o agente deveria ter um processo de controle de cursor rodando agora, dado o valor atual de "exibirCursor". */
function precisaDeProcessoControleCursor(exibirCursor) {
  return EH_WINDOWS ? exibirCursor : !exibirCursor;
}

function pararProcessoControleCursor(processo) {
  if (!processo) return;
  processo.kill();
}

/*
 * Um restart do agente (autoupdate, queda, reboot) não mata sozinho
 * o processo de nudge que uma instância ANTERIOR possa ter deixado
 * rodando -- ele não é filho do novo processo Node, e nada avisa esse
 * órfão que o agente saiu. Sem essa limpeza, ligar/desligar
 * "exibirCursor" no admin depois de um restart no meio do caminho não
 * faz efeito nenhum: o cursor continua sendo movido por um processo
 * que ninguém mais controla. Best-effort, roda uma vez no início do
 * main() -- se não achar nada (comando falha), não é erro de verdade.
 */
function limparProcessoControleCursorOrfao() {
  if (EH_WINDOWS) {
    try {
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*Windows.Forms.Cursor*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
        ],
        { stdio: "ignore" }
      );
    } catch {
      /* Nenhum processo encontrado, ou powershell indisponível -- sem problema. */
    }
    return;
  }

  try {
    execFileSync("pkill", ["-x", "unclutter"], { stdio: "ignore" });
  } catch {
    /* pkill sai com código != 0 quando não encontra nada -- não é erro de verdade aqui. */
  }
}

async function main() {
  garantirDiretorioDados();

  const hardwareId = lerIdentificadorHardware();
  console.log("Identificador de hardware:", hardwareId);

  let token = lerTokenSalvo();

  if (token && !(await tokenAindaValido(token))) {
    console.log("Token salvo não é mais válido (terminal revogado) — parear novamente.");
    token = null;
  }

  const caminhoNavegador = localizarNavegador();
  console.log("Iniciando modo kiosk com", caminhoNavegador);

  limparProcessoControleCursorOrfao();

  let caminhoAtual = CAMINHO_PADRAO;
  let processoAtual = null;
  let exibindoCursorAtual = false;
  let processoControleCursor = null;
  /* Atualizados por verificarEReconectarRede (Linux, a cada INTERVALO_VERIFICAR_REDE_MS) e lidos por verificarConfiguracaoAgente pra reportar junto com IP/CPU/memória. */
  let tipoConexaoAtual = null;
  let wifiSsidAtual = null;
  let wifiIntensidadeAtual = null;

  function iniciarESupervisionar() {
    processoAtual = lancarKiosk(caminhoNavegador, token, hardwareId, caminhoAtual);

    processoAtual.on("exit", (codigo) => {
      console.log(
        `Navegador encerrou (código ${codigo}) — relançando em ${INTERVALO_RELANCAR_MS / 1000}s...`
      );
      setTimeout(iniciarESupervisionar, INTERVALO_RELANCAR_MS);
    });
  }

  /*
   * Lança já, com token (se já pareado) ou só com o hardwareId — sem
   * esperar o pareamento acontecer primeiro. O pareamento em si, se
   * ainda não tiver token, roda em paralelo (abaixo) e só serve pra
   * este agente guardar sua própria cópia do token (pra sobreviver a
   * limpar dados do navegador, e pra poder chamar
   * /api/tv/agente/config) — o próprio player já faz seu polling de
   * pareamento e mostra a tela do código sozinho.
   */
  iniciarESupervisionar();

  /*
   * Verificação periódica de atualização do agente e de troca de
   * página inicial — roda em paralelo à supervisão do navegador
   * acima. Fica esperando ter um token (pode ainda não estar pareado)
   * antes de consultar /api/tv/agente/config, que exige autenticação
   * de terminal. Erros de rede aqui nunca derrubam o agente: só tenta
   * de novo no próximo ciclo.
   *
   * Chamada uma vez já no início (não só dentro do setInterval) —
   * sem isso, um terminal já pareado que só reinicia a máquina (sem
   * o agente ter caído por outro motivo) ficava rodando a versão
   * antiga por até INTERVALO_VERIFICAR_CONFIG_MS (5min) depois do
   * boot antes de notar que existia uma versão nova.
   */
  async function verificarConfiguracaoAgente() {
    if (!token) return;

    try {
      const hashLocal = obterHashLocal();
      const ip = obterIpLocal();
      const cpuPercentual = await medirUsoCpu();
      const memoriaPercentual = medirUsoMemoria();

      const parametros = new URLSearchParams({
        hashAtual: hashLocal,
        cpuPercentual: String(cpuPercentual),
        memoriaPercentual: String(memoriaPercentual),
        sistemaOperacional: EH_WINDOWS ? "windows" : "linux",
      });
      if (ip) parametros.set("ip", ip);
      if (tipoConexaoAtual) parametros.set("tipoConexao", tipoConexaoAtual);
      if (wifiSsidAtual) parametros.set("wifiSsid", wifiSsidAtual);
      if (wifiIntensidadeAtual !== null) parametros.set("wifiIntensidade", String(wifiIntensidadeAtual));

      const resposta = await fetch(`${PORTAL_URL}/api/tv/agente/config?${parametros.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const corpo = await resposta.json();
      if (!corpo.ok) return;

      /* Cacheia sempre que o portal responder com sucesso -- é essa cópia local que verificarEReconectarRede usa quando a rede cai e o agente não consegue mais falar com o portal. */
      if (Array.isArray(corpo.data.redesWifi)) {
        salvarRedesWifiCache(corpo.data.redesWifi);
      }

      if (corpo.data.comando) {
        executarComandoRemoto(corpo.data.comando, processoAtual);
      }

      const precisaReiniciarProcesso = await aplicarAtualizacaoSeHouver(corpo.data.hash);
      if (precisaReiniciarProcesso) {
        /*
         * Mata o Chrome explicitamente antes de sair — sem isso ele
         * fica órfão preso no mesmo --user-data-dir, e o próximo
         * processo do agente (relançado pelo loop do .xinitrc) trava
         * ao tentar abrir o Chrome de novo ("user data directory is
         * already in use"). O .xinitrc relança "node agente.mjs" num
         * loop (ver instalar.sh) em vez de dar `exec` nele, então essa
         * saída não derruba o X — só o Chrome pisca fechando/abrindo
         * de novo, sem passar pelo ciclo inteiro de getty/autologin.
         */
        processoAtual?.removeAllListeners("exit");
        processoAtual?.kill();
        process.exit(1);
      }

      const novoCaminho = corpo.data.caminhoInicial || CAMINHO_PADRAO;
      if (novoCaminho !== caminhoAtual) {
        console.log(`Página inicial mudou (${caminhoAtual} → ${novoCaminho}) — relançando navegador...`);
        caminhoAtual = novoCaminho;
        processoAtual.removeAllListeners("exit");
        processoAtual.kill();
        iniciarESupervisionar();
      }

      const novoExibirCursor = Boolean(corpo.data.exibirCursor);
      const precisaAgora = precisaDeProcessoControleCursor(novoExibirCursor);

      if (novoExibirCursor !== exibindoCursorAtual) {
        console.log(`Exibir cursor mudou (${exibindoCursorAtual} → ${novoExibirCursor}).`);
        exibindoCursorAtual = novoExibirCursor;
        pararProcessoControleCursor(processoControleCursor);
        processoControleCursor = precisaAgora ? iniciarProcessoControleCursor(novoExibirCursor) : null;
      } else if (precisaAgora && !processoControleCursor) {
        /*
         * Já devia estar rodando, mas iniciarProcessoControleCursor()
         * falhou da última vez (ex: unclutter ainda não instalado no
         * Linux) -- tenta de novo a cada poll, sem precisar reiniciar
         * o agente inteiro depois de instalar a dependência que faltava.
         */
        processoControleCursor = iniciarProcessoControleCursor(novoExibirCursor);
      }
    } catch (error) {
      console.error("Erro ao verificar atualização/configuração do agente:", error.message);
    }
  }

  verificarConfiguracaoAgente();
  setInterval(verificarConfiguracaoAgente, INTERVALO_VERIFICAR_CONFIG_MS);

  /*
   * Só no Linux -- verifica se a máquina está sem rede nenhuma (nem
   * cabo, nem Wi-Fi) e, nesse caso, tenta conectar numa das redes
   * cacheadas (ver ARQUIVO_REDES_WIFI). Também mantém
   * tipoConexaoAtual/wifiSsidAtual/wifiIntensidadeAtual atualizados pra
   * verificarConfiguracaoAgente reportar ao portal.
   */
  if (!EH_WINDOWS) {
    async function verificarEReconectarRede() {
      const estado = verificarConexaoRede();
      tipoConexaoAtual = estado.tipo;
      wifiSsidAtual = estado.ssid;
      wifiIntensidadeAtual = estado.intensidade;

      if (estado.tipo !== "desconectado") return;

      const redesCache = lerRedesWifiCache();
      if (redesCache.length > 0) {
        tentarReconectarWifi(redesCache);
      }
    }

    verificarEReconectarRede();
    setInterval(verificarEReconectarRede, INTERVALO_VERIFICAR_REDE_MS);
  }

  /*
   * Checagem separada e rápida só de comando pendente — reiniciar
   * máquina/atualizar agente pedidos manualmente pelo admin não podem
   * esperar até 5min do ciclo acima.
   */
  setInterval(async () => {
    if (!token) return;

    try {
      const resposta = await fetch(`${PORTAL_URL}/api/tv/agente/comando`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const corpo = await resposta.json();
      if (corpo.ok && corpo.data.comando) {
        executarComandoRemoto(corpo.data.comando, processoAtual);
      }
    } catch {
      /* Sem conexão momentânea — tenta de novo no próximo ciclo. */
    }
  }, INTERVALO_VERIFICAR_COMANDO_MS);

  if (!token) {
    aguardarPareamento(hardwareId).then((tokenPareado) => {
      token = tokenPareado;
      salvarToken(token);
      console.log("Terminal pareado — token salvo em", ARQUIVO_TOKEN);
      verificarConfiguracaoAgente();
    });
  }
}

main().catch((error) => {
  console.error("Erro fatal no agente da TV Corporativa:", error);
  process.exit(1);
});
