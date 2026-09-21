"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";

import { buscarConfigChamados, salvarConfigChamados } from "../services/adminPermissoes.service";
import type { ChamadosConfig } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface ChamadosConfigPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function ChamadosConfigPainel({ onFeedback }: ChamadosConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<ChamadosConfig | null>(null);

  const [urlPublica, setUrlPublica] = useState("");
  const [diasAutoResolucao, setDiasAutoResolucao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const dados = await buscarConfigChamados();
      setConfig(dados);
      setUrlPublica(dados?.urlPublica ?? "");
      setDiasAutoResolucao(dados?.diasAutoResolucao ? String(dados.diasAutoResolucao) : "");
      setCarregando(false);
    }

    carregar();
  }, []);

  async function handleSalvar() {
    setSalvando(true);

    try {
      const resultado = await salvarConfigChamados({
        urlPublica: urlPublica.trim() || null,
        diasAutoResolucao: diasAutoResolucao.trim() ? Number(diasAutoResolucao) : null,
      });

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        onFeedback("success", "Configuração salva", "Os próximos e-mails de chamados já usam esse endereço.");
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
      title="Configurações"
      description="Endereço usado para montar os links dos e-mails de chamados (abertura, respostas, etc)."
    >
      <Stack gap={20}>
        <Field
          label="URL pública do portal"
          htmlFor="chamadosUrlPublica"
          hint="Deixe em branco para usar o endereço da própria requisição. Configure aqui se o servidor fica atrás de um proxy que não repassa o domínio público (o link do e-mail sairia com 'localhost' em vez do endereço real)."
        >
          <Input
            id="chamadosUrlPublica"
            placeholder="https://portal.trielht.com.br"
            value={urlPublica}
            onChange={(event) => setUrlPublica(event.target.value)}
            disabled={salvando}
          />
        </Field>

        <Field
          label="Fechar automaticamente após quantos dias (aguardando confirmação)"
          htmlFor="chamadosDiasAutoResolucao"
          hint="Um chamado marcado como resolvido pelo atendente que fica esperando confirmação do solicitante por mais que esse prazo vira 'resolvido' sozinho. Deixe em branco para desligar -- nesse caso o chamado espera indefinidamente."
        >
          <NumberInput
            id="chamadosDiasAutoResolucao"
            placeholder="Ex: 5"
            min={1}
            suffix="dias"
            value={diasAutoResolucao}
            onChange={(event) => setDiasAutoResolucao(event.target.value)}
            disabled={salvando}
          />
        </Field>

        {config?.atualizadoEm && (
          <p>
            Última alteração: {formatarData(config.atualizadoEm)}
            {config.atualizadoPor && ` por ${config.atualizadoPor}`}
          </p>
        )}

        <Stack direction="row" justify="end">
          <Button onClick={handleSalvar} loading={salvando}>
            Salvar configuração
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
