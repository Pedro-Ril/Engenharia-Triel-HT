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
const ARQUIVO_SCRIPT_ATUAL = fileURLToPath(import.meta.url);
const INTERVALO_POLL_PAREAMENTO_MS = 5000;
const INTERVALO_RELANCAR_MS = 3000;
const INTERVALO_VERIFICAR_CONFIG_MS = 5 * 60 * 1000;
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
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser", "/usr/bin/chromium"];

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
function lancarKiosk(caminhoNavegador, token, hardwareId, caminhoInicial) {
  const urlPlayer = token
    ? `${PORTAL_URL}${caminhoInicial}?token=${encodeURIComponent(token)}`
    : `${PORTAL_URL}${caminhoInicial}?hardwareId=${encodeURIComponent(hardwareId)}`;

  const flags = [
    `--app=${urlPlayer}`,
    "--kiosk",
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

  let caminhoAtual = CAMINHO_PADRAO;
  let processoAtual = null;

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

      const resposta = await fetch(`${PORTAL_URL}/api/tv/agente/config?${parametros.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const corpo = await resposta.json();
      if (!corpo.ok) return;

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
    } catch (error) {
      console.error("Erro ao verificar atualização/configuração do agente:", error.message);
    }
  }

  verificarConfiguracaoAgente();
  setInterval(verificarConfiguracaoAgente, INTERVALO_VERIFICAR_CONFIG_MS);

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
