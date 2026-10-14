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
  buscarConfigConferenciaDerivados,
  salvarConfigConferenciaDerivados,
} from "../services/adminPermissoes.service";
import type { ConfigConferenciaDerivados } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface ConferenciaDerivadosConfigPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function ConferenciaDerivadosConfigPainel({ onFeedback }: ConferenciaDerivadosConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<ConfigConferenciaDerivados | null>(null);

  const [pastaPdf, setPastaPdf] = useState("");
  const [pastaDxf, setPastaDxf] = useState("");
  const [pastaStep, setPastaStep] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const dados = await buscarConfigConferenciaDerivados();
      setConfig(dados);
      setPastaPdf(dados?.pastaPdf ?? "");
      setPastaDxf(dados?.pastaDxf ?? "");
      setPastaStep(dados?.pastaStep ?? "");
      setCarregando(false);
    }

    carregar();
  }, []);

  async function handleSalvar() {
    setSalvando(true);

    try {
      const resultado = await salvarConfigConferenciaDerivados({
        pastaPdf: pastaPdf.trim() || null,
        pastaDxf: pastaDxf.trim() || null,
        pastaStep: pastaStep.trim() || null,
      });

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        onFeedback("success", "Configuração salva", "As pastas já valem para a próxima conferência.");
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
      title="Conferência de Arquivos Derivados"
      description="Pastas de rede onde a conferência procura cada tipo de arquivo. Todas as subpastas também são lidas. Pasta em branco: aquele tipo aparece como não conferido."
    >
      <Stack gap={20}>
        <FormGrid columns={2}>
          <Field label="Pasta de PDF" htmlFor="derivadosPastaPdf" hint="Ex: \\servidorgeral\Derivados\Triel-HT\DESENHOS">
            <Input
              id="derivadosPastaPdf"
              value={pastaPdf}
              onChange={(event) => setPastaPdf(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field label="Pasta de DXF" htmlFor="derivadosPastaDxf" hint="Ex: \\servidorgeral\Derivados\Triel-HT\DXF">
            <Input
              id="derivadosPastaDxf"
              value={pastaDxf}
              onChange={(event) => setPastaDxf(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field label="Pasta de STEP" htmlFor="derivadosPastaStep" hint="Ex: \\servidorgeral\Derivados\Triel-HT\STEP">
            <Input
              id="derivadosPastaStep"
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
