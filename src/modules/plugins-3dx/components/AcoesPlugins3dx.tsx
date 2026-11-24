"use client";

import { useEffect, useState } from "react";
import { Inbox, Play, RefreshCw, ScanSearch, X } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { cancelarExecucao, enviarAcao, listarExecucoes } from "../services/plugins3dx.service";
import type { AcaoManual3dx, Ambiente3dx, Execucao3dx } from "../types/plugins3dx.types";
import { AMBIENTES_3DX } from "../types/plugins3dx.types";
import { AMBIENTE, formatarDataHora, nomeCurtoPlugin, rotuloObjeto, STATUS_EXECUCAO } from "../utils/exibicao";
import styles from "./Plugins3dx.module.css";
import { RelatorioDiario3dx } from "./RelatorioDiario3dx";

interface AcoesProps {
  /* Filtro do topo do painel: vira o ambiente padrão das ações e filtra a fila. */
  ambiente: Ambiente3dx | null;
  onFeedback: FeedbackHandler;
}

const OPCOES_REPROCESSAR = [
  { value: "drawing-config-link", label: "Desenho por configuração" },
  { value: "replace-revision", label: "Revisão nos conjuntos" },
];

const OPCOES_AMBIENTE = AMBIENTES_3DX.map((valor) => ({ value: valor, label: AMBIENTE[valor].label }));

/*
 * Ações manuais: cada uma vira um trabalho pendente na fila do ambiente escolhido; o próximo nó livre do 3DSpace
 * daquele ambiente pega em segundos e o resultado aparece em Execuções. Respeita o modo do plugin naquele ambiente
 * (em Simulação só registra). Sem filtro no topo, o padrão é Teste: produção só por escolha explícita.
 */
