"use client";

import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Loader } from "@/components/ui/Loader";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";

import {
  buscarSequenciaEquipamentos,
  definirSequenciaEquipamentos,
} from "@/modules/estoque-equipamentos-usados/services/estoque.service";
import type { FeedbackHandler } from "../types/toast.types";

interface EstoqueSequenciaPainelProps {
  onFeedback: FeedbackHandler;
}

export function EstoqueSequenciaPainel({ onFeedback }: EstoqueSequenciaPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [ultimoNumero, setUltimoNumero] = useState(0);
  const [valorDigitado, setValorDigitado] = useState("0");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    buscarSequenciaEquipamentos().then((dados) => {
      const valor = dados?.ultimoNumero ?? 0;
      setUltimoNumero(valor);
      setValorDigitado(String(valor));
      setCarregando(false);
    });
  }, []);

  async function handleSalvar() {
    setErro(null);
    const novoValor = Number(valorDigitado);

    if (!Number.isInteger(novoValor) || novoValor < 0) {
      setErro("Informe um número inteiro válido (0 ou maior).");
      return;
    }

    setSalvando(true);

    try {
      const resultado = await definirSequenciaEquipamentos(novoValor);

      if (resultado.ok && resultado.data) {
        setUltimoNumero(resultado.data.ultimoNumero);
        setValorDigitado(String(resultado.data.ultimoNumero));
        onFeedback(
          "success",
          "Sequência atualizada",
          `O próximo equipamento cadastrado vai receber o número ${resultado.data.ultimoNumero + 1}.`
        );
      } else {
        setErro(resultado.message ?? "Não foi possível atualizar a sequência.");
      }
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <Loader label="Carregando sequência de numeração..." />;
  }

  return (
    <Card
      title="Sequência de numeração"
      description='Todo equipamento cadastrado recebe um número sequencial ("Número Usado"). Ajuste o último valor gerado se precisar pular ou corrigir a sequência.'
    >
      <Stack gap={20}>
        <Alert variant="info">
          Isto define o <strong>último número já usado</strong> — o próximo equipamento cadastrado
          recebe esse valor + 1. Hoje o último número usado é <strong>{ultimoNumero}</strong>, então o
          próximo cadastro sairia com o número <strong>{ultimoNumero + 1}</strong>.
        </Alert>

        <Field
          label="Último número usado"
          hint="Ex: para o próximo equipamento sair com o número 1015, informe 1014 aqui."
        >
          <NumberInput
            value={valorDigitado}
            min={0}
            onChange={(event) => setValorDigitado(event.target.value)}
          />
        </Field>

        {erro && <Alert variant="danger">{erro}</Alert>}

        <Stack direction="row" justify="end">
          <Button onClick={handleSalvar} loading={salvando} disabled={valorDigitado.trim() === ""}>
            Salvar
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
