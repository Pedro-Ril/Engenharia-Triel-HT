"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";

import { DURACAO_MAXIMA_HORAS_PADRAO } from "@/lib/transferencia/constantes";

import {
  buscarConfigTransferencia,
  salvarConfigTransferencia,
} from "../services/adminPermissoes.service";
import type { TransferenciaConfig } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface TransferenciaConfigPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function TransferenciaConfigPainel({ onFeedback }: TransferenciaConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<TransferenciaConfig | null>(null);

  const [pastaArmazenamento, setPastaArmazenamento] = useState("");
  const [duracaoMaximaHoras, setDuracaoMaximaHoras] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const dados = await buscarConfigTransferencia();
      setConfig(dados);
      setPastaArmazenamento(dados?.pastaArmazenamento ?? "");
      setDuracaoMaximaHoras(dados?.duracaoMaximaHoras ? String(dados.duracaoMaximaHoras) : "");
      setCarregando(false);
    }

    carregar();
  }, []);

  async function handleSalvar() {
    setSalvando(true);

    try {
      const duracaoNumero = duracaoMaximaHoras.trim() ? Number(duracaoMaximaHoras) : null;

      const resultado = await salvarConfigTransferencia({
        pastaArmazenamento: pastaArmazenamento.trim(),
        duracaoMaximaHoras: duracaoNumero,
      });

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        onFeedback("success", "Configuração salva", "Os dados já valem para o próximo envio.");
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
      title="Transferência de Arquivos"
      description="Pasta onde os arquivos enviados ficam armazenados e o prazo máximo permitido para um link de download."
    >
      <Stack gap={20}>
        <FormGrid columns={2}>
          <Field
            label="Pasta de armazenamento"
            htmlFor="pastaArmazenamento"
            hint="Ex: \\servidorgeral\TransferenciaArquivos"
          >
            <Input
              id="pastaArmazenamento"
              value={pastaArmazenamento}
              onChange={(event) => setPastaArmazenamento(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="Duração máxima do link (horas)"
            htmlFor="duracaoMaximaHoras"
            hint={`Deixe em branco para usar o padrão (${DURACAO_MAXIMA_HORAS_PADRAO}h = 30 dias).`}
          >
            <NumberInput
              id="duracaoMaximaHoras"
              value={duracaoMaximaHoras}
              onChange={(event) => setDuracaoMaximaHoras(event.target.value)}
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
          <Button onClick={handleSalvar} loading={salvando} disabled={!pastaArmazenamento.trim()}>
            Salvar configuração
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
