"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText, Mail, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DateInput } from "@/components/ui/DateInput";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { Tooltip } from "@/components/ui/Tooltip";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import {
  baixarRelatorioDiario,
  enviarRelatorioParaMim,
  listarEnviosRelatorio,
} from "../services/plugins3dx.service";
import type { Ambiente3dx, EnvioRelatorio3dx, EnviosRelatorio3dx, EscopoRelatorio3dx } from "../types/plugins3dx.types";
import { AMBIENTE, formatarDataHoraCurta, formatarDataLancamento } from "../utils/exibicao";
import styles from "./Plugins3dx.module.css";

interface RelatorioDiarioProps {
  /* Filtro do topo do painel: ambiente padrão do relatório gerado aqui. */
  ambiente: Ambiente3dx | null;
  onFeedback: FeedbackHandler;
}

const OPCOES_AMBIENTE = [
  { value: "", label: "Produção e Teste" },
  { value: "PRODUCAO", label: AMBIENTE.PRODUCAO.label },
  { value: "TESTE", label: AMBIENTE.TESTE.label },
];

const ESCOPO: Record<EscopoRelatorio3dx, string> = {
  AMBOS: "Produção e Teste",
  PRODUCAO: AMBIENTE.PRODUCAO.label,
  TESTE: AMBIENTE.TESTE.label,
};

const SITUACAO: Record<EnvioRelatorio3dx["situacao"], { label: string; variante: "success" | "danger" | "neutral" }> = {
  enviado: { label: "Enviado", variante: "success" },
  falha: { label: "Falhou", variante: "danger" },
  pendente: { label: "Enviando", variante: "neutral" },
};

