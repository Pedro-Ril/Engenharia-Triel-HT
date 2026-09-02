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
  buscarConfigIntegraLantek,
  salvarConfigIntegraLantek,
} from "../services/adminPermissoes.service";
import type { ConfigIntegraLantek } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface IntegraLantekConfigPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function IntegraLantekConfigPainel({ onFeedback }: IntegraLantekConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<ConfigIntegraLantek | null>(null);

  const [foccoApiBaseUrl, setFoccoApiBaseUrl] = useState("");
  const [foccoApiChave, setFoccoApiChave] = useState("");
  const [foccoApiToken, setFoccoApiToken] = useState("");
  const [pastaDxf, setPastaDxf] = useState("");
  const [pastaDesenhos, setPastaDesenhos] = useState("");
  const [pastaExportacaoAgro, setPastaExportacaoAgro] = useState("");
  const [pastaExportacaoVe, setPastaExportacaoVe] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const dados = await buscarConfigIntegraLantek();
      setConfig(dados);
      setFoccoApiBaseUrl(dados?.foccoApiBaseUrl ?? "");
      setFoccoApiChave(dados?.foccoApiChave ?? "");
      setPastaDxf(dados?.pastaDxf ?? "");
      setPastaDesenhos(dados?.pastaDesenhos ?? "");
      setPastaExportacaoAgro(dados?.pastaExportacaoAgro ?? "");
      setPastaExportacaoVe(dados?.pastaExportacaoVe ?? "");
      setCarregando(false);
    }

    carregar();
  }, []);

  async function handleSalvar() {
    setSalvando(true);

    try {
      const resultado = await salvarConfigIntegraLantek({
        foccoApiBaseUrl: foccoApiBaseUrl.trim() || null,
        foccoApiChave: foccoApiChave.trim() || null,
        foccoApiToken: foccoApiToken.trim() || null,
        pastaDxf: pastaDxf.trim() || null,
        pastaDesenhos: pastaDesenhos.trim() || null,
        pastaExportacaoAgro: pastaExportacaoAgro.trim() || null,
        pastaExportacaoVe: pastaExportacaoVe.trim() || null,
      });

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        setFoccoApiToken("");
        onFeedback("success", "Configuração salva", "Os dados já valem para a próxima chamada.");
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
      title="Integração Lantek"
      description="Endpoints e pastas de rede usados pela integração FoccoERP × Lantek (Agro e Viaturas Especiais)."
    >
      <Stack gap={20}>
        <FormGrid columns={2}>
          <Field
            label="URL da API do FoccoERP"
            htmlFor="foccoApiBaseUrl"
            hint="Ex: http://focco.trielht.com.br/PROWeb/FoccoIntegrador/api/v1/Exportacao/lantek_v2"
          >
            <Input
              id="foccoApiBaseUrl"
              value={foccoApiBaseUrl}
              onChange={(event) => setFoccoApiBaseUrl(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field label="Chave da integração" htmlFor="foccoApiChave" hint="Parâmetro 'chave' enviado em toda consulta.">
            <Input
              id="foccoApiChave"
              value={foccoApiChave}
              onChange={(event) => setFoccoApiChave(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="Token da API"
            htmlFor="foccoApiToken"
            hint={
              config?.tokenConfigurado
                ? "Token já configurado — deixe em branco para manter o atual."
                : "Nenhum token configurado ainda."
            }
          >
            <Input
              id="foccoApiToken"
              type="password"
              value={foccoApiToken}
              onChange={(event) => setFoccoApiToken(event.target.value)}
              placeholder={config?.tokenConfigurado ? "••••••••" : ""}
              disabled={salvando}
            />
          </Field>

          <Field
            label="Pasta de DXF"
            htmlFor="pastaDxf"
            hint="Ex: \\servidorgeral\Derivados\Triel-HT\DXF"
          >
            <Input
              id="pastaDxf"
              value={pastaDxf}
              onChange={(event) => setPastaDxf(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="Pasta de desenhos (PDF)"
            htmlFor="pastaDesenhos"
            hint="Ex: \\servidorgeral\Derivados\Triel-HT\DESENHOS"
          >
            <Input
              id="pastaDesenhos"
              value={pastaDesenhos}
              onChange={(event) => setPastaDesenhos(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="Pasta de exportação — Agro"
            htmlFor="pastaExportacaoAgro"
            hint="Ex: \\servidorgeral\Lantek\Agroindustrial"
          >
            <Input
              id="pastaExportacaoAgro"
              value={pastaExportacaoAgro}
              onChange={(event) => setPastaExportacaoAgro(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="Pasta de exportação — Viaturas Especiais"
            htmlFor="pastaExportacaoVe"
            hint="Ex: \\servidorgeral\Lantek\Viaturas Especiais"
          >
            <Input
              id="pastaExportacaoVe"
              value={pastaExportacaoVe}
              onChange={(event) => setPastaExportacaoVe(event.target.value)}
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
