"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, RotateCw, Video } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import {
  atualizarAgenteTv,
  atualizarGradeTerminalTv,
  listarGrades,
  listarTerminaisTv,
  visualizarTerminalTv,
} from "../services/tvCorporativa.service";
import type { GradeTv, TerminalTv } from "../types/tvCorporativa.types";
import {
  estaAgenteOnline,
  estaOnline,
  formatarDataHora,
  formatarTempoRelativo,
  varianteStatusAgente,
} from "../utils/statusTerminal";
import { VisualizacaoAoVivoModal } from "./VisualizacaoAoVivoModal";

interface DispositivosRestritoPainelProps {
  onFeedback: FeedbackHandler;
}

/*
 * Versão restrita de Dispositivos pra /tv-corporativa (usuários
 * comuns com acesso ao módulo, não-admin) — só os terminais da
 * própria empresa (filtro já aplicado no backend, ver
 * /api/tv-corporativa/terminais). Sem reiniciar máquina, revogar
 * pareamento ou excluir terminal: só trocar a grade exibida, ver ao
 * vivo e forçar atualização do agente — o resto continua exclusivo de
 * Administração → TV Corporativa → Dispositivos.
 */
export function DispositivosRestritoPainel({ onFeedback }: DispositivosRestritoPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [terminais, setTerminais] = useState<TerminalTv[]>([]);
  const [grades, setGrades] = useState<GradeTv[]>([]);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [enviandoComandoId, setEnviandoComandoId] = useState<string | null>(null);
  const [terminalParaVisualizar, setTerminalParaVisualizar] = useState<TerminalTv | null>(null);
  const [terminalParaDetalharAgente, setTerminalParaDetalharAgente] = useState<TerminalTv | null>(
    null
  );

  async function carregarTudo() {
    const [listaTerminais, listaGrades] = await Promise.all([listarTerminaisTv(), listarGrades()]);
    setTerminais(listaTerminais);
    setGrades(listaGrades);
  }

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      await carregarTudo();
      if (!cancelado) setCarregando(false);
    }

    carregar();
    const intervalo = setInterval(carregarTudo, 20000);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  async function handleAlterarGrade(terminal: TerminalTv, gradeId: string) {
    setSalvandoId(terminal.id);

    try {
      const resultado = await atualizarGradeTerminalTv(terminal.id, gradeId || null);

      if (resultado.ok) {
        await carregarTudo();
      } else {
        onFeedback(
          "danger",
          "Não foi possível atribuir a grade",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvandoId(null);
    }
  }

  async function handleAtualizarAgente(terminal: TerminalTv) {
    setEnviandoComandoId(terminal.id);

    try {
      const resultado = await atualizarAgenteTv(terminal.id);

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Comando enviado" : "Não foi possível enviar o comando",
        resultado.message ?? "Tente novamente em instantes."
      );
    } finally {
      setEnviandoComandoId(null);
    }
  }

  if (carregando) {
    return <Loader label="Carregando terminais..." />;
  }

  const opcoesGrade = [
    { value: "", label: "Nenhuma" },
    ...grades.map((grade) => ({ value: grade.id, label: grade.nome })),
  ];

  return (
    <Card
      title="Dispositivos"
      description="TVs pareadas com a sua empresa — cada uma exibe a grade de programação atribuída."
      actions={
        <Button variant="secondary" onClick={carregarTudo}>
          <RefreshCw size={15} />
          Atualizar
        </Button>
      }
    >
      {terminais.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={26} />}
          title="Nenhum terminal encontrado"
          description="Ainda não há TVs pareadas vinculadas à sua empresa."
        />
      ) : (
        <Table minWidth={860}>
          <TableHead>
            <TableRow>
              <TableHeaderCell align="center">Status</TableHeaderCell>
              <TableHeaderCell>Nome</TableHeaderCell>
              <TableHeaderCell>Grade atribuída</TableHeaderCell>
              <TableHeaderCell>Última atividade</TableHeaderCell>
              <TableHeaderCell>Agente</TableHeaderCell>
              <TableHeaderCell align="center">Ações</TableHeaderCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {terminais.map((terminal) => {
              const online = estaOnline(terminal);

              return (
                <TableRow key={terminal.id}>
                  <TableCell align="center">
                    <Badge variant={online ? "success" : "neutral"}>
                      {online ? "Online" : "Offline"}
                    </Badge>
                  </TableCell>

                  <TableCell>{terminal.nome ?? "—"}</TableCell>

                  <TableCell>
                    <Dropdown
                      value={terminal.gradeId ?? ""}
                      options={opcoesGrade}
                      onValueChange={(valor) => handleAlterarGrade(terminal, valor)}
                      disabled={salvandoId === terminal.id}
                    />
                  </TableCell>

                  <TableCell>
                    {terminal.ultimoHeartbeatEm
                      ? formatarTempoRelativo(terminal.ultimoHeartbeatEm)
                      : "Nunca"}
                  </TableCell>

                  <TableCell>
                    {!terminal.agenteUltimaVerificacaoEm ? (
                      <Badge variant="neutral">Sem agente</Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTerminalParaDetalharAgente(terminal)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                      >
                        <Badge variant={varianteStatusAgente(terminal)}>
                          {estaAgenteOnline(terminal) ? "Online" : "Offline"}
                        </Badge>
                      </button>
                    )}
                  </TableCell>

                  <TableCell align="center">
                    <Stack direction="row" justify="center" gap={4}>
                      <IconButton
                        icon={<Video size={15} />}
                        label="Ver ao vivo"
                        size="small"
                        disabled={!online}
                        onClick={() => setTerminalParaVisualizar(terminal)}
                      />
                      <IconButton
                        icon={<RotateCw size={15} />}
                        label="Atualizar agente"
                        size="small"
                        disabled={!estaAgenteOnline(terminal) || enviandoComandoId === terminal.id}
                        onClick={() => handleAtualizarAgente(terminal)}
                      />
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <VisualizacaoAoVivoModal
        terminal={terminalParaVisualizar}
        onClose={() => setTerminalParaVisualizar(null)}
        visualizar={visualizarTerminalTv}
      />

      <Modal
        open={terminalParaDetalharAgente !== null}
        onClose={() => setTerminalParaDetalharAgente(null)}
        title={`Agente — ${terminalParaDetalharAgente?.nome ?? ""}`}
        size="small"
      >
        {terminalParaDetalharAgente && (
          <Stack gap={12}>
            <Badge variant={estaAgenteOnline(terminalParaDetalharAgente) ? "success" : "danger"}>
              {estaAgenteOnline(terminalParaDetalharAgente) ? "Online" : "Offline"}
            </Badge>

            <Stack gap={4}>
              <span>
                <strong>Última verificação:</strong>{" "}
                {terminalParaDetalharAgente.agenteUltimaVerificacaoEm
                  ? formatarTempoRelativo(terminalParaDetalharAgente.agenteUltimaVerificacaoEm)
                  : "—"}
              </span>
              <span>
                <strong>Próxima sincronização:</strong>{" "}
                {terminalParaDetalharAgente.agenteProximaVerificacaoEm &&
                estaAgenteOnline(terminalParaDetalharAgente)
                  ? formatarDataHora(terminalParaDetalharAgente.agenteProximaVerificacaoEm)
                  : "—"}
              </span>
            </Stack>
          </Stack>
        )}
      </Modal>
    </Card>
  );
}