function dataLocal(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function ontem(): string {
  const data = new Date();
  data.setDate(data.getDate() - 1);
  return dataLocal(data);
}

/*
 * Relatório diário de uso (evento "relatorio_diario"): o envio é automático, todo dia às 7h, para a lista do evento
 * em Configuração. Aqui dá para gerar qualquer dia (baixar o mesmo PDF/Excel do e-mail, ou mandar só para si) e ver
 * como foram os últimos envios automáticos.
 */
export function RelatorioDiario3dx({ ambiente, onFeedback }: RelatorioDiarioProps) {
  const [dia, setDia] = useState(ontem);
  const [escopo, setEscopo] = useState<string>(ambiente ?? "");
  const [ocupado, setOcupado] = useState<"pdf" | "xlsx" | "email" | null>(null);
  const [envios, setEnvios] = useState<EnviosRelatorio3dx | null>(null);
  const [recarregar, setRecarregar] = useState(0);

  /* Trocar o filtro do topo leva o relatório para o mesmo ambiente (ajuste durante o render, sem efeito). */
  const [ambienteAnterior, setAmbienteAnterior] = useState(ambiente);
  if (ambiente !== ambienteAnterior) {
    setAmbienteAnterior(ambiente);
    setEscopo(ambiente ?? "");
  }

  useEffect(() => {
    let cancelado = false;
    listarEnviosRelatorio().then((resposta) => {
      if (!cancelado) setEnvios(resposta.ok && resposta.data ? resposta.data : null);
    });
    return () => {
      cancelado = true;
    };
  }, [recarregar]);

  const ambienteEscolhido = (escopo || null) as Ambiente3dx | null;

  async function baixar(formato: "pdf" | "xlsx") {
    setOcupado(formato);
    const resposta = await baixarRelatorioDiario(dia, ambienteEscolhido, formato);
    setOcupado(null);
    if (!resposta.ok) onFeedback("danger", "Não foi possível gerar o relatório", resposta.message ?? "");
  }

  async function enviarParaMim() {
    setOcupado("email");
    const resposta = await enviarRelatorioParaMim(dia, ambienteEscolhido);
    setOcupado(null);
    if (resposta.ok) onFeedback("success", "Relatório enviado", resposta.message ?? "");
    else onFeedback("danger", "Não foi possível enviar", resposta.message ?? "");
  }

  const horaEnvio = envios?.horaEnvio ?? 7;

  return (
    /* allowOverflow: o calendário do campo Dia abre para fora do card (senão fica cortado). */
    <Card
      allowOverflow
      title="Relatório diário de uso"
      description={`Todo dia às ${horaEnvio}h o Portal envia o uso do dia anterior (resumo gerencial no e-mail, detalhado em PDF e Excel anexos) para a lista "Relatório diário de uso" em Configuração → Quem recebe aviso. Aqui dá para gerar qualquer dia.`}
      actions={
        <Button variant="secondary" onClick={() => setRecarregar((v) => v + 1)}>
          <RefreshCw size={15} />
          Atualizar
        </Button>
      }
    >
      <Stack gap={20}>
        <div className={styles.filtros}>
          <div className={styles.filtroData}>
            <Field label="Dia">
              <DateInput value={dia} max={dataLocal(new Date())} onValueChange={(valor) => valor && setDia(valor)} />
            </Field>
          </div>
          <div className={styles.filtroData}>
            <Field label="Ambiente">
              <Dropdown value={escopo} options={OPCOES_AMBIENTE} onValueChange={setEscopo} />
            </Field>
          </div>
          <div className={styles.acoesRelatorio}>
            <Button variant="secondary" loading={ocupado === "pdf"} disabled={ocupado !== null} onClick={() => baixar("pdf")}>
              <FileText size={15} />
              Baixar PDF
            </Button>
            <Button
              variant="secondary"
              loading={ocupado === "xlsx"}
              disabled={ocupado !== null}
              onClick={() => baixar("xlsx")}
            >
              <FileSpreadsheet size={15} />
              Baixar Excel
            </Button>
            <Button loading={ocupado === "email"} disabled={ocupado !== null} onClick={enviarParaMim}>
              <Mail size={15} />
              Enviar para mim
            </Button>
          </div>
        </div>

        <Stack gap={8}>
          <h4 className={styles.tituloSecao}>Últimos envios automáticos</h4>
          {!envios || envios.envios.length === 0 ? (
            <span className={styles.textoSecundario}>
              Nenhum envio ainda. O primeiro sai às {horaEnvio}h do dia seguinte a quem estiver na lista do evento.
            </span>
          ) : (
            <Table minWidth={760}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Dia</TableHeaderCell>
                  <TableHeaderCell>Ambiente</TableHeaderCell>
                  <TableHeaderCell>Situação</TableHeaderCell>
                  <TableHeaderCell>Destinatários</TableHeaderCell>
                  <TableHeaderCell align="right">Execuções</TableHeaderCell>
                  <TableHeaderCell>Enviado em</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {envios.envios.map((envio) => (
                  <TableRow key={envio.id}>
                    <TableCell style={{ whiteSpace: "nowrap" }}>{formatarDataLancamento(envio.dataReferencia)}</TableCell>
                    <TableCell style={{ whiteSpace: "nowrap" }}>{ESCOPO[envio.escopo]}</TableCell>
                    <TableCell>
                      <div className={styles.celulaObjeto}>
                        <span>
                          <Badge variant={SITUACAO[envio.situacao].variante}>{SITUACAO[envio.situacao].label}</Badge>
                        </span>
                        {envio.erro && <span className={styles.noErro}>{envio.erro}</span>}
                        {envio.tentativas > 1 && (
                          <span className={styles.textoSecundario}>{envio.tentativas} tentativas</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {envio.destinatarios.length === 0 ? (
                        "—"
                      ) : (
                        <Tooltip content={envio.destinatarios.join(", ")}>
                          <span className={styles.textoSecundario}>
                            {envio.destinatarios.length === 1
                              ? envio.destinatarios[0]
                              : `${envio.destinatarios.length} pessoas`}
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell align="right">{envio.totalExecucoes ?? "—"}</TableCell>
                    <TableCell style={{ whiteSpace: "nowrap" }}>{formatarDataHoraCurta(envio.atualizadoEm)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
