"use client";

import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";

import {
  buscarConfigEngenhariaVersatil,
  salvarConfigEngenhariaVersatil,
} from "../services/adminPermissoes.service";
import type { ConfigEngenhariaVersatil } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface EngenhariaVersatilConfigPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function paraLista(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/*
 * Engenharia Versátil: de onde vêm os desenhos, onde ficam as pastas dos
 * projetos, quais abas da planilha não viram pasta (blacklist) e quais
 * recebem DXF além do PDF.
 */
export function EngenhariaVersatilConfigPainel({ onFeedback }: EngenhariaVersatilConfigPainelProps) {
  const [config, setConfig] = useState<ConfigEngenhariaVersatil | null>(null);
  const [pastaProjetos, setPastaProjetos] = useState("");
  const [pastaPdf, setPastaPdf] = useState("");
  const [pastaDxf, setPastaDxf] = useState("");
  const [blacklist, setBlacklist] = useState("");
  const [abasComDxf, setAbasComDxf] = useState("");
  const [abasFator, setAbasFator] = useState("");
  const [erpApiUrl, setErpApiUrl] = useState("");
  const [erpCodEmpresa, setErpCodEmpresa] = useState("");
  const [erpAmbiente, setErpAmbiente] = useState<"teste" | "producao">("teste");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    buscarConfigEngenhariaVersatil().then((dados) => {
      if (!ativo) return;
      setConfig(dados);
      setPastaProjetos(dados?.pastaProjetos ?? "");
      setPastaPdf(dados?.pastaPdf ?? "");
      setPastaDxf(dados?.pastaDxf ?? "");
      setBlacklist((dados?.abasBlacklist ?? []).join("\n"));
      setAbasComDxf((dados?.abasComDxf ?? []).join("\n"));
      setAbasFator((dados?.abasFator ?? []).join("\n"));
      setErpApiUrl(dados?.erpApiUrl ?? "");
      setErpCodEmpresa(dados?.erpCodEmpresa ? String(dados.erpCodEmpresa) : "");
      setErpAmbiente(dados?.erpAmbiente ?? "teste");
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function handleSalvar() {
    setSalvando(true);
    try {
      const resultado = await salvarConfigEngenhariaVersatil({
        pastaProjetos: pastaProjetos.trim() || null,
        pastaPdf: pastaPdf.trim() || null,
        pastaDxf: pastaDxf.trim() || null,
        abasBlacklist: paraLista(blacklist),
        abasComDxf: paraLista(abasComDxf),
        abasFator: paraLista(abasFator),
        erpApiUrl: erpApiUrl.trim() || null,
        erpCodEmpresa: erpCodEmpresa.trim() ? Number(erpCodEmpresa) : null,
        erpAmbiente,
      });
      if (resultado.ok && resultado.data) {
        setConfig(resultado.data);
        onFeedback("success", "Configuração salva", "Vale para a próxima planilha analisada.");
      } else {
        onFeedback("danger", "Não foi possível salvar", resultado.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setSalvando(false);
    }
  }

  if (!config) {
    return <Loader label="Carregando configuração..." />;
  }

  return (
    <Card
      title="Engenharia Versátil"
      description="Separação da engenharia: a planilha do projeto vira pastas dentro da pasta do projeto, com os desenhos copiados das pastas de origem."
    >
      <Stack gap={20}>
        <FormGrid columns={2}>
          <Field
            label="Pasta dos projetos"
            htmlFor="versatilPastaProjetos"
            hint="Onde ficam as pastas “1111 - …”. Ex: \\servidorgeral\Versatil\Publico\PROJETOS GERAL"
          >
            <Input
              id="versatilPastaProjetos"
              value={pastaProjetos}
              onChange={(e) => setPastaProjetos(e.target.value)}
              disabled={salvando}
            />
          </Field>
          <Field label="Pasta de PDF (origem)" htmlFor="versatilPastaPdf" hint="Ex: \\oracle2\docs\DESENHOS_VERSATIL">
            <Input id="versatilPastaPdf" value={pastaPdf} onChange={(e) => setPastaPdf(e.target.value)} disabled={salvando} />
          </Field>
          <Field label="Pasta de DXF (origem)" htmlFor="versatilPastaDxf" hint="Ex: \\oracle2\docs\DXF_VERSATIL">
            <Input id="versatilPastaDxf" value={pastaDxf} onChange={(e) => setPastaDxf(e.target.value)} disabled={salvando} />
          </Field>
        </FormGrid>

        <FormGrid columns={2}>
          <Field
            label="Abas ignoradas (blacklist)"
            htmlFor="versatilBlacklist"
            hint="Uma por linha. Essas abas não viram pasta. Não diferencia maiúsculas nem acentos."
          >
            <Textarea
              id="versatilBlacklist"
              rows={5}
              value={blacklist}
              onChange={(e) => setBlacklist(e.target.value)}
              disabled={salvando}
            />
          </Field>
          <Field
            label="Abas que recebem DXF"
            htmlFor="versatilAbasDxf"
            hint="Uma por linha. Essas recebem PDF e DXF; as demais, só PDF."
          >
            <Textarea
              id="versatilAbasDxf"
              rows={5}
              value={abasComDxf}
              onChange={(e) => setAbasComDxf(e.target.value)}
              disabled={salvando}
            />
          </Field>
        </FormGrid>

        <FormGrid columns={2}>
          <Field
            label="Abas do fator de conversão"
            htmlFor="versatilAbasFator"
            hint="Uma por linha. Só os itens dessas abas entram na conferência de pesos e fatores. Vazio: todas fora da blacklist."
          >
            <Textarea
              id="versatilAbasFator"
              rows={5}
              value={abasFator}
              onChange={(e) => setAbasFator(e.target.value)}
              disabled={salvando}
            />
          </Field>
        </FormGrid>

        <FormGrid columns={2}>
          <Field
            label="API do ERP (fator de conversão)"
            htmlFor="versatilErpApi"
            hint="API Oracle com as rotas /api/fator-conversao. Ex: http://proserver.trielht.com.br:1000"
          >
            <Input id="versatilErpApi" value={erpApiUrl} onChange={(e) => setErpApiUrl(e.target.value)} disabled={salvando} />
          </Field>
          <Field label="Empresa no ERP" htmlFor="versatilErpEmpresa" hint="Versátil = 40.">
            <Input
              id="versatilErpEmpresa"
              inputMode="numeric"
              value={erpCodEmpresa}
              onChange={(e) => setErpCodEmpresa(e.target.value.replace(/\D/g, ""))}
              disabled={salvando}
            />
          </Field>
          <Field label="Ambiente do ERP" hint="Onde os fatores de conversão são gravados.">
            <Dropdown
              value={erpAmbiente}
              options={[
                { value: "teste", label: "Teste (banco de teste do ERP)" },
                { value: "producao", label: "Produção" },
              ]}
              onValueChange={(valor) => setErpAmbiente(valor as "teste" | "producao")}
              disabled={salvando}
            />
          </Field>
        </FormGrid>

        {erpAmbiente === "producao" && (
          <Alert variant="warning">
            Em produção, a Engenharia Versátil grava os fatores de conversão direto no ERP de verdade.
          </Alert>
        )}

        {config.atualizadoEm && (
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
