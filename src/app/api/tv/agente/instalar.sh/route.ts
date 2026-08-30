import { NextResponse } from "next/server";

import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { buscarConfigTv } from "@/lib/tv/config";
import { EXTENSAO_CAPTURA_ID } from "@/lib/tv/extensao-captura";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Comando de instalação de uma linha só pro Linux:
 *   curl -fsSL https://<portal>/api/tv/agente/instalar.sh | sudo bash
 *
 * A URL do portal embutida no script gerado vem, em ordem de
 * preferência: (1) portal_tv_config.url_agente, se o admin configurou
 * um endereço específico pros mini-PCs alcançarem o portal (ex: IP de
 * rede interna, diferente do que o admin usa no navegador) em TV
 * Corporativa → Configurações; (2) senão, a origem da própria
 * requisição. Rota pública (ver rotas-publicas.ts, prefixo "/api/tv"):
 * quem baixa é um mini-PC recém-formatado, sem sessão nenhuma no
 * portal.
 *
 * Instala Node.js (via NodeSource) e Google Chrome se não encontrar
 * nenhum navegador compatível já instalado — só sabe fazer isso via
 * apt (Debian/Ubuntu); noutra distro, para com uma mensagem clara em
 * vez de tentar adivinhar o gerenciador de pacotes certo. Precisa de
 * internet no mini-PC pra baixar os pacotes. O script gerado usa só
 * ASCII (sem acento/travessão) — mesmo bash lidando melhor com UTF-8
 * que o `irm | iex` do PowerShell, uma imagem mínima em locale C
 * ainda pode exibir/gravar acentuação errada, e evitar isso de
 * propósito custa nada aqui.
 *
 * Kiosk puro, sem ambiente de desktop nem tela de login (decisão
 * explícita — um systemd service de sistema, como a versão anterior
 * deste script usava, roda ANTES de qualquer sessão gráfica existir:
 * sem DISPLAY pra desenhar nada, e o Chrome também recusa rodar como
 * root sem --no-sandbox, então o navegador nunca aparecia de verdade).
 * A cadeia agora é: getty autologin no console (tty1, sem senha) →
 * login desse usuário dedicado dispara `startx` → `.xinitrc` desliga
 * o gerenciador de energia da tela e entra num loop relançando o
 * agente (que já lança o Chrome em --kiosk). Se o agente cair, o
 * loop relança só ele — SEM derrubar o X (o `exec node ...` de antes
 * fazia o X inteiro cair junto e voltar pro ciclo de getty/autologin,
 * o que piscava a tela de login por alguns segundos toda vez que o
 * agente se auto-atualizava; visto ao vivo e incômodo o bastante pra
 * valer essa troca). Se o X em si cair (falha real, não
 * autoatualização), aí sim volta pro getty/autologin — reinício
 * automático "de graça", sem precisar de um systemd service dedicado
 * pro agente em si.
 *
 * `/etc/X11/Xwrapper.config` do Debian/Ubuntu vem com
 * `allowed_users=console` por padrão, que bloqueia esse `startx` do
 * tvkiosk com "Only console users are allowed to run the X server" —
 * descoberto testando ao vivo numa Ubuntu real (o autologin sozinho
 * não satisfaz essa checagem). Corrigido aqui pra `allowed_users=anybody`
 * — aceitável numa máquina de uso único e dedicado como essa.
 *
 * Também cadastra uma regra sudoers restrita liberando só
 * `/sbin/reboot` sem senha pro tvkiosk — usada quando o admin manda
 * "Reiniciar terminal" em Dispositivos (ver COMANDOS_AGENTE); sem
 * privilégio de root de verdade, o usuário sem privilégios do kiosk
 * não conseguiria reiniciar a máquina sozinho.
 *
 * stdout/stderr do agente (e do Chrome, herdado via stdio:'inherit'
 * em tv-agente/agente.mjs) são redirecionados pro arquivo
 * $DIR/agente.log em vez de ficar preso na tty1 (invisível assim que
 * o X toma conta da tela em modo gráfico) — é o único jeito de
 * diagnosticar algo remotamente depois que o kiosk já está rodando,
 * ver esse arquivo via SSH (`cat /opt/portal-triel-ht/tv-agente/agente.log`).
 * Sobrescrito a cada reinício do processo (sem rotação) — só importa
 * a última execução, não histórico.
 *
 * Extensão de captura de tela (ver src/lib/tv/extensao-captura.ts):
 * Google Chrome oficial ignora --load-extension fora do modo
 * desenvolvedor (confirmado ao vivo), então a instalação dela usa a
 * política empresarial `ExtensionInstallForcelist`, apontando pra um
 * manifesto de atualização (protocolo Omaha) servido pelo próprio
 * portal — o Chrome baixa, verifica a assinatura e instala sozinho,
 * sem precisar de nenhum arquivo local escrito por este script. Essa
 * mesma política também desliga a tradução automática
 * (`TranslateEnabled: false`) — forçar LANG=en_US no agente (ver
 * tv-agente/agente.mjs) faz o Chrome achar que a UI está em inglês
 * enquanto o conteúdo do portal está em português, disparando a barra
 * de tradução (visto ao vivo); a flag --disable-features=Translate
 * sozinha não bastou, a política é o mecanismo documentado de verdade.
 */
