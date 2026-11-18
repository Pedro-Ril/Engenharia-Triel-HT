"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import {
  buscarConfiguracao,
  salvarConfiguracao,
  URL_DOWNLOAD_SCRIPT,
} from "../services/workstationsNvidia.service";
import type { ConfiguracaoNvidia } from "../types/workstationsNvidia.types";
import { formatarDataHora } from "../utils/exibicao";
import styles from "./WorkstationsNvidia.module.css";

interface ConfiguracoesNvidiaPainelProps {
  onFeedback: FeedbackHandler;
}

interface Formulario {
  caminhoEstado: string;
  pastaPerfil: string;
  coletaAtiva: boolean;
  intervaloMinutos: string;
  horasSemContato: string;
  emailsAlerta: string;
}

function paraFormulario(config: ConfiguracaoNvidia): Formulario {
  return {
    caminhoEstado: config.caminhoEstado,
    pastaPerfil: config.pastaPerfil ?? "",
    coletaAtiva: config.coletaAtiva,
    intervaloMinutos: String(config.intervaloMinutos),
    horasSemContato: String(config.horasSemContato),
    emailsAlerta: config.emailsAlerta ?? "",
  };
}

export function ConfiguracoesNvidiaPainel({ onFeedback }: ConfiguracoesNvidiaPainelProps) {
  const [config, setConfig] = useState<ConfiguracaoNvidia | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    buscarConfiguracao().then((resposta) => {
      if (cancelado || !resposta.ok || !resposta.data) return;
      setConfig(resposta.data);
      setForm(paraFormulario(resposta.data));
    });
    return () => {
      cancelado = true;
    };
  }, []);

  function alterar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual));
  }

  async function handleSalvar() {
    if (!form) return;
    setSalvando(true);
    try {
      const resposta = await salvarConfiguracao({
        caminhoEstado: form.caminhoEstado.trim(),
        pastaPerfil: form.pastaPerfil.trim() || null,
        coletaAtiva: form.coletaAtiva,
        intervaloMinutos: Number(form.intervaloMinutos),
        horasSemContato: Number(form.horasSemContato),
        emailsAlerta: form.emailsAlerta.trim() || null,
      });

      if (resposta.ok && resposta.data) {
        setConfig(resposta.data);
        setForm(paraFormulario(resposta.data));
        onFeedback("success", "Configuração salva", resposta.message ?? "Pronto.");
      } else {
        onFeedback("danger", "Não foi possível salvar", resposta.message ?? "Confira os campos.");
      }
    } finally {
      setSalvando(false);
    }
  }

  if (!form) return <Loader label="Carregando configuração..." />;

  const pastaPerfilExemplo = form.pastaPerfil.trim() || String.raw`\\servidor\NETLOGON\NvidiaProfile`;

  return (
    <Stack gap={20}>
      <Card
        title="Coleta e alertas"
        description={
          config?.atualizadoEm
            ? `Última alteração em ${formatarDataHora(config.atualizadoEm)}${config.atualizadoPor ? ` por ${config.atualizadoPor}` : ""}.`
            : undefined
        }
        actions={
          <Button onClick={handleSalvar} loading={salvando}>
            Salvar
          </Button>
        }
      >
        <Stack gap={16}>
          <Field
            label="Caminho do estado.json em cada máquina"
            htmlFor="ws-nvidia-caminho"
            required
            hint="{computador} é trocado pelo nome de cada máquina. A conta que roda o portal precisa conseguir ler esse caminho."
          >
            <Input
              id="ws-nvidia-caminho"
              value={form.caminhoEstado}
              onChange={(event) => alterar("caminhoEstado", event.target.value)}
            />
          </Field>

          <Field
            label="Pasta central do perfil oficial"
            htmlFor="ws-nvidia-pasta-perfil"
            hint="Onde fica o perfil-padrao.nip que o GPO copia para as máquinas. A conta do portal precisa poder ler e gravar nela."
          >
            <Input
              id="ws-nvidia-pasta-perfil"
              value={form.pastaPerfil}
              placeholder={String.raw`\\servidor\NETLOGON\NvidiaProfile`}
              onChange={(event) => alterar("pastaPerfil", event.target.value)}
            />
          </Field>

          <FormGrid columns={2}>
            <Field label="Intervalo da coleta (minutos)" htmlFor="ws-nvidia-intervalo" hint="De 5 a 1440.">
              <NumberInput
                id="ws-nvidia-intervalo"
                min={5}
                max={1440}
                value={form.intervaloMinutos}
                onChange={(event) => alterar("intervaloMinutos", event.target.value)}
              />
            </Field>

            <Field
              label="Horas sem contato para alertar"
              htmlFor="ws-nvidia-horas"
              hint="Também marca como “script parado” a máquina cujo estado.json não é atualizado há esse tempo."
            >
              <NumberInput
                id="ws-nvidia-horas"
                min={1}
                max={720}
                value={form.horasSemContato}
                onChange={(event) => alterar("horasSemContato", event.target.value)}
              />
            </Field>
          </FormGrid>

          <Field
            label="E-mails para alertas"
            htmlFor="ws-nvidia-emails"
            hint="Separados por vírgula, ponto e vírgula ou linha. Em branco, nenhum alerta é enviado. Usa o SMTP de Administração → Configurações."
          >
            <Textarea
              id="ws-nvidia-emails"
              rows={3}
              value={form.emailsAlerta}
              placeholder="ti@empresa.com.br"
              onChange={(event) => alterar("emailsAlerta", event.target.value)}
            />
          </Field>

          <Switch
            label="Coleta automática"
            hint="Desligada, o portal só lê as máquinas quando alguém clica em Coletar agora."
            checked={form.coletaAtiva}
            onChange={(event) => alterar("coletaAtiva", event.target.checked)}
          />
        </Stack>
      </Card>

      <Card
        title="Instalação nas workstations (GPO)"
        description="O que o GPO precisa fazer em cada máquina para o script rodar e o portal conseguir ler o resultado."
        actions={
          <Button variant="secondary" onClick={() => window.open(URL_DOWNLOAD_SCRIPT, "_blank")}>
            <Download size={15} />
            Baixar script
          </Button>
        }
      >
        <ol className={styles.passos}>
          <li>
            Coloque na pasta central (<code>{pastaPerfilExemplo}</code>) o{" "}
            <code>Verificar-PerfilNvidia.ps1</code> e a pasta extraída do NVIDIA Profile Inspector 3.x
            (<code>nvidiaProfileInspector\</code>). O perfil oficial (<code>perfil-padrao.nip</code>)
            é enviado pela aba Perfil oficial.
          </li>
          <li>
            No GPO das workstations, em <em>Configuração do Computador → Preferências → Configurações do
            Windows</em>: em <em>Pastas</em>, crie <code>C:\ProgramData\TI\NvidiaProfile\nvidiaProfileInspector</code>;
            em <em>Arquivos</em>, copie <code>{pastaPerfilExemplo}\*</code> para{" "}
            <code>C:\ProgramData\TI\NvidiaProfile</code> e{" "}
            <code>{pastaPerfilExemplo}\nvidiaProfileInspector\*</code> para a subpasta{" "}
            <code>nvidiaProfileInspector</code> (ação <em>Atualizar</em> nos dois, para receber as novas versões).
          </li>
          <li>
            Em <em>Preferências → Configurações do Painel de Controle → Tarefas Agendadas</em>, crie uma
            tarefa rodando como <code>NT AUTHORITY\System</code> com privilégios mais altos, gatilhos{" "}
            <em>Na inicialização</em> (atraso de 2 min) e <em>Diariamente</em> repetindo a cada 30 min,
            executando <code>powershell.exe</code> com os argumentos{" "}
            <code>
              -NoProfile -ExecutionPolicy Bypass -File
              C:\ProgramData\TI\NvidiaProfile\Verificar-PerfilNvidia.ps1
            </code>
            .
          </li>
          <li>
            Opcional, para o driver não ser trocado sem você saber: ative{" "}
            <em>Não incluir drivers com atualizações do Windows</em> e tire a categoria de vídeo do Dell
            Command | Update.
          </li>
          <li>
            Cadastre as máquinas na aba Máquinas. Depois que a tarefa rodar uma vez em cada uma, o{" "}
            <code>estado.json</code> aparece e a coleta passa a mostrar o status.
          </li>
        </ol>
      </Card>
    </Stack>
  );
}
