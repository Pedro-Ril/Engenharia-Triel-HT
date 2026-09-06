"use client";

import { useEffect, useState } from "react";
import { Ban, Copy, Home, Mail, Pencil, Send, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";

import {
  editarExpiracaoTransferencia,
  enviarTransferencia,
  excluirTransferencia,
  expirarTransferenciaAgora,
  listarMinhasTransferencias,
  reenviarLinkTransferencia,
} from "../services/transferencia.service";
import type { Transferencia, TransferenciaCriada } from "../types/transferencia.types";
import styles from "./TransferenciaPageClient.module.css";

const OPCOES_UNIDADE = [
  { value: "horas", label: "Horas" },
  { value: "dias", label: "Dias" },
];

const ITENS_POR_PAGINA = 5;

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function estaExpirada(transferencia: Transferencia, agoraMs: number): boolean {
  return new Date(transferencia.expiraEm).getTime() <= agoraMs;
}

function descricaoArquivos(transferencia: Transferencia): string {
  return transferencia.arquivos.length === 1
    ? transferencia.arquivos[0].nomeOriginal
    : `${transferencia.arquivos.length} arquivos`;
}

export function TransferenciaPageClient() {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [duracaoQuantidade, setDuracaoQuantidade] = useState("7");
  const [duracaoUnidade, setDuracaoUnidade] = useState<"horas" | "dias">("dias");
  const [mensagem, setMensagem] = useState("");
  const [enviarEmailFlag, setEnviarEmailFlag] = useState(false);
  const [destinatarioEmail, setDestinatarioEmail] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [ultimoEnvio, setUltimoEnvio] = useState<TransferenciaCriada | null>(null);

  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [pagina, setPagina] = useState(1);

  const [excluindo, setExcluindo] = useState<Transferencia | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const [editando, setEditando] = useState<Transferencia | null>(null);
  const [editQuantidade, setEditQuantidade] = useState("7");
  const [editUnidade, setEditUnidade] = useState<"horas" | "dias">("dias");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [expirandoAgora, setExpirandoAgora] = useState<Transferencia | null>(null);
  const [confirmandoExpiracao, setConfirmandoExpiracao] = useState(false);

  const [reenviandoId, setReenviandoId] = useState<string | null>(null);

  /*
   * Uma transferência pode expirar sozinha (só o tempo passando, sem
   * nenhuma ação manual) enquanto a página está aberta — sem isso, o
   * badge "Expirado" só apareceria depois de alguma outra interação
   * forçar um novo render. Recalcula a cada 30s, sem precisar buscar
   * nada do servidor (a data de expiração já está em memória).
   */
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  useEffect(() => {
    const intervalo = setInterval(() => setAgoraMs(Date.now()), 30_000);
    return () => clearInterval(intervalo);
  }, []);

  const [toast, setToast] = useState<{
    open: boolean;
    variant: "success" | "danger";
    title: string;
    description?: string;
  }>({ open: false, variant: "success", title: "" });

  useEffect(() => {
    async function carregar() {
      setCarregandoLista(true);
      setTransferencias(await listarMinhasTransferencias());
      setCarregandoLista(false);
    }

    carregar();
  }, []);

  async function handleEnviar() {
    if (arquivos.length === 0) {
      setToast({
        open: true,
        variant: "danger",
        title: "Selecione ao menos um arquivo",
        description: "Escolha os arquivos que deseja enviar antes de continuar.",
      });
      return;
    }

    const quantidade = Number(duracaoQuantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      setToast({
        open: true,
        variant: "danger",
        title: "Duração inválida",
        description: "Informe uma duração maior que zero para o link.",
      });
      return;
    }

    if (enviarEmailFlag && !destinatarioEmail.trim()) {
      setToast({
        open: true,
        variant: "danger",
        title: "E-mail obrigatório",
        description: "Informe o e-mail do destinatário ou desmarque o envio por e-mail.",
      });
      return;
    }

    setEnviando(true);
    setProgresso(0);
    setUltimoEnvio(null);

    const resultado = await enviarTransferencia({
      arquivos,
      duracaoQuantidade: quantidade,
      duracaoUnidade,
      mensagem,
      enviarEmail: enviarEmailFlag,
      destinatarioEmail,
      onProgresso: setProgresso,
    });

    setEnviando(false);

    if (resultado.ok && resultado.data) {
      setUltimoEnvio(resultado.data);
      setTransferencias((atual) => [resultado.data as TransferenciaCriada, ...atual]);
      setPagina(1);
      setArquivos([]);
      setMensagem("");
      setDestinatarioEmail("");
      setEnviarEmailFlag(false);

      setToast({
        open: true,
        variant: "success",
        title: resultado.data.arquivos.length === 1 ? "Arquivo enviado" : "Arquivos enviados",
        description: resultado.data.avisoEmail
          ? `Link gerado, mas houve um problema com o e-mail: ${resultado.data.avisoEmail}`
          : "O link de download já está pronto para compartilhar.",
      });
    } else {
      setToast({
        open: true,
        variant: "danger",
        title: "Não foi possível enviar",
        description: resultado.message ?? "Tente novamente em instantes.",
      });
    }
  }

  async function handleCopiarLink(link: string) {
    await navigator.clipboard.writeText(link);
    setToast({ open: true, variant: "success", title: "Link copiado" });
  }

  async function handleConfirmarExclusao() {
    if (!excluindo) return;

    setConfirmandoExclusao(true);

    try {
      const resultado = await excluirTransferencia(excluindo.id);

      if (resultado.ok) {
        setTransferencias((atual) => atual.filter((item) => item.id !== excluindo.id));
        setToast({
          open: true,
          variant: "success",
          title: "Transferência excluída",
          description: `"${descricaoArquivos(excluindo)}" foi removido.`,
        });
        setExcluindo(null);
      } else {
        setToast({
          open: true,
          variant: "danger",
          title: "Não foi possível excluir",
          description: resultado.message ?? "Tente novamente em instantes.",
        });
      }
    } finally {
      setConfirmandoExclusao(false);
    }
  }

  function handleAbrirEdicao(transferencia: Transferencia) {
    setEditando(transferencia);
    setEditQuantidade("7");
    setEditUnidade("dias");
  }

  async function handleSalvarEdicao() {
    if (!editando) return;

    const quantidade = Number(editQuantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      setToast({
        open: true,
        variant: "danger",
        title: "Duração inválida",
        description: "Informe uma duração maior que zero.",
      });
      return;
    }

    setSalvandoEdicao(true);

    try {
      const resultado = await editarExpiracaoTransferencia(editando.id, {
        duracaoQuantidade: quantidade,
        duracaoUnidade: editUnidade,
      });

      if (resultado.ok && resultado.data) {
        setTransferencias((atual) =>
          atual.map((item) => (item.id === editando.id ? (resultado.data as Transferencia) : item))
        );
        setToast({ open: true, variant: "success", title: "Expiração atualizada" });
        setEditando(null);
      } else {
        setToast({
          open: true,
          variant: "danger",
          title: "Não foi possível atualizar",
          description: resultado.message ?? "Tente novamente em instantes.",
        });
      }
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function handleReenviarLink(transferencia: Transferencia) {
    setReenviandoId(transferencia.id);

    try {
      const resultado = await reenviarLinkTransferencia(transferencia.id);

      if (resultado.ok && resultado.data) {
        setTransferencias((atual) =>
          atual.map((item) => (item.id === transferencia.id ? (resultado.data as Transferencia) : item))
        );
        setToast({
          open: true,
          variant: "success",
          title: "Link reenviado",
          description: `E-mail reenviado para ${transferencia.destinatarioEmail}.`,
        });
      } else {
        setToast({
          open: true,
          variant: "danger",
          title: "Não foi possível reenviar",
          description: resultado.message ?? "Tente novamente em instantes.",
        });
      }
    } finally {
      setReenviandoId(null);
    }
  }

  async function handleConfirmarExpirarAgora() {
    if (!expirandoAgora) return;

    setConfirmandoExpiracao(true);

    try {
      const resultado = await expirarTransferenciaAgora(expirandoAgora.id);

      if (resultado.ok && resultado.data) {
        setTransferencias((atual) =>
          atual.map((item) => (item.id === expirandoAgora.id ? (resultado.data as Transferencia) : item))
        );
        setToast({
          open: true,
          variant: "success",
          title: "Link expirado",
          description: `"${descricaoArquivos(expirandoAgora)}" não pode mais ser baixado.`,
        });
        setExpirandoAgora(null);
      } else {
        setToast({
          open: true,
          variant: "danger",
          title: "Não foi possível expirar",
          description: resultado.message ?? "Tente novamente em instantes.",
        });
      }
    } finally {
      setConfirmandoExpiracao(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(transferencias.length / ITENS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const transferenciasDaPagina = transferencias.slice(
    (paginaAtual - 1) * ITENS_POR_PAGINA,
    paginaAtual * ITENS_POR_PAGINA
  );

  return (
    <PageContainer>
      <PageHeader
        title="Transferência de Arquivos"
        description="Envie um ou mais arquivos sem limite de tamanho e gere um link de download para compartilhar — dentro da empresa."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Transferência de Arquivos", current: true, icon: <Send size={14} /> },
        ]}
      />

      <Stack gap={20}>
        <Card title="Enviar arquivo">
          <Stack gap={18}>
            <Field label="Arquivos">
              <FileUpload
                files={arquivos}
                onFilesChange={setArquivos}
                multiple
                maxSizeMB={1024 * 1024}
                limiteTexto="Sem limite de tamanho"
                disabled={enviando}
              />
            </Field>

            <FormGrid columns={2}>
              <Field label="O link fica ativo por">
                <Stack direction="row" gap={8}>
                  <NumberInput
                    value={duracaoQuantidade}
                    onChange={(event) => setDuracaoQuantidade(event.target.value)}
                    disabled={enviando}
                    min={1}
                  />
                  <Dropdown
                    value={duracaoUnidade}
                    options={OPCOES_UNIDADE}
                    onValueChange={(valor) => setDuracaoUnidade(valor as "horas" | "dias")}
                  />
                </Stack>
              </Field>

              <Field label="Mensagem (opcional)">
                <Textarea
                  value={mensagem}
                  onChange={(event) => setMensagem(event.target.value)}
                  disabled={enviando}
                  rows={1}
                />
              </Field>
            </FormGrid>

            <Checkbox
              label="Enviar o link por e-mail"
              checked={enviarEmailFlag}
              onChange={(event) => setEnviarEmailFlag(event.target.checked)}
              disabled={enviando}
            />

            {enviarEmailFlag && (
              <Field
                label="E-mail do destinatário"
                hint='separe vários e-mails com ";" — ex: "fulano@empresa.com; ciclano@empresa.com"'
              >
                <Input
                  type="text"
                  value={destinatarioEmail}
                  onChange={(event) => setDestinatarioEmail(event.target.value)}
                  disabled={enviando}
                />
              </Field>
            )}

            {enviando && (
              <Stack gap={6}>
                <div className={styles.progressoTrilha}>
                  <div
                    className={styles.progressoPreenchido}
                    style={{ width: `${progresso}%` }}
                  />
                </div>
                <span>Enviando... {progresso}%</span>
              </Stack>
            )}

            {ultimoEnvio && (
              <Alert variant="success">
                <Stack gap={8}>
                  <span>Link de download gerado:</span>
                  <div className={styles.linkResultado}>
                    <Input readOnly value={ultimoEnvio.linkDownload} />
                    <Button
                      variant="secondary"
                      onClick={() => handleCopiarLink(ultimoEnvio.linkDownload)}
                    >
                      <Copy size={16} />
                      Copiar
                    </Button>
                  </div>
                </Stack>
              </Alert>
            )}

            <Stack direction="row" justify="end">
              <Button onClick={handleEnviar} loading={enviando}>
                <Send size={16} />
                Enviar
              </Button>
            </Stack>
          </Stack>
        </Card>

        <Card title="Minhas transferências">
          {!carregandoLista && transferencias.length === 0 && (
            <EmptyState
              icon={<Send size={28} />}
              title="Nenhuma transferência ainda"
              description="Os arquivos que você enviar vão aparecer aqui."
            />
          )}

          {transferencias.length > 0 && (
            <Stack gap={16}>
              <Table minWidth={720}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Arquivo</TableHeaderCell>
                  <TableHeaderCell align="center">Tamanho</TableHeaderCell>
                  <TableHeaderCell align="center">Criado em</TableHeaderCell>
                  <TableHeaderCell align="center">Expira em</TableHeaderCell>
                  <TableHeaderCell align="center">Ações</TableHeaderCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {transferenciasDaPagina.map((transferencia) => {
                  const expirada = estaExpirada(transferencia, agoraMs);
                  const link = `${window.location.origin}/baixar/${transferencia.token}`;

                  return (
                    <TableRow key={transferencia.id}>
                      <TableCell>
                        <strong>{descricaoArquivos(transferencia)}</strong>
                        {transferencia.arquivos.length > 1 && (
                          <div className={styles.listaNomesArquivos}>
                            {transferencia.arquivos.map((arquivo) => (
                              <div key={arquivo.id}>{arquivo.nomeOriginal}</div>
                            ))}
                          </div>
                        )}
                        {transferencia.destinatarioEmail && (
                          <div>
                            {transferencia.emailEnviado ? "Enviado para " : "Destino: "}
                            {transferencia.destinatarioEmail}
                          </div>
                        )}
                      </TableCell>
                      <TableCell align="center" className={styles.semQuebra}>
                        {formatarTamanho(transferencia.tamanhoTotalBytes)}
                      </TableCell>
                      <TableCell align="center" className={styles.semQuebra}>
                        {formatarData(transferencia.criadoEm)}
                      </TableCell>
                      <TableCell align="center" className={styles.semQuebra}>
                        {expirada ? (
                          <Badge variant="neutral">Expirado</Badge>
                        ) : (
                          formatarData(transferencia.expiraEm)
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" gap={6} justify="center">
                          {!expirada && (
                            <>
                              <IconButton
                                icon={<Copy size={15} />}
                                label="Copiar link"
                                size="small"
                                onClick={() => handleCopiarLink(link)}
                              />
                              <IconButton
                                icon={<Pencil size={15} />}
                                label="Editar expiração"
                                size="small"
                                onClick={() => handleAbrirEdicao(transferencia)}
                              />
                              <IconButton
                                icon={<Ban size={15} />}
                                label="Expirar agora"
                                size="small"
                                variant="danger"
                                onClick={() => setExpirandoAgora(transferencia)}
                              />
                              {transferencia.destinatarioEmail && (
                                <IconButton
                                  icon={<Mail size={15} />}
                                  label="Reenviar link por e-mail"
                                  size="small"
                                  loading={reenviandoId === transferencia.id}
                                  onClick={() => handleReenviarLink(transferencia)}
                                />
                              )}
                            </>
                          )}
                          <IconButton
                            icon={<Trash2 size={15} />}
                            label="Excluir transferência"
                            size="small"
                            variant="danger"
                            onClick={() => setExcluindo(transferencia)}
                          />
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              </Table>

              <Pagination
                page={paginaAtual}
                totalPages={totalPaginas}
                onPageChange={setPagina}
              />
            </Stack>
          )}
        </Card>
      </Stack>

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

      <ConfirmDialog
        open={expirandoAgora !== null}
        title="Expirar link agora"
        variant="danger"
        message={`Tem certeza que deseja expirar "${expirandoAgora ? descricaoArquivos(expirandoAgora) : ""}" agora? Quem tiver o link não vai mais conseguir baixar.`}
        confirmLabel="Expirar agora"
        loading={confirmandoExpiracao}
        onClose={() => setExpirandoAgora(null)}
        onConfirm={handleConfirmarExpirarAgora}
      />

      <Modal
        open={editando !== null}
        title="Editar expiração"
        description={editando ? descricaoArquivos(editando) : undefined}
        onClose={() => setEditando(null)}
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarEdicao} loading={salvandoEdicao}>
              Salvar
            </Button>
          </Stack>
        }
      >
        <Field label="O link passa a expirar em">
          <Stack direction="row" gap={8}>
            <NumberInput
              value={editQuantidade}
              onChange={(event) => setEditQuantidade(event.target.value)}
              disabled={salvandoEdicao}
              min={1}
            />
            <Dropdown
              value={editUnidade}
              options={OPCOES_UNIDADE}
              onValueChange={(valor) => setEditUnidade(valor as "horas" | "dias")}
            />
          </Stack>
        </Field>
      </Modal>

      <Toast
        open={toast.open}
        variant={toast.variant}
        title={toast.title}
        description={toast.description}
        onClose={() => setToast((atual) => ({ ...atual, open: false }))}
      />
    </PageContainer>
  );
}
