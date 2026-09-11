"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";

import {
  CHAVE_MASCARA_NUMERO_SEQUENCIAL,
  OPCOES_CAMPO_MASCARA_NF,
} from "@/modules/estoque-equipamentos-usados/constants";
import {
  buscarConfigErpEstoqueUsados,
  salvarConfigErpEstoqueUsados,
} from "../services/adminPermissoes.service";
import type { ConfigErpEstoqueUsados } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface EstoqueEquipamentosUsadosConfigPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function EstoqueEquipamentosUsadosConfigPainel({
  onFeedback,
}: EstoqueEquipamentosUsadosConfigPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [config, setConfig] = useState<ConfigErpEstoqueUsados | null>(null);

  const [urlValidarItem, setUrlValidarItem] = useState("");
  const [urlValidarItemTeste, setUrlValidarItemTeste] = useState("");
  const [urlClientes, setUrlClientes] = useState("");
  const [urlClientesTeste, setUrlClientesTeste] = useState("");
  const [usarAmbienteTeste, setUsarAmbienteTeste] = useState(false);
  const [chaveApi, setChaveApi] = useState("");
  const [urlNfEntrada, setUrlNfEntrada] = useState("");
  const [urlNfEntradaTeste, setUrlNfEntradaTeste] = useState("");
  const [intervaloVerificacaoNf, setIntervaloVerificacaoNf] = useState("");
  const [campoMascaraChave, setCampoMascaraChave] = useState(CHAVE_MASCARA_NUMERO_SEQUENCIAL);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const dados = await buscarConfigErpEstoqueUsados();
      setConfig(dados);
      setUrlValidarItem(dados?.urlValidarItem ?? "");
      setUrlValidarItemTeste(dados?.urlValidarItemTeste ?? "");
      setUrlClientes(dados?.urlClientes ?? "");
      setUrlClientesTeste(dados?.urlClientesTeste ?? "");
      setUsarAmbienteTeste(dados?.usarAmbienteTeste ?? false);
      setChaveApi(dados?.chaveApi ?? "");
      setUrlNfEntrada(dados?.urlNfEntrada ?? "");
      setUrlNfEntradaTeste(dados?.urlNfEntradaTeste ?? "");
      setIntervaloVerificacaoNf(
        dados?.intervaloVerificacaoNfMinutos ? String(dados.intervaloVerificacaoNfMinutos) : ""
      );
      setCampoMascaraChave(dados?.campoMascaraChave ?? CHAVE_MASCARA_NUMERO_SEQUENCIAL);
      setCarregando(false);
    }

    carregar();
  }, []);

  async function handleSalvar() {
    setSalvando(true);

    try {
      const resultado = await salvarConfigErpEstoqueUsados({
        urlValidarItem: urlValidarItem.trim() || null,
        urlValidarItemTeste: urlValidarItemTeste.trim() || null,
        urlClientes: urlClientes.trim() || null,
        urlClientesTeste: urlClientesTeste.trim() || null,
        usarAmbienteTeste,
        chaveApi: chaveApi.trim() || null,
        urlNfEntrada: urlNfEntrada.trim() || null,
        urlNfEntradaTeste: urlNfEntradaTeste.trim() || null,
        intervaloVerificacaoNfMinutos: intervaloVerificacaoNf.trim() ? Number(intervaloVerificacaoNf) : null,
        campoMascaraChave,
      });

      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        onFeedback("success", "Configuração salva", "O endpoint já vale para a próxima validação.");
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
      title="Estoque de Equipamentos Usados"
      description="Endpoints do ERP usados nesse módulo."
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
            label="URL de clientes — Produção"
            htmlFor="urlClientes"
            hint="Endpoint que alimenta o autocomplete do campo Cliente na entrada de equipamento"
          >
            <Input
              id="urlClientes"
              value={urlClientes}
              onChange={(event) => setUrlClientes(event.target.value)}
              disabled={salvando}
            />
          </Field>

          <Field label="URL de clientes — Teste" htmlFor="urlClientesTeste">
            <Input
              id="urlClientesTeste"
              value={urlClientesTeste}
              onChange={(event) => setUrlClientesTeste(event.target.value)}
              disabled={salvando}
            />
          </Field>
        </FormGrid>

        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div>
            <strong>Job automático — busca de NF de entrada</strong>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
              A cada intervalo configurado, procura equipamentos sem NF de entrada e consulta o ERP por
              empresa + cliente + o campo mapeado abaixo como &ldquo;mascara&rdquo; (número do carro).
              Preenche NF, data de entrada, código do item e ID configurado automaticamente quando
              encontra.
            </p>
          </div>

          <FormGrid columns={2}>
            <Field
              label="URL de NF de entrada — Produção"
              htmlFor="urlNfEntrada"
              hint="Ex: http://proserver.trielht.com.br:1000/api/nfentrada"
            >
              <Input
                id="urlNfEntrada"
                value={urlNfEntrada}
                onChange={(event) => setUrlNfEntrada(event.target.value)}
                disabled={salvando}
              />
            </Field>

            <Field label="URL de NF de entrada — Teste" htmlFor="urlNfEntradaTeste">
              <Input
                id="urlNfEntradaTeste"
                value={urlNfEntradaTeste}
                onChange={(event) => setUrlNfEntradaTeste(event.target.value)}
                disabled={salvando}
              />
            </Field>
          </FormGrid>

          <FormGrid columns={2}>
            <Field
              label="Intervalo de verificação (minutos)"
              htmlFor="intervaloVerificacaoNf"
              hint="Deixe em branco para desativar o job — passa a ser preenchido só manualmente"
            >
              <NumberInput
                id="intervaloVerificacaoNf"
                min={0}
                value={intervaloVerificacaoNf}
                onChange={(event) => setIntervaloVerificacaoNf(event.target.value)}
                disabled={salvando}
              />
            </Field>

            <Field
              label='Campo usado como "mascara" (número do carro)'
              htmlFor="campoMascaraChave"
              hint="De-para: qual campo do equipamento é enviado como número do carro na consulta"
            >
              <Dropdown
                value={campoMascaraChave}
                options={OPCOES_CAMPO_MASCARA_NF.map((opcao) => ({ value: opcao.chave, label: opcao.rotulo }))}
                onValueChange={setCampoMascaraChave}
                disabled={salvando}
              />
            </Field>
          </FormGrid>

          {config?.ultimaExecucaoNfEm && (
            <p>Última verificação automática: {formatarData(config.ultimaExecucaoNfEm)}</p>
          )}
        </div>

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
