"use client";

import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";

import { FAIXAS_CONFIG_IMPRESSAO, lerConfigImpressao } from "@/lib/rotas-avulsas/impressao/config";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { buscarConfigRota, salvarConfigRota } from "../services/rotasAvulsas.service";
import type { ConfigRotaAvulsa } from "../types/rotasAvulsas.types";
import { ImpressorasCard } from "./ImpressorasCard";
import styles from "./RotasAvulsas.module.css";

interface ConfigRotaAvulsaProps {
  chave: string;
  onFeedback: FeedbackHandler;
  onConfigCarregada: (config: ConfigRotaAvulsa) => void;
}

function formatarData(valorIso: string | null): string {
  return valorIso ? new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function soDigitos(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, 5);
}

/*
 * Configurações de uma rota avulsa: chave liga/desliga (vale na hora,
 * para todos os tokens), limites de requisição por token e, embaixo, o
 * que é próprio da rota (na impressão: limites do arquivo e as impressoras).
 */
export function ConfigRotaAvulsa({ chave, onFeedback, onConfigCarregada }: ConfigRotaAvulsaProps) {
  const [config, setConfig] = useState<ConfigRotaAvulsa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(false);
  const [porSegundo, setPorSegundo] = useState("");
  const [rajada, setRajada] = useState("");
  const [porMinuto, setPorMinuto] = useState("");
  const [tamanhoMaxMb, setTamanhoMaxMb] = useState("");
  const [paginasMax, setPaginasMax] = useState("");
  const [copiasMax, setCopiasMax] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmandoLigar, setConfirmandoLigar] = useState(false);

  const ehImpressao = chave === "impressao-pdf";

  function preencher(dados: ConfigRotaAvulsa) {
    setConfig(dados);
    setAtivo(dados.ativo);
    setPorSegundo(String(dados.limitePorSegundo));
    setRajada(String(dados.rajada));
    setPorMinuto(String(dados.limitePorMinuto));
    const impressao = lerConfigImpressao(dados.config);
    setTamanhoMaxMb(String(impressao.tamanhoMaxMb));
    setPaginasMax(String(impressao.paginasMax));
    setCopiasMax(String(impressao.copiasMax));
    onConfigCarregada(dados);
  }

  useEffect(() => {
    let vivo = true;
    buscarConfigRota(chave).then((resposta) => {
      if (!vivo) return;
      if (resposta.ok && resposta.data) preencher(resposta.data);
      else setErro(resposta.message ?? "Não foi possível carregar a configuração.");
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega uma vez por rota
  }, [chave]);

  async function salvar() {
    setConfirmandoLigar(false);
    setSalvando(true);
    try {
      const resposta = await salvarConfigRota(chave, {
        ativo,
        limitePorSegundo: Number(porSegundo),
        rajada: Number(rajada),
        limitePorMinuto: Number(porMinuto),
        config: ehImpressao
          ? { tamanhoMaxMb: Number(tamanhoMaxMb), paginasMax: Number(paginasMax), copiasMax: Number(copiasMax) }
          : (config?.config ?? {}),
      });
      if (resposta.ok && resposta.data) {
        preencher(resposta.data);
        onFeedback("success", "Configuração salva", resposta.data.ativo ? "A rota está ligada." : "A rota está desligada.");
      } else {
        onFeedback("danger", "Não foi possível salvar", resposta.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setSalvando(false);
    }
  }

  function handleSalvar() {
    /* Ligar uma rota pública passa por confirmação; desligar e ajustar limites, não. */
    if (ativo && !config?.ativo) setConfirmandoLigar(true);
    else salvar();
  }

  if (erro) return <Alert variant="danger">{erro}</Alert>;
  if (!config) return <Loader label="Carregando configuração..." />;

  return (
    <Stack gap={20}>
      <Card
        title="Funcionamento"
        description="Liga ou desliga a rota para todos os sistemas, e limita quantas requisições cada token pode fazer."
      >
        <Stack gap={20}>
          <Switch
            id={`rotaAtiva-${chave}`}
            label="Rota ligada"
            hint="Desligada, qualquer chamada recebe 503, mesmo com token válido. Vale na hora."
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            disabled={salvando}
          />

          <FormGrid columns={3}>
            <Field label="Requisições por segundo" htmlFor={`rotaSeg-${chave}`} hint="Por token. 1 a 50.">
              <Input
                id={`rotaSeg-${chave}`}
                inputMode="numeric"
                value={porSegundo}
                onChange={(e) => setPorSegundo(soDigitos(e.target.value))}
                disabled={salvando}
              />
            </Field>
            <Field label="Rajada" htmlFor={`rotaRajada-${chave}`} hint="Quantas seguidas antes de começar a segurar.">
              <Input
                id={`rotaRajada-${chave}`}
                inputMode="numeric"
                value={rajada}
                onChange={(e) => setRajada(soDigitos(e.target.value))}
                disabled={salvando}
              />
            </Field>
            <Field label="Requisições por minuto" htmlFor={`rotaMin-${chave}`} hint="Teto por token em qualquer janela de 60 s.">
              <Input
                id={`rotaMin-${chave}`}
                inputMode="numeric"
                value={porMinuto}
                onChange={(e) => setPorMinuto(soDigitos(e.target.value))}
                disabled={salvando}
              />
            </Field>
          </FormGrid>

          {ehImpressao && (
            <FormGrid columns={3}>
              <Field
                label="Tamanho máximo do PDF (MB)"
                htmlFor="impTamanho"
                hint={`${FAIXAS_CONFIG_IMPRESSAO.tamanhoMaxMb.min} a ${FAIXAS_CONFIG_IMPRESSAO.tamanhoMaxMb.max}.`}
              >
                <Input
                  id="impTamanho"
                  inputMode="numeric"
                  value={tamanhoMaxMb}
                  onChange={(e) => setTamanhoMaxMb(soDigitos(e.target.value))}
                  disabled={salvando}
                />
              </Field>
              <Field
                label="Máximo de páginas"
                htmlFor="impPaginas"
                hint={`${FAIXAS_CONFIG_IMPRESSAO.paginasMax.min} a ${FAIXAS_CONFIG_IMPRESSAO.paginasMax.max}.`}
              >
                <Input
                  id="impPaginas"
                  inputMode="numeric"
                  value={paginasMax}
                  onChange={(e) => setPaginasMax(soDigitos(e.target.value))}
                  disabled={salvando}
                />
              </Field>
              <Field
                label="Máximo de cópias"
                htmlFor="impCopias"
                hint={`${FAIXAS_CONFIG_IMPRESSAO.copiasMax.min} a ${FAIXAS_CONFIG_IMPRESSAO.copiasMax.max}.`}
              >
                <Input
                  id="impCopias"
                  inputMode="numeric"
                  value={copiasMax}
                  onChange={(e) => setCopiasMax(soDigitos(e.target.value))}
                  disabled={salvando}
                />
              </Field>
            </FormGrid>
          )}

          <Stack direction="row" justify="between" align="center" wrap>
            <span className={styles.suave}>
              Última alteração: {formatarData(config.atualizadoEm)}
              {config.atualizadoPor && ` por ${config.atualizadoPor}`}
            </span>
            <Button onClick={handleSalvar} loading={salvando}>
              Salvar configuração
            </Button>
          </Stack>
        </Stack>
      </Card>

      {ehImpressao && <ImpressorasCard onFeedback={onFeedback} />}

      <ConfirmDialog
        open={confirmandoLigar}
        title="Ligar a rota?"
        message="A partir de agora, qualquer sistema com um token válido desta rota consegue usá-la sem login no Portal. Confira os tokens ativos antes de ligar."
        confirmLabel="Ligar e salvar"
        variant="warning"
        loading={salvando}
        onConfirm={salvar}
        onClose={() => setConfirmandoLigar(false)}
      />
    </Stack>
  );
}