async function handleGET(request: Request) {
  const config = await buscarConfigTv();
  const origem = config.urlAgente || new URL(request.url).origin;

  const script = `#!/usr/bin/env bash
set -e

PORTAL_URL="${origem}"
DIR="/opt/portal-triel-ht/tv-agente"
KIOSK_HOME="/home/tvkiosk"

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode este script como root (sudo)." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nao encontrado - instalando..."

  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  else
    echo "Gerenciador de pacotes nao suportado para instalar o Node.js automaticamente (so apt/Debian/Ubuntu por enquanto). Instale manualmente (https://nodejs.org) e rode este script de novo." >&2
    exit 1
  fi
fi

if ! command -v google-chrome >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
  echo "Navegador nao encontrado - instalando o Google Chrome..."

  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y gnupg curl
    curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
    apt-get update
    apt-get install -y google-chrome-stable
  else
    echo "Gerenciador de pacotes nao suportado para instalar o navegador automaticamente (so apt/Debian/Ubuntu por enquanto). Instale o Chrome ou o Chromium manualmente e rode este script de novo." >&2
    exit 1
  fi
fi

echo "Instalando X minimo (sem ambiente de desktop)..."
if command -v apt-get >/dev/null 2>&1; then
  apt-get install -y xserver-xorg xinit x11-xserver-utils
else
  echo "Gerenciador de pacotes nao suportado para instalar o X automaticamente (so apt/Debian/Ubuntu por enquanto)." >&2
  exit 1
fi

if [ -f /etc/X11/Xwrapper.config ]; then
  echo "Liberando o X pra rodar sem sessao de console reconhecida (maquina dedicada ao kiosk)..."
  if grep -q "^allowed_users=" /etc/X11/Xwrapper.config; then
    sed -i "s/^allowed_users=.*/allowed_users=anybody/" /etc/X11/Xwrapper.config
  else
    echo "allowed_users=anybody" >> /etc/X11/Xwrapper.config
  fi
  if ! grep -q "^needs_root_rights=" /etc/X11/Xwrapper.config; then
    echo "needs_root_rights=yes" >> /etc/X11/Xwrapper.config
  fi
fi

echo "Desativando telas de login grafica (GDM/LightDM/SDDM), se existirem, para o proximo boot..."
for dm in gdm3 gdm lightdm sddm; do
  if systemctl list-unit-files 2>/dev/null | grep -q "^\${dm}\\.service"; then
    systemctl disable "$dm" 2>/dev/null || true
  fi
done

if ! id tvkiosk >/dev/null 2>&1; then
  echo "Criando usuario dedicado ao kiosk (tvkiosk)..."
  useradd -m -s /bin/bash tvkiosk
fi

echo "Liberando reinicio remoto sem senha (so o comando de reboot, nada mais)..."
echo "tvkiosk ALL=(root) NOPASSWD: /sbin/reboot" > /etc/sudoers.d/tvkiosk-reboot
chmod 440 /etc/sudoers.d/tvkiosk-reboot

mkdir -p "$DIR"
curl -fsSL "$PORTAL_URL/api/tv/agente/download?plataforma=linux" -o "$DIR/agente.mjs"
chown -R tvkiosk:tvkiosk /opt/portal-triel-ht

echo "Instalando extensao de captura de tela via politica do Chrome..."
mkdir -p /etc/opt/chrome/policies/managed
cat > /etc/opt/chrome/policies/managed/tv-corporativa.json <<POLICY
{
  "ExtensionInstallForcelist": [
    "${EXTENSAO_CAPTURA_ID};$PORTAL_URL/api/tv/agente/extensao-captura/update.xml"
  ],
  "TranslateEnabled": false
}
POLICY

cat > "$KIOSK_HOME/.xinitrc" <<XINITRC
xset -dpms
xset s off
xset s noblank
export PORTAL_TV_URL="$PORTAL_URL"
while true; do
  node "$DIR/agente.mjs" > "$DIR/agente.log" 2>&1
  sleep 2
done
XINITRC
chown tvkiosk:tvkiosk "$KIOSK_HOME/.xinitrc"
chmod +x "$KIOSK_HOME/.xinitrc"

if ! grep -q "exec startx" "$KIOSK_HOME/.bash_profile" 2>/dev/null; then
  cat >> "$KIOSK_HOME/.bash_profile" <<'PROFILE'

if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  exec startx -- -nocursor
fi
PROFILE
fi
chown tvkiosk:tvkiosk "$KIOSK_HOME/.bash_profile"

echo "Configurando autologin do usuario tvkiosk no console (tty1)..."
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/override.conf <<'OVERRIDE'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin tvkiosk --noclear %I $TERM
OVERRIDE

systemctl daemon-reload
systemctl enable getty@tty1.service
systemctl set-default multi-user.target

echo "Instalacao concluida. Reinicie a maquina quando estiver pronto (sudo reboot) para o kiosk iniciar sozinho, sem tela de login."
`;

  return new NextResponse(script, {
    headers: { "content-type": "text/x-shellscript; charset=utf-8" },
  });
}

export const GET = comMetricasApi("tv/agente/instalar.sh", handleGET);
