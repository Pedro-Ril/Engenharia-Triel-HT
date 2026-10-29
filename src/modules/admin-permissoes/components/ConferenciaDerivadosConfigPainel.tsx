"use client";

import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
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

/*
 * Conferência de Arquivos Derivados é multiempresa: cada empresa ativa
 * tem as suas pastas, e quem confere usa as da empresa do próprio
 * cadastro (código de empresa do usuário). Um bloco por empresa, cada
 * um salva sozinho.
 */
export function ConferenciaDerivadosConfigPainel({ onFeedback }: ConferenciaDerivadosConfigPainelProps) {
  const [empresas, setEmpresas] = useState<ConfigConferenciaDerivados[] | null>(null);

  useEffect(() => {
    let ativo = true;
    buscarConfigConferenciaDerivados().then((dados) => {
      if (ativo) setEmpresas(dados ?? []);
    });
    return () => {
      ativo = false;
    };
  }, []);

  if (!empresas) {
    return <Loader label="Carregando configuração..." />;
  }

  return (
    <Stack gap={20}>
      <Alert variant="info">
        Cada empresa tem as suas pastas. A conferência usa as pastas da empresa do cadastro de quem está conferindo
        (o código de empresa do usuário). Todas as subpastas também são lidas; pasta em branco faz aquele tipo aparecer
        como não conferido.
      </Alert>

      {empresas.length === 0 ? (
        <EmptyState title="Nenhuma empresa ativa" description="Cadastre as empresas em Administração > Empresas." />
      ) : (
        empresas.map((empresa) => (
          <PastasEmpresaCard
            key={empresa.empresaId}
            empresa={empresa}
            onFeedback={onFeedback}
            onSalvo={(atualizada) =>
              setEmpresas((atual) =>
                (atual ?? []).map((e) => (e.empresaId === atualizada.empresaId ? atualizada : e))
              )
            }
          />
        ))
      )}
    </Stack>
  );
}

function PastasEmpresaCard({
  empresa,
  onFeedback,
  onSalvo,
}: {
  empresa: ConfigConferenciaDerivados;
  onFeedback: FeedbackHandler;
  onSalvo: (empresa: ConfigConferenciaDerivados) => void;
}) {
  const [pastaPdf, setPastaPdf] = useState(empresa.pastaPdf ?? "");
  const [pastaDxf, setPastaDxf] = useState(empresa.pastaDxf ?? "");
  const [pastaStep, setPastaStep] = useState(empresa.pastaStep ?? "");
  const [salvando, setSalvando] = useState(false);

  const configurada = Boolean(empresa.pastaPdf || empresa.pastaDxf || empresa.pastaStep);
  const prefixo = `derivados-${empresa.empresaId}`;

  async function handleSalvar() {
    setSalvando(true);

    try {
      const resultado = await salvarConfigConferenciaDerivados({
        empresaId: empresa.empresaId,
        pastaPdf: pastaPdf.trim() || null,
        pastaDxf: pastaDxf.trim() || null,
        pastaStep: pastaStep.trim() || null,
      });

      if (resultado.ok && resultado.data) {
        onSalvo(resultado.data);
        onFeedback(
          "success",
          "Configuração salva",
          `As pastas de ${empresa.empresaNome} já valem para a próxima conferência.`
        );
      } else {
        onFeedback("danger", "Não foi possível salvar", resultado.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card
      title={empresa.empresaNome}
      description={`Código de empresa ${empresa.empresaCodigo ?? "—"} · ${empresa.totalUsuarios} usuário(s) com este código no cadastro.`}
      actions={!configurada ? <Badge variant="warning">Não configurada</Badge> : undefined}
    >
      <Stack gap={20}>
        <FormGrid columns={2}>
          <Field label="Pasta de PDF" htmlFor={`${prefixo}-pdf`} hint="Ex: \\servidorgeral\Derivados\Triel-HT\DESENHOS">
            <Input
              id={`${prefixo}-pdf`}
              value={pastaPdf}
              onChange={(event) => setPastaPdf(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field label="Pasta de DXF" htmlFor={`${prefixo}-dxf`} hint="Ex: \\servidorgeral\Derivados\Triel-HT\DXF">
            <Input
              id={`${prefixo}-dxf`}
              value={pastaDxf}
              onChange={(event) => setPastaDxf(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field label="Pasta de STEP" htmlFor={`${prefixo}-step`} hint="Ex: \\servidorgeral\Derivados\Triel-HT\STEP">
            <Input
              id={`${prefixo}-step`}
              value={pastaStep}
              onChange={(event) => setPastaStep(event.target.value)}
              disabled={salvando}
            />
          </Field>
        </FormGrid>

        <Stack direction="row" justify="between" align="center" gap={12} wrap>
          <span>
            {empresa.atualizadoEm
              ? `Última alteração: ${formatarData(empresa.atualizadoEm)}${empresa.atualizadoPor ? ` por ${empresa.atualizadoPor}` : ""}`
              : "Ainda sem pastas definidas."}
          </span>
          <Button onClick={handleSalvar} loading={salvando}>
            Salvar pastas
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