export function AcoesPlugins3dx({ ambiente, onFeedback }: AcoesProps) {
  const ambientePadrao: Ambiente3dx = ambiente ?? "TESTE";
  const [ambienteReprocessar, setAmbienteReprocessar] = useState<Ambiente3dx>(ambientePadrao);
  const [ambienteVarredura, setAmbienteVarredura] = useState<Ambiente3dx>(ambientePadrao);
  const [pluginReprocessar, setPluginReprocessar] = useState("drawing-config-link");
  const [nome, setNome] = useState("");
  const [limite, setLimite] = useState("0");
  const [confirmar, setConfirmar] = useState<AcaoManual3dx | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [fila, setFila] = useState<Execucao3dx[]>([]);
  const [recarregar, setRecarregar] = useState(0);
  const [cancelar, setCancelar] = useState<Execucao3dx | null>(null);

  /* Trocar o filtro do topo leva as duas ações para o mesmo ambiente (ajuste durante o render, sem efeito). */
  const [ambienteAnterior, setAmbienteAnterior] = useState(ambiente);
  if (ambiente !== ambienteAnterior) {
    setAmbienteAnterior(ambiente);
    setAmbienteReprocessar(ambientePadrao);
    setAmbienteVarredura(ambientePadrao);
  }

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      listarExecucoes({ ambiente, status: "pendente", pagina: 1 }),
      listarExecucoes({ ambiente, status: "processando", pagina: 1 }),
    ]).then(([pendentes, processando]) => {
      if (cancelado) return;
      setFila([...(processando.data?.execucoes ?? []), ...(pendentes.data?.execucoes ?? [])]);
    });
    return () => {
      cancelado = true;
    };
  }, [ambiente, recarregar]);

  async function executar() {
    if (!confirmar) return;
    setEnviando(true);
    const resposta = await enviarAcao(confirmar);
    setEnviando(false);
    setConfirmar(null);
    if (resposta.ok) {
      onFeedback("success", "Enviado", resposta.message ?? "");
      setNome("");
      setRecarregar((v) => v + 1);
    } else {
      onFeedback("danger", "Não foi possível enviar", resposta.message ?? "");
    }
  }

  async function confirmarCancelamento() {
    if (!cancelar) return;
    const resposta = await cancelarExecucao(cancelar.id);
    setCancelar(null);
    if (resposta.ok) {
      onFeedback("success", "Cancelado", resposta.message ?? "");
      setRecarregar((v) => v + 1);
    } else {
      onFeedback("danger", "Não foi possível cancelar", resposta.message ?? "");
    }
  }

  const reprocessar: AcaoManual3dx | null = nome.trim()
    ? pluginReprocessar === "replace-revision"
      ? { ambiente: ambienteReprocessar, plugin: "replace-revision", acao: "reprocessar", nome: nome.trim() }
      : { ambiente: ambienteReprocessar, plugin: "drawing-config-link", acao: "reprocessar", nome: nome.trim() }
    : null;

  const emProducao = confirmar?.ambiente === "PRODUCAO";
  const rotuloAmbienteConfirmar = confirmar ? AMBIENTE[confirmar.ambiente].label : "";

  return (
    <Stack gap={20}>
      <Card
        title="Reprocessar um item"
        description="Roda o plugin de novo para um desenho (última revisão liberada) ou uma peça (última revisão). Só trata o que faltou."
      >
        <div className={`${styles.formLinha} ${styles.formReprocessar}`}>
          <Field label="Ambiente">
            <Dropdown
              value={ambienteReprocessar}
              options={OPCOES_AMBIENTE}
              onValueChange={(valor) => setAmbienteReprocessar(valor as Ambiente3dx)}
            />
          </Field>
          <Field label="Plugin">
            <Dropdown value={pluginReprocessar} options={OPCOES_REPROCESSAR} onValueChange={setPluginReprocessar} />
          </Field>
          <Field label={pluginReprocessar === "replace-revision" ? "Nome da peça no 3DEXPERIENCE" : "Nome do desenho no 3DEXPERIENCE"}>
            <Input
              value={nome}
              placeholder={pluginReprocessar === "replace-revision" ? "ex.: prd-52114233-00105710" : "ex.: drw-52114233-00057908"}
              onChange={(e) => setNome(e.target.value)}
            />
          </Field>
          <Button disabled={!reprocessar} onClick={() => reprocessar && setConfirmar(reprocessar)}>
            <Play size={15} />
            Reprocessar
          </Button>
        </div>
      </Card>

      <Card
        title="Varredura dos desenhos liberados"
        description="Confere todos os desenhos liberados e cria os vínculos com configurações que faltarem (a mesma da rotina noturna). Pode levar dezenas de minutos."
      >
        <div className={`${styles.formLinha} ${styles.formVarredura}`}>
          <Field label="Ambiente">
            <Dropdown
              value={ambienteVarredura}
              options={OPCOES_AMBIENTE}
              onValueChange={(valor) => setAmbienteVarredura(valor as Ambiente3dx)}
            />
          </Field>
          <Field label="Limite de desenhos (0 = todos)">
            <NumberInput value={limite} onChange={(e) => setLimite(e.target.value)} min={0} step={1} />
          </Field>
          <Button
            variant="secondary"
            onClick={() =>
              setConfirmar({
                ambiente: ambienteVarredura,
                plugin: "drawing-config-link",
                acao: "varredura",
                limite: Math.max(0, Math.trunc(Number(limite) || 0)),
              })
            }
          >
            <ScanSearch size={15} />
            Iniciar varredura
          </Button>
        </div>
      </Card>

      <Card
        title="Fila"
        description="Trabalhos esperando ou em processamento nos nós do 3DSpace (cada ambiente tem a sua fila)."
        actions={
          <Button variant="secondary" onClick={() => setRecarregar((v) => v + 1)}>
            <RefreshCw size={15} />
            Atualizar
          </Button>
        }
      >
        {fila.length === 0 ? (
          <EmptyState icon={<Inbox size={26} />} title="Fila vazia" description="Nenhum trabalho esperando." />
        ) : (
          <Table minWidth={820}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Entrou</TableHeaderCell>
                <TableHeaderCell>Ambiente</TableHeaderCell>
                <TableHeaderCell>Plugin</TableHeaderCell>
                <TableHeaderCell>Objeto</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell align="center">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fila.map((execucao) => (
                <TableRow key={execucao.id}>
                  <TableCell style={{ whiteSpace: "nowrap" }}>{formatarDataHora(execucao.enfileiradoEm)}</TableCell>
                  <TableCell>
                    <Badge variant={AMBIENTE[execucao.ambiente].variante}>{AMBIENTE[execucao.ambiente].label}</Badge>
                  </TableCell>
                  <TableCell>{nomeCurtoPlugin(execucao.pluginChave)}</TableCell>
                  <TableCell>{rotuloObjeto(execucao.objetoNome, execucao.objetoRevisao, execucao.objetoTitulo)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_EXECUCAO[execucao.status].variante}>
                      {STATUS_EXECUCAO[execucao.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell align="center">
                    {execucao.status === "pendente" && (
                      <IconButton
                        icon={<X size={15} />}
                        label="Cancelar trabalho"
                        variant="danger"
                        size="small"
                        onClick={() => setCancelar(execucao)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <RelatorioDiario3dx ambiente={ambiente} onFeedback={onFeedback} />

      <ConfirmDialog
        open={confirmar !== null}
        title={
          (confirmar?.acao === "varredura" ? "Iniciar varredura" : "Reprocessar item") + ` em ${rotuloAmbienteConfirmar}`
        }
        variant={emProducao ? "danger" : "warning"}
        message={
          confirmar?.acao === "varredura"
            ? `Varredura de ${confirmar.limite > 0 ? `até ${confirmar.limite}` : "todos os"} desenho(s) liberado(s) no 3DSpace de ${rotuloAmbienteConfirmar.toLowerCase()}. No modo Ativo, cria os vínculos que faltarem.`
            : `Reprocessar ${confirmar && "nome" in confirmar ? confirmar.nome : ""} no 3DSpace de ${rotuloAmbienteConfirmar.toLowerCase()}. No modo Ativo, o plugin altera o 3DEXPERIENCE${emProducao ? " de produção" : ""}.`
        }
        confirmLabel="Enviar"
        loading={enviando}
        onConfirm={executar}
        onClose={() => setConfirmar(null)}
      />

      <ConfirmDialog
        open={cancelar !== null}
        title="Cancelar trabalho"
        variant="danger"
        message="O trabalho sai da fila e não será processado."
        confirmLabel="Cancelar trabalho"
        onConfirm={confirmarCancelamento}
        onClose={() => setCancelar(null)}
      />
    </Stack>
  );
}
