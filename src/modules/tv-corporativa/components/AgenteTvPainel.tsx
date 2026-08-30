"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { Stack } from "@/components/ui/Stack";

import { buscarConfigTv } from "../services/tvCorporativa.service";
import styles from "./AgenteTvPainel.module.css";

/*
 * A URL do portal usada nos comandos é a configurada em TV Corporativa
 * → Configurações (portal_tv_config.url_agente) — pensada pro caso de
 * o mini-PC precisar de um endereço diferente do que o admin usa no
 * navegador (ex: IP de rede interna). Sem essa configuração, cai pra
 * origem de onde este painel está sendo acessado agora
 * (window.location.origin). As rotas /api/tv/agente/instalar.sh e
 * .ps1 fazem exatamente essa mesma escolha no servidor, então o
 * comando copiado aqui e o script baixado sempre concordam.
 */
function useComandos() {
  const [origem, setOrigem] = useState("");

  useEffect(() => {
    let cancelado = false;

    buscarConfigTv().then((config) => {
      if (cancelado) return;
      setOrigem(config?.urlAgente || window.location.origin);
    });

    return () => {
      cancelado = true;
    };
  }, []);

  return {
    linux: `curl -fsSL ${origem}/api/tv/agente/instalar.sh | sudo bash`,
    windows: `irm ${origem}/api/tv/agente/instalar.ps1 | iex`,
  };
}

function ComandoCopiavel({ comando }: { comando: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(comando);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className={styles.comando}>
      <code className={styles.comandoTexto}>{comando}</code>
      <IconButton
        icon={copiado ? <Check size={15} /> : <Copy size={15} />}
        label="Copiar comando"
        size="small"
        onClick={copiar}
      />
    </div>
  );
}

export function AgenteTvPainel() {
  const comandos = useComandos();

  return (
    <Stack gap={20}>
      <Alert variant="info" title="O que o comando de instalação faz">
        Se o Node.js ou um navegador compatível (Edge/Chrome) não estiverem instalados, o
        próprio comando instala automaticamente (winget no Windows, apt + repositório do
        Google Chrome no Linux) — só precisa de internet no mini-PC e ser rodado com
        privilégios de administrador/root. Depois disso, registra o agente pra iniciar
        sozinho com o sistema, que lança o navegador em modo kiosk direto na tela de
        programação (/tv) e mantém o pareamento mesmo se o cache do navegador for limpo.
      </Alert>

      <Card
        title="Linux"
        description="Cole no terminal do mini-PC (com privilégios de root) — baixa o agente e registra um serviço systemd que reinicia sozinho."
      >
        <ComandoCopiavel comando={comandos.linux} />
      </Card>

      <Card
        title="Windows"
        description="Cole no PowerShell como administrador — baixa o agente e registra uma tarefa agendada que inicia com o Windows."
      >
        <ComandoCopiavel comando={comandos.windows} />
      </Card>

      <Card
        title="Download manual"
        description="Só o script do agente (agente.mjs) — use se preferir instalar/registrar o serviço manualmente em vez do comando acima."
      >
        <Stack direction="row" gap={12}>
          <a
            className={styles.downloadLink}
            href="/api/tv/agente/download?plataforma=windows"
            download="agente.mjs"
          >
            <Download size={15} />
            Baixar (Windows)
          </a>
          <a
            className={styles.downloadLink}
            href="/api/tv/agente/download?plataforma=linux"
            download="agente.mjs"
          >
            <Download size={15} />
            Baixar (Linux)
          </a>
        </Stack>
      </Card>
    </Stack>
  );
}
