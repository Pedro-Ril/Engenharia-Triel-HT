"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";

import {
  buscarConfigTv,
  iniciarSignaling,
  salvarConfigTv,
  statusSignaling,
} from "../services/tvCorporativa.service";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

interface ConfiguracoesTvPainelProps {
  onFeedback: FeedbackHandler;
}

function StatusSignaling({ onFeedback }: { onFeedback: FeedbackHandler }) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [verificando, setVerificando] = useState(true);
  const [iniciando, setIniciando] = useState(false);

  async function verificar() {
    setVerificando(true);
    try {
      const resultado = await statusSignaling();
      setOnline(resultado.ok ? (resultado.data?.online ?? false) : false);
    } finally {
      setVerificando(false);
    }
  }

  useEffect(() => {
    verificar();
  }, []);

  async function handleIniciar() {
    setIniciando(true);

    try {
      const resultado = await iniciarSignaling();
      const ficouOnline = resultado.ok && Boolean(resultado.data?.online);

      onFeedback(
        ficouOnline ? "success" : "danger",
        ficouOnline ? "Servidor de sinalização iniciado" : "Não foi possível iniciar",
        resultado.message ?? "Tente novamente em instantes."
      );

      setOnline(ficouOnline);
    } finally {
      setIniciando(false);
    }
  }

  return (
    <Stack direction="row" gap={10} align="center">
      {verificando ? (
        <Badge variant="neutral">Verificando...</Badge>
      ) : (
        <Badge variant={online ? "success" : "danger"}>
          {online ? "Online" : "Offline"}
        </Badge>
      )}

      <Button variant="secondary" onClick={verificar} disabled={verificando}>
        <RefreshCw size={14} />
        Verificar
      </Button>

      {!online && !verificando && (
        <Button onClick={handleIniciar} loading={iniciando}>
          Iniciar agora
        </Button>
      )}
    </Stack>
  );
}

export function ConfiguracoesTvPainel({ onFeedback }: ConfiguracoesTvPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [diretorioMidias, setDiretorioMidias] = useState("");
  const [signalingUrl, setSignalingUrl] = useState("");
  const [urlAgente, setUrlAgente] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let cancelado = false;

    buscarConfigTv().then((config) => {
      if (cancelado) return;
      setDiretorioMidias(config?.diretorioMidias ?? "");
      setSignalingUrl(config?.signalingUrl ?? "");
      setUrlAgente(config?.urlAgente ?? "");
      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, []);

  async function handleSalvar() {
    setSalvando(true);

    try {
      const resultado = await salvarConfigTv(
        diretorioMidias.trim(),
        signalingUrl.trim() || null,
        urlAgente.trim() || null
      );

      if (resultado.ok) {
        onFeedback("success", "Configuração salva", resultado.message ?? "Configuração salva.");
      } else {
        onFeedback(
          "danger",
          "Não foi possível salvar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <Loader label="Carregando configuração..." />;
  }

  return (
    <Card
      title="Armazenamento de mídias"
      description="Diretório onde vídeos, fotos e documentos enviados pra grade de programação são gravados — pode ser um caminho local do servidor ou um compartilhamento de rede (UNC)."
    >
      <Stack gap={16}>
        <Field
          label="Diretório de mídias"
          htmlFor="tv-diretorio-midias"
          hint={'Ex: "D:\\PortalTrielHT\\tv-midias" ou "\\\\servidorgeral\\PortalTrielHT\\tv-midias"'}
        >
          <Input
            id="tv-diretorio-midias"
            value={diretorioMidias}
            onChange={(event) => setDiretorioMidias(event.target.value)}
            placeholder="\\servidorgeral\PortalTrielHT\tv-midias"
          />
        </Field>

        <Field
          label="URL do servidor de sinalização (visualização ao vivo)"
          htmlFor="tv-signaling-url"
          hint='Sobe sozinho junto com o servidor do portal (mesma máquina, porta separada — ver TV_SIGNALING_PORT) — necessário só pra "Ver ao vivo" em Dispositivos. Ex: "ws://192.168.5.142:3010" ou "wss://portal.trielht.com.br/tv-signaling" atrás de um proxy reverso.'
        >
          <Input
            id="tv-signaling-url"
            value={signalingUrl}
            onChange={(event) => setSignalingUrl(event.target.value)}
            placeholder="ws://192.168.5.142:3010"
          />
        </Field>

        <Field label="Status do servidor de sinalização">
          <StatusSignaling onFeedback={onFeedback} />
        </Field>

        <Field
          label="URL do portal para o agente/instalador"
          htmlFor="tv-url-agente"
          hint='Endereço que os mini-PCs usam pra falar com o portal — pode ser diferente do endereço que você usa no navegador (ex: um IP de rede interna). Usado no comando de instalação (aba "Agente") e embutido nos scripts instalar.sh/instalar.ps1. Se deixar em branco, usa o mesmo endereço de onde a página foi acessada.'
        >
          <Input
            id="tv-url-agente"
            value={urlAgente}
            onChange={(event) => setUrlAgente(event.target.value)}
            placeholder="http://192.168.5.142:3000"
          />
        </Field>

        <Stack direction="row" justify="end">
          <Button onClick={handleSalvar} loading={salvando} disabled={!diretorioMidias.trim()}>
            Salvar
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
