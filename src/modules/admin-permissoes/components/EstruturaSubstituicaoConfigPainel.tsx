"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";

import {
  buscarConfigEstruturaSubstituicao,
  salvarConfigEstruturaSubstituicao,
} from "../services/adminPermissoes.service";
import type { ConfigEstruturaSubstituicao } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface EstruturaSubstituicaoConfigPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function EstruturaSubstituicaoConfigPainel({
  onFeedback,
}: EstruturaSubstituicaoConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<ConfigEstruturaSubstituicao | null>(null);

  const [urlConsultaEstrutura, setUrlConsultaEstrutura] = useState("");
  const [urlValidarItens, setUrlValidarItens] = useState("");
  const [urlAtualizarEstrutura, setUrlAtualizarEstrutura] = useState("");
  const [urlConsultaEstruturaTeste, setUrlConsultaEstruturaTeste] = useState("");
  const [urlValidarItensTeste, setUrlValidarItensTeste] = useState("");
  const [urlAtualizarEstruturaTeste, setUrlAtualizarEstruturaTeste] = useState("");
  const [usarAmbienteTeste, setUsarAmbienteTeste] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const dados = await buscarConfigEstruturaSubstituicao();
      setConfig(dados);
      setUrlConsultaEstrutura(dados?.urlConsultaEstrutura ?? "");
      setUrlValidarItens(dados?.urlValidarItens ?? "");
      setUrlAtualizarEstrutura(dados?.urlAtualizarEstrutura ?? "");
      setUrlConsultaEstruturaTeste(dados?.urlConsultaEstruturaTeste ?? "");
      setUrlValidarItensTeste(dados?.urlValidarItensTeste ?? "");
      setUrlAtualizarEstruturaTeste(dados?.urlAtualizarEstruturaTeste ?? "");
      setUsarAmbienteTeste(dados?.usarAmbienteTeste ?? false);
      setCarregando(false);
    }

    carregar();
  }, []);

  async function handleSalvar() {
    setSalvando(true);

    try {
      const resultado = await salvarConfigEstruturaSubstituicao({
        urlConsultaEstrutura: urlConsultaEstrutura.trim() || null,
        urlValidarItens: urlValidarItens.trim() || null,
        urlAtualizarEstrutura: urlAtualizarEstrutura.trim() || null,
        urlConsultaEstruturaTeste: urlConsultaEstruturaTeste.trim() || null,
        urlValidarItensTeste: urlValidarItensTeste.trim() || null,
        urlAtualizarEstruturaTeste: urlAtualizarEstruturaTeste.trim() || null,
        usarAmbienteTeste,
      });

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        onFeedback("success", "Configuração salva", "Os endpoints já valem para a próxima consulta.");
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
      title="Substituição de item na estrutura"
      description="Endpoints do ERP usados pela ferramenta de troca de item na estrutura (Engenharia de Produto)."
    >
      <Stack gap={20}>
        <Stack
          direction="row"
          align="center"
          justify="between"
          style={{
            padding: "12px 16px",
            background: "var(--bg-surface-muted)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <Switch
            label="Usar ambiente de teste"
            checked={usarAmbienteTeste}
            onChange={(event) => setUsarAmbienteTeste(event.target.checked)}
            disabled={salvando}
          />
          <Badge variant={usarAmbienteTeste ? "warning" : "success"}>
            {usarAmbienteTeste ? "Ambiente ativo: Teste" : "Ambiente ativo: Produção"}
          </Badge>
        </Stack>

        <FormGrid columns={2}>
          <Field
            label="URL de consulta da estrutura — Produção"
            htmlFor="urlConsultaEstrutura"
            hint="Ex: http://proserver.trielht.com.br:1000/api/estrutura"
          >
            <Input
              id="urlConsultaEstrutura"
              value={urlConsultaEstrutura}
              onChange={(event) => setUrlConsultaEstrutura(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="URL de consulta da estrutura — Teste"
            htmlFor="urlConsultaEstruturaTeste"
            hint="Ex: http://proserver.trielht.com.br:1000/api/estrutura?ambiente=teste"
          >
            <Input
              id="urlConsultaEstruturaTeste"
              value={urlConsultaEstruturaTeste}
              onChange={(event) => setUrlConsultaEstruturaTeste(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="URL de validação de itens — Produção"
            htmlFor="urlValidarItens"
            hint="Ex: http://proserver.trielht.com.br:1000/api/itens/existem"
          >
            <Input
              id="urlValidarItens"
              value={urlValidarItens}
              onChange={(event) => setUrlValidarItens(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="URL de validação de itens — Teste"
            htmlFor="urlValidarItensTeste"
            hint="Ex: http://proserver.trielht.com.br:1000/api/itens/existem?ambiente=teste"
          >
            <Input
              id="urlValidarItensTeste"
              value={urlValidarItensTeste}
              onChange={(event) => setUrlValidarItensTeste(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="URL de atualização da estrutura — Produção"
            htmlFor="urlAtualizarEstrutura"
            hint="Ex: http://webapi.trielht.com.br:8080/v1/api/itens/estrutura"
          >
            <Input
              id="urlAtualizarEstrutura"
              value={urlAtualizarEstrutura}
              onChange={(event) => setUrlAtualizarEstrutura(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field
            label="URL de atualização da estrutura — Teste"
            htmlFor="urlAtualizarEstruturaTeste"
            hint="Ex: http://webapi.trielht.com.br:8080/v1_tes/api/itens/estrutura"
          >
            <Input
              id="urlAtualizarEstruturaTeste"
              value={urlAtualizarEstruturaTeste}
              onChange={(event) => setUrlAtualizarEstruturaTeste(event.target.value)}
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
