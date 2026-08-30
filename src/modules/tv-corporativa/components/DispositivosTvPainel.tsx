"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Power, RefreshCw, RotateCw, ShieldOff, Trash2, Video } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
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
  atualizarTerminal,
  enviarComandoAgente,
  excluirTerminal,
  listarGrades,
  listarTerminais,
  parearTerminal,
  revogarTerminal,
} from "../services/tvCorporativa.service";
import type { GradeTv, TerminalTv } from "../types/tvCorporativa.types";
import { VisualizacaoAoVivoModal } from "./VisualizacaoAoVivoModal";

interface DispositivosTvPainelProps {
  onFeedback: FeedbackHandler;
}

/*
 * "Online" = heartbeat dentro de uma janela de tolerância — usa 3x o
 * intervalo configurado do próprio terminal (mínimo 60s), já que
 * cada terminal pode ter um intervalo de atualização diferente,
 * diferente do JANELA_ONLINE_MS fixo de ManutencaoPainel.tsx (que é
 * pra atividade humana, não heartbeat de dispositivo).
 */
function estaOnline(terminal: TerminalTv): boolean {
  if (!terminal.ultimoHeartbeatEm || terminal.revogadoEm) return false;

  const janelaMs = Math.max(60, terminal.intervaloAtualizacaoSegundos * 3) * 1000;
  return Date.now() - new Date(terminal.ultimoHeartbeatEm).getTime() < janelaMs;
}

/*
 * Sinal de vida do PROCESSO do agente nativo (ver
 * INTERVALO_VERIFICAR_CONFIG_MS em tv-agente/agente.mjs, hoje 5min) —
 * independente do heartbeat do navegador acima: um terminal rodando
 * direto no navegador (sem agente) nunca preenche isso, por isso
 * `agenteUltimaVerificacaoEm` null é tratado à parte, não como
 * "offline".
 */
const AGENTE_INTERVALO_VERIFICACAO_MS = 5 * 60 * 1000;

function estaAgenteOnline(terminal: TerminalTv): boolean {
  if (!terminal.agenteUltimaVerificacaoEm || terminal.revogadoEm) return false;

  const janelaMs = AGENTE_INTERVALO_VERIFICACAO_MS * 3;
  return Date.now() - new Date(terminal.agenteUltimaVerificacaoEm).getTime() < janelaMs;
}

/*
 * variant da badge de status do agente: verde só quando online E
 * atualizado, laranja quando online mas com uma versão antiga do
 * script (agenteAtualizado === false — null significa "nunca
 * reportou hash", tratado como se estivesse em dia), vermelho quando
 * offline — segue o mesmo padrão de cor (verde/laranja/vermelho) já
 * usado em Badge pros outros status do portal.
 */
function varianteStatusAgente(terminal: TerminalTv): "success" | "warning" | "danger" {
  if (!estaAgenteOnline(terminal)) return "danger";
  return terminal.agenteAtualizado === false ? "warning" : "success";
}

