"use client";

import { useEffect, useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
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

import {
  buscarStatusManutencao,
  forcarLogoutTodos,
  forcarLogoutUsuario,
  listarUsuarios,
  salvarStatusManutencao,
} from "../services/adminPermissoes.service";
import type { PortalUsuarioAdmin, StatusManutencao } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

/* "Online agora" = alguma atividade nos últimos 5 minutos — não é o mesmo que "token ainda válido" (isso duraria até 10h). */
const JANELA_ONLINE_MS = 5 * 60 * 1000;

function formatarData(valorIso: string | null): string {
  if (!valorIso) return "—";
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/*
 * "Forçar logout" (individual ou em massa) só grava
 * sessao_invalidada_em — não apaga ultima_atividade_em, que
 * continuaria recente e mostraria "Online" mesmo com a sessão já
 * encerrada. Por isso conta como online só quando a última
 * atividade registrada é mais recente que a última invalidação
 * (ou não há nenhuma).
 */
function estaOnline(usuario: PortalUsuarioAdmin): boolean {
  if (!usuario.ultimaAtividadeEm) return false;

  const ultimaAtividade = new Date(usuario.ultimaAtividadeEm).getTime();
  if (Date.now() - ultimaAtividade >= JANELA_ONLINE_MS) return false;

  if (usuario.sessaoInvalidadaEm) {
    const invalidadaEm = new Date(usuario.sessaoInvalidadaEm).getTime();
    if (invalidadaEm >= ultimaAtividade) return false;
  }

  return true;
}

function formatarDuracao(desde: string): string {
  const minutos = Math.floor((Date.now() - new Date(desde).getTime()) / 60000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  return `${Math.floor(horas / 24)}d`;
}

function formatarTempoAtividade(usuario: PortalUsuarioAdmin): string {
  if (estaOnline(usuario)) {
    return usuario.ultimoLoginEm ? `Ativo há ${formatarDuracao(usuario.ultimoLoginEm)}` : "Ativo agora";
  }

  if (!usuario.ultimaAtividadeEm) return "Nunca logou";

  return `Última atividade há ${formatarDuracao(usuario.ultimaAtividadeEm)}`;
}

interface ManutencaoPainelProps {
  onFeedback: FeedbackHandler;
}

export function ManutencaoPainel({ onFeedback }: ManutencaoPainelProps) {
  const [carregando, setCarregando] = useState(true);

  const [status, setStatus] = useState<StatusManutencao | null>(null);
  const [ativoForm, setAtivoForm] = useState(false);
  const [mensagemForm, setMensagemForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [usuarios, setUsuarios] = useState<PortalUsuarioAdmin[]>([]);
  const [forcandoId, setForcandoId] = useState<string | null>(null);
  const [confirmandoTodos, setConfirmandoTodos] = useState(false);
  const [encerrandoTodos, setEncerrandoTodos] = useState(false);

  async function carregarTudo() {
    const [statusData, usuariosData] = await Promise.all([
      buscarStatusManutencao(),
      listarUsuarios(),
    ]);

    setStatus(statusData);
    setAtivoForm(statusData?.ativo ?? false);
    setMensagemForm(statusData?.mensagem ?? "");
    setUsuarios(usuariosData);
  }

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      await carregarTudo();
      setCarregando(false);
    }

    carregar();
  }, []);

  async function handleSalvarStatus() {
    setSalvando(true);

    try {
      const resultado = await salvarStatusManutencao({
        ativo: ativoForm,
        mensagem: ativoForm ? mensagemForm.trim() || null : undefined,
      });

      if (resultado.ok && resultado.data) {
        setStatus(resultado.data);
        onFeedback(
          "success",
          ativoForm ? "Manutenção ativada" : "Manutenção desativada",
          ativoForm
            ? "Só administradores conseguem usar o portal agora — as sessões dos demais usuários foram encerradas."
            : "O portal voltou ao normal para todo mundo."
        );

        if (ativoForm) {
          await carregarTudo();
        }
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

  async function handleForcarLogout(usuario: PortalUsuarioAdmin) {
    setForcandoId(usuario.id);

    try {
      const resultado = await forcarLogoutUsuario(usuario.id);

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Sessão encerrada" : "Não foi possível encerrar",
        resultado.message ?? "Tente novamente em instantes."
      );

      if (resultado.ok) {
        await carregarTudo();
      }
    } finally {
      setForcandoId(null);
    }
  }

  async function handleConfirmarEncerrarTodos() {
    setEncerrandoTodos(true);

    try {
      const resultado = await forcarLogoutTodos();

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Sessões encerradas" : "Não foi possível encerrar",
        resultado.message ?? "Tente novamente em instantes."
      );

      if (resultado.ok) {
        await carregarTudo();
      }
    } finally {
      setEncerrandoTodos(false);
      setConfirmandoTodos(false);
    }
  }

  if (carregando) {
    return <Loader label="Carregando dados de manutenção..." />;
  }

  const totalOnline = usuarios.filter(estaOnline).length;

  return (
    <Stack gap={20}>
      <Card
        title="Modo manutenção"
        description="Enquanto ativo, só administradores conseguem usar o portal — todo mundo mais vê uma tela de manutenção com a mensagem abaixo."
      >
        <Stack gap={16}>
          <Switch
            label={ativoForm ? "Manutenção ativada" : "Manutenção desativada"}
            checked={ativoForm}
            onChange={(event) => setAtivoForm(event.target.checked)}
            disabled={salvando}
          />

          {ativoForm && (
            <Field
              label="Mensagem exibida para os usuários"
              htmlFor="mensagemManutencao"
              hint="Opcional — se deixar em branco, mostra um texto padrão"
            >
              <Textarea
                id="mensagemManutencao"
                rows={3}
                value={mensagemForm}
                onChange={(event) => setMensagemForm(event.target.value)}
                placeholder="Ex: Estamos atualizando o portal, voltamos às 14h."
                disabled={salvando}
              />
            </Field>
          )}

          {status?.ativo && (
            <Alert variant="warning">
              Ativado em {formatarData(status.ativadoEm)}
              {status.ativadoPor && ` por ${status.ativadoPor}`}.
            </Alert>
          )}

          <Stack direction="row" justify="end">
            <Button onClick={handleSalvarStatus} loading={salvando}>
              Salvar
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card
        title="Encerrar sessões"
        description="Invalida o token de acesso — a pessoa continua com a conta ativa, só precisa logar de novo."
      >
        <Stack direction="row" justify="between" align="center" wrap>
          <span>Encerra a sessão de todos os usuários de uma vez (administradores continuam logados).</span>

          <Button variant="danger" onClick={() => setConfirmandoTodos(true)}>
            Encerrar todas as sessões agora
          </Button>
        </Stack>
      </Card>

      <Card
        title="Usuários"
        description={`${totalOnline} de ${usuarios.length} usuário(s) online agora (atividade nos últimos 5 minutos).`}
      >
        <Stack gap={16}>
          <Stack direction="row" justify="end">
            <Button variant="secondary" onClick={carregarTudo}>
              <RefreshCw size={15} />
              Atualizar
            </Button>
          </Stack>

          <Table minWidth={800}>
            <TableHead>
              <TableRow>
                <TableHeaderCell align="center">Status</TableHeaderCell>
                <TableHeaderCell>Usuário</TableHeaderCell>
                <TableHeaderCell>Atividade</TableHeaderCell>
                <TableHeaderCell align="center">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {usuarios.map((usuario) => {
                const online = estaOnline(usuario);

                return (
                  <TableRow key={usuario.id}>
                    <TableCell align="center">
                      <Badge variant={online ? "success" : "neutral"}>
                        {online ? "Online" : "Offline"}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <strong>{usuario.nomeExibicao}</strong>
                      <div>{usuario.samAccountName}</div>
                    </TableCell>

                    <TableCell>{formatarTempoAtividade(usuario)}</TableCell>

                    <TableCell align="center">
                      <Stack direction="row" justify="center">
                        <IconButton
                          icon={<LogOut size={15} />}
                          label="Forçar logout"
                          size="small"
                          variant="danger"
                          onClick={() => handleForcarLogout(usuario)}
                          loading={forcandoId === usuario.id}
                          disabled={forcandoId !== null}
                        />
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Stack>
      </Card>

      <ConfirmDialog
        open={confirmandoTodos}
        title="Encerrar todas as sessões?"
        message="Todo mundo com o portal aberto (exceto administradores) vai ser desconectado e precisar logar de novo. Essa ação não pode ser desfeita."
        confirmLabel="Encerrar todas"
        variant="danger"
        loading={encerrandoTodos}
        onClose={() => setConfirmandoTodos(false)}
        onConfirm={handleConfirmarEncerrarTodos}
      />
    </Stack>
  );
}
