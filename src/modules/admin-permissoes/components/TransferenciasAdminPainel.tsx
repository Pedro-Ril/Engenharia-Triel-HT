"use client";

import { useEffect, useState } from "react";
import { Send, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import {
  excluirTransferenciaAdmin,
  listarTransferenciasAdmin,
} from "../services/adminPermissoes.service";
import type { TransferenciaAdmin } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";

interface TransferenciasAdminPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function estaExpirada(transferencia: TransferenciaAdmin): boolean {
  return new Date(transferencia.expiraEm).getTime() <= Date.now();
}

function descricaoArquivos(transferencia: TransferenciaAdmin): string {
  return transferencia.arquivos.length === 1
    ? transferencia.arquivos[0].nomeOriginal
    : `${transferencia.arquivos.length} arquivos`;
}

export function TransferenciasAdminPainel({ onFeedback }: TransferenciasAdminPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [transferencias, setTransferencias] = useState<TransferenciaAdmin[]>([]);
  const [excluindo, setExcluindo] = useState<TransferenciaAdmin | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      setTransferencias(await listarTransferenciasAdmin());
      setCarregando(false);
    }

    carregar();
  }, []);

  async function handleConfirmarExclusao() {
    if (!excluindo) return;

    setConfirmandoExclusao(true);

    try {
      const resultado = await excluirTransferenciaAdmin(excluindo.id);

      if (resultado.ok) {
        setTransferencias((atual) => atual.filter((item) => item.id !== excluindo.id));
        onFeedback("success", "Transferência excluída", `"${descricaoArquivos(excluindo)}" foi removido.`);
        setExcluindo(null);
      } else {
        onFeedback(
          "danger",
          "Não foi possível excluir",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setConfirmandoExclusao(false);
    }
  }

  if (carregando) {
    return <Loader label="Carregando transferências..." />;
  }

  return (
    <Stack gap={20}>
      <Card
        title="Transferência de Arquivos"
        description="Todos os arquivos enviados por qualquer usuário através da ferramenta de transferência."
      >
        {transferencias.length === 0 ? (
          <EmptyState
            icon={<Send size={28} />}
            title="Nenhuma transferência ainda"
            description="Os arquivos enviados pelos usuários vão aparecer aqui."
          />
        ) : (
          <Table minWidth={860}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Arquivo</TableHeaderCell>
                <TableHeaderCell>Enviado por</TableHeaderCell>
                <TableHeaderCell align="center">Tamanho</TableHeaderCell>
                <TableHeaderCell>Destinatário</TableHeaderCell>
                <TableHeaderCell align="center">Criado em</TableHeaderCell>
                <TableHeaderCell align="center">Expira em</TableHeaderCell>
                <TableHeaderCell align="center">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {transferencias.map((transferencia) => {
                const expirada = estaExpirada(transferencia);

                return (
                  <TableRow key={transferencia.id}>
                    <TableCell>
                      <strong>{descricaoArquivos(transferencia)}</strong>
                      {transferencia.arquivos.length > 1 && (
                        <div>
                          {transferencia.arquivos.map((arquivo) => (
                            <div key={arquivo.id}>{arquivo.nomeOriginal}</div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{transferencia.enviadoPorNome ?? "—"}</TableCell>
                    <TableCell align="center">
                      {formatarTamanho(transferencia.tamanhoTotalBytes)}
                    </TableCell>
                    <TableCell>
                      {transferencia.destinatarioEmail ? (
                        <>
                          {transferencia.destinatarioEmail}
                          {transferencia.emailEnviado && (
                            <div>
                              <Badge variant="info">E-mail enviado</Badge>
                            </div>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell align="center">{formatarData(transferencia.criadoEm)}</TableCell>
                    <TableCell align="center">
                      {expirada ? (
                        <Badge variant="neutral">Expirado</Badge>
                      ) : (
                        formatarData(transferencia.expiraEm)
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        icon={<Trash2 size={15} />}
                        label="Excluir transferência"
                        size="small"
                        variant="danger"
                        onClick={() => setExcluindo(transferencia)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={excluindo !== null}
        title="Excluir transferência"
        variant="danger"
        message={`Tem certeza que deseja excluir "${excluindo ? descricaoArquivos(excluindo) : ""}"? O link deixa de funcionar imediatamente.`}
        confirmLabel="Excluir"
        loading={confirmandoExclusao}
        onClose={() => setExcluindo(null)}
        onConfirm={handleConfirmarExclusao}
      />
    </Stack>
  );
}
