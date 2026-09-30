"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";

import {
  buscarConfigIntegraTubest,
  salvarConfigIntegraTubest,
} from "../services/adminPermissoes.service";
import type { ConfigIntegraTubest } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface IntegraTubestConfigPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function IntegraTubestConfigPainel({ onFeedback }: IntegraTubestConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<ConfigIntegraTubest | null>(null);

  const [foccoApiBaseUrl, setFoccoApiBaseUrl] = useState("");
  const [foccoApiChave, setFoccoApiChave] = useState("");
  const [foccoApiToken, setFoccoApiToken] = useState("");
  const [pastaStep, setPastaStep] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const dados = await buscarConfigIntegraTubest();
      setConfig(dados);
      setFoccoApiBaseUrl(dados?.foccoApiBaseUrl ?? "");
      setFoccoApiChave(dados?.foccoApiChave ?? "");
      setPastaStep(dados?.pastaStep ?? "");
      setCarregando(false);
    }

    carregar();
  }, []);

  async function handleSalvar() {
    setSalvando(true);

    try {
      const resultado = await salvarConfigIntegraTubest({
        foccoApiBaseUrl: foccoApiBaseUrl.trim() || null,
        foccoApiChave: foccoApiChave.trim() || null,
        foccoApiToken: foccoApiToken.trim() || null,
        pastaStep: pastaStep.trim() || null,
      });

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        setFoccoApiToken("");
        onFeedback("success", "Configuração salva", "Os dados já valem para a próxima consulta.");
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
      title="Integração TuBest"
      description="Endpoint do FoccoERP e pasta de rede usados na conferência de STEP e na planilha de importação em lote do TuBest."
    >
      <Stack gap={20}>
        <FormGrid columns={2}>
          <Field
            label="URL do endpoint do FoccoERP"
            htmlFor="tubestApiBaseUrl"
            hint="Endpoint próprio do TuBest — diferente do usado pela Integração Lantek."
          >
            <Input
              id="tubestApiBaseUrl"
              value={foccoApiBaseUrl}
              onChange={(event) => setFoccoApiBaseUrl(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="Chave da integração"
            htmlFor="tubestApiChave"
            hint="Parâmetro 'chave' enviado em toda consulta."
          >
            <Input
              id="tubestApiChave"
              value={foccoApiChave}
              onChange={(event) => setFoccoApiChave(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="Token da API"
            htmlFor="tubestApiToken"
            hint={
              config?.tokenConfigurado
                ? "Token já configurado — deixe em branco para manter o atual."
                : "Nenhum token configurado ainda."
            }
          >
            <Input
              id="tubestApiToken"
              type="password"
              value={foccoApiToken}
              onChange={(event) => setFoccoApiToken(event.target.value)}
              placeholder={config?.tokenConfigurado ? "••••••••" : ""}
              disabled={salvando}
            />
          </Field>

          <Field
            label="Pasta de STEP"
            htmlFor="pastaStep"
            hint="Ex: \\servidorgeral\Derivados\Triel-HT\STEP"
          >
            <Input
              id="pastaStep"
              value={pastaStep}
              onChange={(event) => setPastaStep(event.target.value)}
              disabled={salvando}
            />
          </Field>
        </FormGrid>

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
