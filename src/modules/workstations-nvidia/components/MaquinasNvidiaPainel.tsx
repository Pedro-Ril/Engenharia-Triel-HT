"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  MonitorCog,
  Plus,
  RefreshCw,
  ScanSearch,
  Trash2,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import { Switch } from "@/components/ui/Switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import {
  adicionarMaquinas,
  atualizarMaquina,
  buscarResumoMaquinas,
  coletarAgora,
  excluirMaquina,
} from "../services/workstationsNvidia.service";
import type {
  MaquinaNvidia,
  ResumoMaquinasNvidia,
  StatusMaquinaNvidia,
} from "../types/workstationsNvidia.types";
import { formatarDataHora, formatarTempoRelativo, STATUS_MAQUINA } from "../utils/exibicao";
import {
  carregarEventosParaExportar,
  exportarMaquinaExcel,
  exportarMaquinaPdf,
  exportarMaquinasExcel,
  exportarMaquinasPdf,
} from "../utils/exportarWorkstations";
import { DetalheMaquinaNvidiaModal } from "./DetalheMaquinaNvidiaModal";
import styles from "./WorkstationsNvidia.module.css";

interface MaquinasNvidiaPainelProps {
  onFeedback: FeedbackHandler;
}

const INTERVALO_ATUALIZACAO_MS = 60000;

const STATUS_ATENCAO = new Set<StatusMaquinaNvidia>([
  "falha",
  "erro",
  "divergente",
  "estado_antigo",
  "perfil_desatualizado",
  "adiado",
]);