function formatarDataHora(dataIso: string): string {
  return new Date(dataIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function formatarTempoRelativo(dataIso: string): string {
  const diffMs = Date.now() - new Date(dataIso).getTime();
  const diffMinutos = Math.floor(diffMs / 60000);

  if (diffMinutos < 1) return "agora há pouco";
  if (diffMinutos < 60) return `há ${diffMinutos} min`;

  const diffHoras = Math.floor(diffMinutos / 60);
  if (diffHoras < 24) return `há ${diffHoras}h`;

  return `há ${Math.floor(diffHoras / 24)} dias`;
}

export function DispositivosTvPainel({ onFeedback }: DispositivosTvPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [terminais, setTerminais] = useState<TerminalTv[]>([]);
  const [grades, setGrades] = useState<GradeTv[]>([]);

  const [pareamentoAberto, setPareamentoAberto] = useState(false);
  const [codigoDigitado, setCodigoDigitado] = useState("");
  const [nomeDigitado, setNomeDigitado] = useState("");
  const [pareando, setPareando] = useState(false);

  const [terminalParaExcluir, setTerminalParaExcluir] = useState<TerminalTv | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [terminalParaRevogar, setTerminalParaRevogar] = useState<TerminalTv | null>(null);
  const [revogando, setRevogando] = useState(false);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [terminalParaVisualizar, setTerminalParaVisualizar] = useState<TerminalTv | null>(null);
  const [caminhoEditando, setCaminhoEditando] = useState<Record<string, string>>({});
  const [terminalParaReiniciar, setTerminalParaReiniciar] = useState<TerminalTv | null>(null);
  const [terminalParaDetalharAgente, setTerminalParaDetalharAgente] = useState<TerminalTv | null>(
    null
  );
  const [enviandoComandoId, setEnviandoComandoId] = useState<string | null>(null);

  async function carregarTudo() {
    const [listaTerminais, listaGrades] = await Promise.all([listarTerminais(), listarGrades()]);
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

  async function handleParear() {
    setPareando(true);

    try {
      const resultado = await parearTerminal(codigoDigitado.trim(), nomeDigitado.trim());

      if (resultado.ok) {
        onFeedback("success", "Terminal pareado", resultado.message ?? "Terminal pareado.");
        setPareamentoAberto(false);
        setCodigoDigitado("");
        setNomeDigitado("");
        await carregarTudo();
      } else {
        onFeedback(
          "danger",
          "Não foi possível parear",
          resultado.message ?? "Confira o código e tente novamente."
        );
      }
    } finally {
      setPareando(false);
    }
  }

  async function handleRevogar() {
    if (!terminalParaRevogar) return;
    setRevogando(true);

    try {
      const resultado = await revogarTerminal(terminalParaRevogar.id);

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Terminal revogado" : "Não foi possível revogar",
        resultado.message ?? "Tente novamente em instantes."
      );

      if (resultado.ok) await carregarTudo();
    } finally {
      setRevogando(false);
      setTerminalParaRevogar(null);
    }
  }

  async function handleExcluir() {
    if (!terminalParaExcluir) return;
    setExcluindo(true);

    try {
      const resultado = await excluirTerminal(terminalParaExcluir.id);

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Terminal excluído" : "Não foi possível excluir",
        resultado.message ?? "Tente novamente em instantes."
      );

      if (resultado.ok) await carregarTudo();
    } finally {
      setExcluindo(false);
      setTerminalParaExcluir(null);
    }
  }

  async function handleAlterarGrade(terminal: TerminalTv, gradeId: string) {
    setSalvandoId(terminal.id);

    try {
      const resultado = await atualizarTerminal(terminal.id, { gradeId: gradeId || null });

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

  async function handleAlterarIntervalo(terminal: TerminalTv, valor: string) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 5) return;

    setSalvandoId(terminal.id);

    try {
      const resultado = await atualizarTerminal(terminal.id, {
        intervaloAtualizacaoSegundos: numero,
      });

      if (resultado.ok) {
        await carregarTudo();
      } else {
        onFeedback(
          "danger",
          "Não foi possível atualizar o intervalo",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvandoId(null);
    }
  }

  function valorCaminho(terminal: TerminalTv): string {
    return caminhoEditando[terminal.id] ?? terminal.caminhoInicial ?? "";
  }

  async function handleSalvarCaminho(terminal: TerminalTv) {
    const valorDigitado = valorCaminho(terminal).trim();
    if (valorDigitado === (terminal.caminhoInicial ?? "")) return;

    setSalvandoId(terminal.id);

    try {
      const resultado = await atualizarTerminal(terminal.id, {
        caminhoInicial: valorDigitado || null,
      });

      if (resultado.ok) {
        await carregarTudo();
        setCaminhoEditando((atual) => {
          const copia = { ...atual };
          delete copia[terminal.id];
          return copia;
        });
      } else {
        onFeedback(
          "danger",
          "Não foi possível atualizar a página inicial",
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
      const resultado = await enviarComandoAgente(terminal.id, "atualizar_agente");

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Comando enviado" : "Não foi possível enviar o comando",
        resultado.message ?? "Tente novamente em instantes."
      );
    } finally {
      setEnviandoComandoId(null);
    }
  }

  async function handleReiniciarMaquina() {
    if (!terminalParaReiniciar) return;
    setEnviandoComandoId(terminalParaReiniciar.id);

    try {
      const resultado = await enviarComandoAgente(terminalParaReiniciar.id, "reiniciar_maquina");

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Comando enviado" : "Não foi possível enviar o comando",
        resultado.message ?? "Tente novamente em instantes."
      );
    } finally {
      setEnviandoComandoId(null);
      setTerminalParaReiniciar(null);
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
      title="Terminais"
      description="TVs pareadas com o portal — cada uma exibe a grade de programação atribuída."
      actions={
        <Stack direction="row" gap={8}>
          <Button variant="secondary" onClick={carregarTudo}>
            <RefreshCw size={15} />
            Atualizar
          </Button>
          <Button onClick={() => setPareamentoAberto(true)}>Parear terminal</Button>
        </Stack>
      }
    >
      {terminais.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={26} />}
          title="Nenhum terminal pareado ainda"
          description='Abra o player (/tv) numa TV e clique em "Parear terminal" com o código exibido na tela.'
        />
      ) : (
        <Table minWidth={1080}>
          <TableHead>
            <TableRow>
              <TableHeaderCell align="center">Status</TableHeaderCell>
              <TableHeaderCell>Nome</TableHeaderCell>
              <TableHeaderCell>Grade atribuída</TableHeaderCell>
              <TableHeaderCell align="center">Intervalo (s)</TableHeaderCell>
              <TableHeaderCell>Página inicial</TableHeaderCell>
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
                    />
                  </TableCell>

                  <TableCell align="center">
                    <NumberInput
                      value={String(terminal.intervaloAtualizacaoSegundos)}
                      min={5}
                      onChange={(event) => handleAlterarIntervalo(terminal, event.target.value)}
                      disabled={salvandoId === terminal.id}
                    />
                  </TableCell>

                  <TableCell>
                    <Input
                      value={valorCaminho(terminal)}
                      placeholder="/tv"
                      onChange={(event) =>
                        setCaminhoEditando((atual) => ({
                          ...atual,
                          [terminal.id]: event.target.value,
                        }))
                      }
                      onBlur={() => handleSalvarCaminho(terminal)}
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
                      <Stack direction="row" gap={6} align="center">
                        {terminal.agenteSistemaOperacional && (
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            {terminal.agenteSistemaOperacional === "windows" ? "Windows" : "Linux"}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setTerminalParaDetalharAgente(terminal)}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        >
                          <Badge variant={varianteStatusAgente(terminal)}>
                            {estaAgenteOnline(terminal) ? "Online" : "Offline"}
                          </Badge>
                        </button>
                      </Stack>
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
                      <IconButton
                        icon={<Power size={15} />}
                        label="Reiniciar terminal"
                        size="small"
                        variant="danger"
                        disabled={!estaAgenteOnline(terminal) || enviandoComandoId === terminal.id}
                        onClick={() => setTerminalParaReiniciar(terminal)}
                      />
                      <IconButton
                        icon={<ShieldOff size={15} />}
                        label="Revogar pareamento"
                        size="small"
                        variant="danger"
                        onClick={() => setTerminalParaRevogar(terminal)}
                      />
                      <IconButton
                        icon={<Trash2 size={15} />}
                        label="Excluir terminal"
                        size="small"
                        variant="danger"
                        onClick={() => setTerminalParaExcluir(terminal)}
                      />
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Modal
        open={pareamentoAberto}
        onClose={() => setPareamentoAberto(false)}
        title="Parear terminal"
        description="Digite o código de 6 dígitos exibido na tela do terminal e dê um nome pra ele."
      >
        <Stack gap={16}>
          <Field label="Código" htmlFor="tv-codigo-pareamento" required>
            <Input
              id="tv-codigo-pareamento"
              value={codigoDigitado}
              onChange={(event) => setCodigoDigitado(event.target.value)}
              placeholder="123456"
              maxLength={8}
            />
          </Field>

          <Field label="Nome do terminal" htmlFor="tv-nome-terminal" required>
            <Input
              id="tv-nome-terminal"
              value={nomeDigitado}
              onChange={(event) => setNomeDigitado(event.target.value)}
              placeholder="Ex: Recepção, Chão de fábrica"
            />
          </Field>

          <Stack direction="row" justify="end">
            <Button
              onClick={handleParear}
              loading={pareando}
              disabled={!codigoDigitado.trim() || !nomeDigitado.trim()}
            >
              Parear
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={terminalParaRevogar !== null}
        title="Revogar pareamento?"
        message={`O terminal "${terminalParaRevogar?.nome}" vai parar de conseguir buscar programação e vai precisar ser pareado de novo, com um código novo.`}
        confirmLabel="Revogar"
        variant="danger"
        loading={revogando}
        onClose={() => setTerminalParaRevogar(null)}
        onConfirm={handleRevogar}
      />

      <ConfirmDialog
        open={terminalParaExcluir !== null}
        title="Excluir terminal?"
        message={`O cadastro de "${terminalParaExcluir?.nome}" será apagado permanentemente. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="danger"
        loading={excluindo}
        onClose={() => setTerminalParaExcluir(null)}
        onConfirm={handleExcluir}
      />

      <ConfirmDialog
        open={terminalParaReiniciar !== null}
        title="Reiniciar terminal?"
        message={`A máquina de "${terminalParaReiniciar?.nome}" vai reiniciar assim que o agente pegar o comando (até alguns minutos) — a tela fica fora do ar durante o processo.`}
        confirmLabel="Reiniciar"
        variant="danger"
        loading={enviandoComandoId === terminalParaReiniciar?.id}
        onClose={() => setTerminalParaReiniciar(null)}
        onConfirm={handleReiniciarMaquina}
      />

      <VisualizacaoAoVivoModal
        terminal={terminalParaVisualizar}
        onClose={() => setTerminalParaVisualizar(null)}
      />

      <Modal
        open={terminalParaDetalharAgente !== null}
        onClose={() => setTerminalParaDetalharAgente(null)}
        title={`Agente — ${terminalParaDetalharAgente?.nome ?? ""}`}
        size="small"
      >
        {terminalParaDetalharAgente && (
          <Stack gap={12}>
            <Stack direction="row" gap={8} align="center">
              <Badge variant={estaAgenteOnline(terminalParaDetalharAgente) ? "success" : "danger"}>
                {estaAgenteOnline(terminalParaDetalharAgente) ? "Online" : "Offline"}
              </Badge>
              <Badge variant={terminalParaDetalharAgente.agenteAtualizado ? "success" : "warning"}>
                {terminalParaDetalharAgente.agenteAtualizado ? "Atualizado" : "Desatualizado"}
              </Badge>
            </Stack>

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
              <span>
                <strong>Sistema operacional:</strong>{" "}
                {terminalParaDetalharAgente.agenteSistemaOperacional === "windows"
                  ? "Windows"
                  : terminalParaDetalharAgente.agenteSistemaOperacional === "linux"
                    ? "Linux"
                    : "—"}
              </span>
              <span>
                <strong>IP:</strong> {terminalParaDetalharAgente.agenteIp ?? "—"}
              </span>
              <span>
                <strong>CPU:</strong>{" "}
                {terminalParaDetalharAgente.agenteCpuPercentual !== null
                  ? `${terminalParaDetalharAgente.agenteCpuPercentual.toFixed(1)}%`
                  : "—"}
              </span>
              <span>
                <strong>Memória:</strong>{" "}
                {terminalParaDetalharAgente.agenteMemoriaPercentual !== null
                  ? `${terminalParaDetalharAgente.agenteMemoriaPercentual.toFixed(1)}%`
                  : "—"}
              </span>
            </Stack>
          </Stack>
        )}
      </Modal>
    </Card>
  );
}