export function MaquinasNvidiaPainel({ onFeedback }: MaquinasNvidiaPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [resumo, setResumo] = useState<ResumoMaquinasNvidia | null>(null);

  const [coletandoTodas, setColetandoTodas] = useState(false);
  const [coletandoId, setColetandoId] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [textoComputadores, setTextoComputadores] = useState("");
  const [adicionando, setAdicionando] = useState(false);

  const [maquinaParaExcluir, setMaquinaParaExcluir] = useState<MaquinaNvidia | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [idDetalhe, setIdDetalhe] = useState<string | null>(null);
  /* id da máquina sendo exportada (o relatório de uma máquina busca o histórico antes de gerar). */
  const [exportandoId, setExportandoId] = useState<string | null>(null);

  async function recarregar() {
    const resposta = await buscarResumoMaquinas();
    if (resposta.ok && resposta.data) {
      setResumo(resposta.data);
    } else {
      onFeedback("danger", "Não foi possível carregar", resposta.message ?? "Tente novamente.");
    }
  }

  useEffect(() => {
    let cancelado = false;

    async function carregarInicial() {
      const resposta = await buscarResumoMaquinas();
      if (cancelado) return;
      if (resposta.ok && resposta.data) setResumo(resposta.data);
      setCarregando(false);
    }

    async function atualizarEmSegundoPlano() {
      const resposta = await buscarResumoMaquinas();
      if (!cancelado && resposta.ok && resposta.data) setResumo(resposta.data);
    }

    carregarInicial();
    const intervalo = setInterval(atualizarEmSegundoPlano, INTERVALO_ATUALIZACAO_MS);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  async function handleColetarTodas() {
    setColetandoTodas(true);
    try {
      const resposta = await coletarAgora();
      onFeedback(
        resposta.ok ? "success" : "danger",
        resposta.ok ? "Coleta concluída" : "Não foi possível coletar",
        resposta.message ?? "Tente novamente em instantes."
      );
      await recarregar();
    } finally {
      setColetandoTodas(false);
    }
  }

  async function handleColetarUma(maquina: MaquinaNvidia) {
    setColetandoId(maquina.id);
    try {
      const resposta = await coletarAgora(maquina.id);
      onFeedback(
        resposta.ok ? "success" : "danger",
        resposta.ok ? `${maquina.computador} coletada` : "Não foi possível coletar",
        resposta.message ?? "Tente novamente em instantes."
      );
      await recarregar();
    } finally {
      setColetandoId(null);
    }
  }

  async function handleAdicionar() {
    setAdicionando(true);
    try {
      const resposta = await adicionarMaquinas(textoComputadores);
      if (resposta.ok) {
        onFeedback("success", "Máquinas adicionadas", resposta.message ?? "Pronto.");
        setAdicionarAberto(false);
        setTextoComputadores("");
        await recarregar();
      } else {
        onFeedback("danger", "Não foi possível adicionar", resposta.message ?? "Confira os nomes.");
      }
    } finally {
      setAdicionando(false);
    }
  }

  async function handleAlterarAtivo(maquina: MaquinaNvidia, ativo: boolean) {
    setSalvandoId(maquina.id);
    try {
      const resposta = await atualizarMaquina(maquina.id, { ativo });
      if (resposta.ok) {
        await recarregar();
      } else {
        onFeedback("danger", "Não foi possível atualizar", resposta.message ?? "Tente novamente.");
      }
    } finally {
      setSalvandoId(null);
    }
  }

  async function handleExcluir() {
    if (!maquinaParaExcluir) return;
    setExcluindo(true);
    try {
      const resposta = await excluirMaquina(maquinaParaExcluir.id);
      onFeedback(
        resposta.ok ? "success" : "danger",
        resposta.ok ? "Máquina removida" : "Não foi possível remover",
        resposta.message ?? "Tente novamente em instantes."
      );
      if (resposta.ok) await recarregar();
    } finally {
      setExcluindo(false);
      setMaquinaParaExcluir(null);
    }
  }

  async function handleExportarMaquina(maquina: MaquinaNvidia, formato: "pdf" | "excel") {
    setExportandoId(maquina.id);
    try {
      const eventos = await carregarEventosParaExportar(maquina.id);
      const hashOficial = resumo?.perfil.hash ?? null;
      if (formato === "pdf") exportarMaquinaPdf(maquina, hashOficial, eventos);
      else exportarMaquinaExcel(maquina, hashOficial, eventos);
    } catch (error) {
      onFeedback(
        "danger",
        `Não foi possível exportar ${maquina.computador}`,
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setExportandoId(null);
    }
  }

  function handleExportarTodas(formato: "pdf" | "excel") {
    const lista = resumo?.maquinas ?? [];
    try {
      if (formato === "pdf") exportarMaquinasPdf(lista);
      else exportarMaquinasExcel(lista, resumo?.perfil.hash ?? null);
    } catch (error) {
      onFeedback(
        "danger",
        "Não foi possível exportar as workstations",
        error instanceof Error ? error.message : "Tente novamente."
      );
    }
  }

  if (carregando) {
    return <Loader label="Carregando workstations..." />;
  }

  const maquinas = resumo?.maquinas ?? [];
  const ativas = maquinas.filter((maquina) => maquina.ativo);
  const conformes = ativas.filter((maquina) => maquina.status === "conforme").length;
  const atencao = ativas.filter((maquina) => STATUS_ATENCAO.has(maquina.status)).length;
  const semContato = ativas.filter((maquina) => maquina.status === "sem_contato").length;
  const maquinaDetalhe = maquinas.find((maquina) => maquina.id === idDetalhe) ?? null;

  return (
    <Stack gap={20}>
      <FormGrid columns={4}>
        <StatCard label="Máquinas monitoradas" value={ativas.length} icon={<MonitorCog />} variant="info" />
        <StatCard label="Conformes" value={conformes} icon={<CheckCircle2 />} variant="success" />
        <StatCard
          label="Precisam de atenção"
          value={atencao}
          icon={<AlertTriangle />}
          variant={atencao > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Sem contato"
          value={semContato}
          icon={<WifiOff />}
          variant={semContato > 0 ? "danger" : "neutral"}
        />
      </FormGrid>

      <Card
        title="Workstations"
        description={
          resumo?.ultimaColetaGeralEm
            ? `Última coleta geral ${formatarTempoRelativo(resumo.ultimaColetaGeralEm)} (${formatarDataHora(resumo.ultimaColetaGeralEm)}).`
            : "O portal lê o estado.json de cada máquina na coleta automática ou quando você clica em Coletar agora."
        }
        actions={
          <Stack direction="row" gap={8} wrap>
            <Button variant="secondary" onClick={recarregar}>
              <RefreshCw size={15} />
              Atualizar
            </Button>
            <DropdownMenu
              label="Exportar todas as workstations"
              triggerText="Exportar"
              triggerIcon={<Download size={15} />}
              disabled={maquinas.length === 0}
              items={[
                {
                  value: "pdf",
                  label: "Todas em PDF",
                  icon: <FileText size={15} />,
                  onSelect: () => handleExportarTodas("pdf"),
                },
                {
                  value: "excel",
                  label: "Todas em Excel",
                  icon: <FileSpreadsheet size={15} />,
                  onSelect: () => handleExportarTodas("excel"),
                },
              ]}
            />
            <Button
              variant="secondary"
              onClick={handleColetarTodas}
              loading={coletandoTodas || Boolean(resumo?.coletaEmAndamento)}
              loadingLabel="Coletando..."
              disabled={ativas.length === 0}
            >
              <ScanSearch size={15} />
              Coletar agora
            </Button>
            <Button onClick={() => setAdicionarAberto(true)}>
              <Plus size={15} />
              Adicionar máquinas
            </Button>
          </Stack>
        }
      >
        {maquinas.length === 0 ? (
          <EmptyState
            icon={<MonitorCog size={26} />}
            title="Nenhuma workstation cadastrada"
            description='Clique em "Adicionar máquinas" e cole os nomes das workstations, um por linha.'
          />
        ) : (
          <Table minWidth={1100}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Máquina</TableHeaderCell>
                <TableHeaderCell>GPU</TableHeaderCell>
                <TableHeaderCell>Driver</TableHeaderCell>
                <TableHeaderCell>Verificado pelo script</TableHeaderCell>
                <TableHeaderCell>Última reaplicação</TableHeaderCell>
                <TableHeaderCell>Leitura pelo portal</TableHeaderCell>
                <TableHeaderCell align="center">Ativa</TableHeaderCell>
                <TableHeaderCell align="center">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {maquinas.map((maquina) => {
                const status = STATUS_MAQUINA[maquina.status];

                return (
                  <TableRow key={maquina.id} className={maquina.ativo ? undefined : styles.linhaInativa}>
                    <TableCell>
                      <Badge variant={status.variante} title={status.descricao}>
                        {status.label}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className={styles.celulaMaquina}>
                        <strong>{maquina.computador}</strong>
                        {maquina.descricao && (
                          <span className={styles.textoSecundario}>{maquina.descricao}</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>{maquina.gpu ?? "—"}</TableCell>

                    <TableCell>{maquina.driverNvidia ?? "—"}</TableCell>

                    <TableCell title={formatarDataHora(maquina.verificadoEm)}>
                      {maquina.verificadoEm ? formatarTempoRelativo(maquina.verificadoEm) : "—"}
                    </TableCell>

                    <TableCell title={formatarDataHora(maquina.ultimaReaplicacaoEm)}>
                      {maquina.ultimaReaplicacaoEm ? (
                        <Stack direction="row" gap={6} align="center">
                          <span>{formatarTempoRelativo(maquina.ultimaReaplicacaoEm)}</span>
                          {maquina.ultimaReaplicacaoSucesso === false && (
                            <Badge variant="danger">falhou</Badge>
                          )}
                        </Stack>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    <TableCell title={maquina.coletaErro ?? formatarDataHora(maquina.coletaEm)}>
                      <div className={styles.celulaMaquina}>
                        <span>{formatarTempoRelativo(maquina.coletaEm)}</span>
                        {maquina.coletaOk === false && maquina.contatoEm && (
                          <span className={styles.textoSecundario}>
                            último contato {formatarTempoRelativo(maquina.contatoEm)}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell align="center">
                      <Switch
                        label=""
                        compact
                        checked={maquina.ativo}
                        disabled={salvandoId === maquina.id}
                        aria-label={`Monitorar ${maquina.computador}`}
                        onChange={(event) => handleAlterarAtivo(maquina, event.target.checked)}
                      />
                    </TableCell>

                    <TableCell align="center">
                      {/* Coletando ou gerando arquivo desta máquina: o ⋮ vira um indicador de andamento. */}
                      {coletandoId === maquina.id || exportandoId === maquina.id ? (
                        <IconButton
                          icon={<ScanSearch size={15} />}
                          label={coletandoId === maquina.id ? "Coletando..." : "Gerando arquivo..."}
                          size="small"
                          loading
                        />
                      ) : (
                        <DropdownMenu
                          label={`Ações de ${maquina.computador}`}
                          items={[
                            {
                              value: "detalhes",
                              label: "Ver detalhes",
                              icon: <Eye size={15} />,
                              onSelect: () => setIdDetalhe(maquina.id),
                            },
                            {
                              value: "coletar",
                              label: "Coletar esta máquina",
                              icon: <ScanSearch size={15} />,
                              disabled: coletandoTodas || coletandoId !== null,
                              onSelect: () => handleColetarUma(maquina),
                            },
                            {
                              value: "pdf",
                              label: "Exportar PDF",
                              icon: <FileText size={15} />,
                              separatorBefore: true,
                              disabled: exportandoId !== null,
                              onSelect: () => void handleExportarMaquina(maquina, "pdf"),
                            },
                            {
                              value: "excel",
                              label: "Exportar Excel",
                              icon: <FileSpreadsheet size={15} />,
                              disabled: exportandoId !== null,
                              onSelect: () => void handleExportarMaquina(maquina, "excel"),
                            },
                            {
                              value: "remover",
                              label: "Remover do monitoramento",
                              icon: <Trash2 size={15} />,
                              danger: true,
                              separatorBefore: true,
                              onSelect: () => setMaquinaParaExcluir(maquina),
                            },
                          ]}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        open={adicionarAberto}
        title="Adicionar máquinas"
        description="Cole os nomes das workstations — um por linha, ou separados por vírgula ou espaço."
        onClose={() => setAdicionarAberto(false)}
        footer={
          <Stack direction="row" gap={8} justify="end">
            <Button variant="secondary" onClick={() => setAdicionarAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAdicionar}
              loading={adicionando}
              disabled={!textoComputadores.trim()}
            >
              Adicionar
            </Button>
          </Stack>
        }
      >
        <Field
          label="Nomes dos computadores"
          htmlFor="ws-nvidia-computadores"
          hint="Ex: ENGAGRO02. Nomes já cadastrados são ignorados."
        >
          <Textarea
            id="ws-nvidia-computadores"
            rows={8}
            value={textoComputadores}
            placeholder={"ENGAGRO01\nENGAGRO02\nENGAGRO03"}
            onChange={(event) => setTextoComputadores(event.target.value)}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={maquinaParaExcluir !== null}
        title="Remover máquina do monitoramento"
        message={
          <>
            <strong>{maquinaParaExcluir?.computador}</strong> sai da lista e o histórico dela é apagado.
            Isso não mexe em nada na própria máquina — o script continua rodando lá enquanto o GPO estiver aplicado.
          </>
        }
        confirmLabel="Remover"
        variant="danger"
        loading={excluindo}
        onConfirm={handleExcluir}
        onClose={() => setMaquinaParaExcluir(null)}
      />

      {maquinaDetalhe && (
        <DetalheMaquinaNvidiaModal
          key={maquinaDetalhe.id}
          maquina={maquinaDetalhe}
          hashPerfilOficial={resumo?.perfil.hash ?? null}
          coletando={coletandoId === maquinaDetalhe.id}
          onColetar={() => handleColetarUma(maquinaDetalhe)}
          onDescricaoSalva={recarregar}
          onFeedback={onFeedback}
          onClose={() => setIdDetalhe(null)}
        />
      )}
    </Stack>
  );
}
