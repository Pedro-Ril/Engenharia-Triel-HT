"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  CheckCircle2,
  Home,
  LifeBuoy,
  Lock,
  Paperclip,
  RotateCcw,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateInput } from "@/components/ui/DateInput";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { FormGrid } from "@/components/ui/FormGrid";
import { Modal } from "@/components/ui/Modal";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";

import {
  aceitarChamado,
  adicionarUsuarioCopiaChamado,
  atualizarChamado,
  confirmarResolucaoChamado,
  enviarMensagemChamado,
  excluirChamado,
  fecharChamado,
  listarAtendentesDoSetor,
  marcarChamadoComoResolvido,
  reabrirChamado,
  removerUsuarioCopiaChamado,
  transferirChamado,
} from "../services/chamados.service";
import type {
  Chamado,
  ChamadosAtendente,
  PrioridadeChamado,
  SetorChamado,
  UsuarioCopiaChamado,
} from "../types/chamados.types";
import { PrioridadeBadge, PRIORIDADE_LABELS, StatusBadge } from "./ChamadoBadges";
import styles from "./Chamados.module.css";
import { UsuarioAutocomplete } from "./UsuarioAutocomplete";

interface ChamadoDetalhePageProps {
  chamado: Chamado;
  nomeConfirmado: string | null;
  atendentesDoSetor: ChamadosAtendente[];
  setoresParaTransferir: SetorChamado[];
  /* false quando o acesso só foi liberado por o chamado ser público (visitante sem sessão/dono/atendente) — esconde ações e resposta. */
  podeResponder: boolean;
  ehAdministrador: boolean;
  copiaAtual: UsuarioCopiaChamado[];
  temNotificacaoFalha: boolean;
}

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function anexoHref(anexoId: string, nomeConfirmado: string | null): string {
  return nomeConfirmado
    ? `/api/chamados/anexos/${anexoId}?nome=${encodeURIComponent(nomeConfirmado)}`
    : `/api/chamados/anexos/${anexoId}`;
}

const OPCOES_PRIORIDADE = (Object.keys(PRIORIDADE_LABELS) as PrioridadeChamado[]).map(
  (prioridade) => ({ value: prioridade, label: PRIORIDADE_LABELS[prioridade].label })
);

export function ChamadoDetalhePage({
  chamado,
  nomeConfirmado,
  atendentesDoSetor,
  setoresParaTransferir,
  podeResponder,
  ehAdministrador,
  copiaAtual,
  temNotificacaoFalha,
}: ChamadoDetalhePageProps) {
  const router = useRouter();

  const [texto, setTexto] = useState("");
  const [anexos, setAnexos] = useState<File[]>([]);
  const [interno, setInterno] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoControle, setSalvandoControle] = useState(false);
  const [executandoAcao, setExecutandoAcao] = useState<string | null>(null);
  const [copia, setCopia] = useState(copiaAtual);
  const [salvandoCopia, setSalvandoCopia] = useState(false);
  const [erroCopia, setErroCopia] = useState<string | null>(null);
  const [confirmandoReabrir, setConfirmandoReabrir] = useState(false);
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const [transferenciaAberta, setTransferenciaAberta] = useState(false);
  const [novoSetorId, setNovoSetorId] = useState("");
  const [novoAtendenteId, setNovoAtendenteId] = useState("");
  const [atendentesParaTransferir, setAtendentesParaTransferir] =
    useState<ChamadosAtendente[]>(atendentesDoSetor);
  const [carregandoAtendentesTransferir, setCarregandoAtendentesTransferir] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [erroTransferencia, setErroTransferencia] = useState<string | null>(null);

  function abrirTransferencia() {
    setNovoSetorId(chamado.setorId);
    setNovoAtendenteId(chamado.atendenteUsuarioId ?? "");
    setAtendentesParaTransferir(atendentesDoSetor);
    setErroTransferencia(null);
    setTransferenciaAberta(true);
  }

  async function handleTrocarSetorTransferencia(setorId: string) {
    setNovoSetorId(setorId);
    setNovoAtendenteId("");

    if (setorId === chamado.setorId) {
      setAtendentesParaTransferir(atendentesDoSetor);
      return;
    }

    setCarregandoAtendentesTransferir(true);

    try {
      const atendentes = await listarAtendentesDoSetor(setorId);
      setAtendentesParaTransferir(atendentes);
    } finally {
      setCarregandoAtendentesTransferir(false);
    }
  }

  async function handleConfirmarTransferencia() {
    setErroTransferencia(null);
    setTransferindo(true);

    try {
      const resultado = await transferirChamado(chamado.numero, {
        setorId: novoSetorId,
        atendenteUsuarioId: novoAtendenteId || null,
      });

      if (resultado.ok) {
        setTransferenciaAberta(false);
        router.refresh();
      } else {
        setErroTransferencia(resultado.message ?? "Não foi possível transferir o chamado.");
      }
    } finally {
      setTransferindo(false);
    }
  }

  async function handleEnviarMensagem() {
    if (!texto.trim()) {
      setErro("Escreva uma mensagem.");
      return;
    }

    setErro(null);
    setEnviando(true);

    try {
      const formData = new FormData();
      formData.append("texto", texto);
      if (interno) formData.append("interno", "true");
      if (nomeConfirmado) formData.append("nome", nomeConfirmado);
      for (const arquivo of anexos) formData.append("anexos", arquivo);

      const resultado = await enviarMensagemChamado(chamado.numero, formData);

      if (resultado.ok) {
        setTexto("");
        setAnexos([]);
        setInterno(false);
        router.refresh();
      } else {
        setErro(resultado.message ?? "Não foi possível enviar a mensagem.");
      }
    } finally {
      setEnviando(false);
    }
  }

  async function handleAtualizar(
    campo: "prioridade" | "atendenteUsuarioId" | "publico" | "dataPrevistaConclusao",
    valor: string | boolean
  ) {
    setErro(null);
    setSalvandoControle(true);

    try {
      const dados =
        campo === "prioridade"
          ? { prioridade: valor as PrioridadeChamado }
          : campo === "atendenteUsuarioId"
            ? { atendenteUsuarioId: (valor as string) || null }
            : campo === "dataPrevistaConclusao"
              ? { dataPrevistaConclusao: (valor as string) || null }
              : { publico: valor as boolean };

      const resultado = await atualizarChamado(chamado.numero, dados);

      if (resultado.ok) {
        router.refresh();
      } else {
        setErro(resultado.message ?? "Não foi possível salvar a alteração.");
      }
    } catch {
      setErro("Não foi possível salvar a alteração. Tente novamente.");
    } finally {
      setSalvandoControle(false);
    }
  }

  async function handleAdicionarCopia(usuario: { id: string; nomeExibicao: string; email: string | null }) {
    setErroCopia(null);
    setSalvandoCopia(true);

    try {
      const resultado = await adicionarUsuarioCopiaChamado(chamado.numero, usuario.id);

      if (resultado.ok && resultado.data) {
        setCopia(resultado.data);
      } else {
        setErroCopia(resultado.message ?? "Não foi possível adicionar este usuário em cópia.");
      }
    } finally {
      setSalvandoCopia(false);
    }
  }

  async function handleRemoverCopia(usuarioId: string) {
    setErroCopia(null);
    setSalvandoCopia(true);

    try {
      const resultado = await removerUsuarioCopiaChamado(chamado.numero, usuarioId);

      if (resultado.ok) {
        setCopia((atual) => atual.filter((item) => item.usuarioId !== usuarioId));
      } else {
        setErroCopia(resultado.message ?? "Não foi possível remover este usuário da cópia.");
      }
    } finally {
      setSalvandoCopia(false);
    }
  }

  async function executarAcao(
    chave: string,
    acao: (numero: number, nome?: string | null) => ReturnType<typeof aceitarChamado>
  ) {
    setErro(null);
    setExecutandoAcao(chave);

    try {
      const resultado = await acao(chamado.numero, nomeConfirmado);

      if (resultado.ok) {
        router.refresh();
      } else {
        setErro(resultado.message ?? "Não foi possível concluir a ação.");
      }
    } finally {
      setExecutandoAcao(null);
    }
  }

  async function handleExcluir() {
    setErro(null);
    setExcluindo(true);

    try {
      const resultado = await excluirChamado(chamado.numero);

      if (resultado.ok) {
        router.push("/chamados");
      } else {
        setErro(resultado.message ?? "Não foi possível excluir o chamado.");
        setConfirmandoExcluir(false);
      }
    } finally {
      setExcluindo(false);
    }
  }

  const podeAceitar =
    chamado.ehAtendente &&
    !chamado.atendenteUsuarioId &&
    (chamado.status === "aberto" || chamado.status === "em_andamento");

  const podeMarcarResolvido =
    chamado.ehAtendente && (chamado.status === "aberto" || chamado.status === "em_andamento");

  const aguardandoConfirmacao = chamado.status === "aguardando_confirmacao";

  const podeFechar = chamado.ehAtendente && chamado.status === "resolvido";

  const podeReabrir = ["aguardando_confirmacao", "resolvido", "fechado"].includes(chamado.status);

  const podeTransferir = chamado.ehAtendente && chamado.status !== "fechado";

  const transferenciaSemAlteracao =
    novoSetorId === chamado.setorId &&
    (novoAtendenteId || null) === chamado.atendenteUsuarioId;

  /*
   * Atendente não pode responder antes de aceitar o chamado (ver
   * POST .../mensagens) — mas isso não vale para quem é dono do
   * próprio chamado (ex: admin que abriu um chamado para si
   * mesmo): a pessoa sempre pode responder ao que ela mesma abriu,
   * mesmo sendo também atendente do setor.
   */
  const precisaAceitarAntes =
    chamado.ehAtendente && !chamado.ehDono && !chamado.atendenteUsuarioId;

  return (
    <PageContainer>
      <PageHeader
        title={chamado.titulo}
        description={`Nº ${chamado.numero} · ${chamado.setorNome}${
          chamado.categoriaNome ? ` · ${chamado.categoriaNome}` : ""
        }${
          chamado.empresa ? ` · ${chamado.empresa}` : ""
        } · aberto por ${chamado.solicitanteNome}${
          chamado.criadoPorNome ? ` (registrado por ${chamado.criadoPorNome})` : ""
        } em ${formatarData(chamado.criadoEm)}`}
        actions={
          <Stack direction="row" gap={8}>
            <StatusBadge status={chamado.status} />
            <PrioridadeBadge prioridade={chamado.prioridade} />
          </Stack>
        }
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Chamados", href: "/chamados", icon: <LifeBuoy size={14} /> },
          { label: `Nº ${chamado.numero}`, current: true },
        ]}
      />

      {erro && <Alert variant="danger">{erro}</Alert>}

      {temNotificacaoFalha && (
        <Alert variant="warning" title="Falha ao notificar por e-mail">
          Uma ou mais notificações deste chamado não foram enviadas. Veja os detalhes em
          Administração → Chamados → Notificações de e-mail.
        </Alert>
      )}

      {aguardandoConfirmacao && (
        <Alert variant="warning" title="Aguardando confirmação">
          O atendente marcou este chamado como resolvido. Se o problema realmente foi
          resolvido, confirme abaixo — caso contrário, reabra o chamado.
        </Alert>
      )}

      {(ehAdministrador ||
        (podeResponder &&
          (podeAceitar ||
            podeMarcarResolvido ||
            aguardandoConfirmacao ||
            podeFechar ||
            podeReabrir ||
            podeTransferir))) && (
        <Card title="Ações">
          <Stack direction="row" gap={10} wrap>
            {podeAceitar && (
              <Button
                onClick={() => executarAcao("aceitar", aceitarChamado)}
                loading={executandoAcao === "aceitar"}
              >
                <UserCheck size={16} />
                Aceitar chamado
              </Button>
            )}

            {podeMarcarResolvido && (
              <Button
                variant="secondary"
                onClick={() => executarAcao("marcar-resolvido", marcarChamadoComoResolvido)}
                loading={executandoAcao === "marcar-resolvido"}
              >
                <CheckCircle2 size={16} />
                Marcar como resolvido
              </Button>
            )}

            {aguardandoConfirmacao && (
              <Button
                onClick={() => executarAcao("confirmar-resolucao", confirmarResolucaoChamado)}
                loading={executandoAcao === "confirmar-resolucao"}
              >
                <CheckCircle2 size={16} />
                Confirmar resolução
              </Button>
            )}

            {podeReabrir && (
              <Button
                variant="secondary"
                onClick={() => setConfirmandoReabrir(true)}
                loading={executandoAcao === "reabrir"}
              >
                <RotateCcw size={16} />
                Reabrir chamado
              </Button>
            )}

            {podeFechar && (
              <Button
                variant="secondary"
                onClick={() => executarAcao("fechar", fecharChamado)}
                loading={executandoAcao === "fechar"}
              >
                Fechar chamado
              </Button>
            )}

            {podeTransferir && (
              <Button variant="secondary" onClick={abrirTransferencia}>
                <ArrowRightLeft size={16} />
                Transferir chamado
              </Button>
            )}

            {ehAdministrador && (
              <Button variant="danger" onClick={() => setConfirmandoExcluir(true)}>
                <Trash2 size={16} />
                Excluir chamado
              </Button>
            )}
          </Stack>
        </Card>
      )}

      {chamado.ehAtendente && (
        <Card title="Atribuição e prioridade">
          <Stack gap={16}>
            <FormGrid columns={2}>
              <Field label="Prioridade">
                <Dropdown
                  value={chamado.prioridade}
                  options={OPCOES_PRIORIDADE}
                  disabled={salvandoControle}
                  onValueChange={(valor) => handleAtualizar("prioridade", valor)}
                />
              </Field>

              <Field label="Atendente responsável">
                <Dropdown
                  value={chamado.atendenteUsuarioId ?? ""}
                  disabled={salvandoControle}
                  onValueChange={(valor) => handleAtualizar("atendenteUsuarioId", valor)}
                  options={[
                    { value: "", label: "Sem atendente definido" },
                    ...atendentesDoSetor.map((atendente) => ({
                      value: atendente.usuarioId,
                      label: atendente.usuarioNome,
                    })),
                  ]}
                />
              </Field>
            </FormGrid>

            <Field label="Previsão de conclusão">
              <DateInput
                value={chamado.dataPrevistaConclusao ?? ""}
                disabled={salvandoControle}
                onValueChange={(valor) => handleAtualizar("dataPrevistaConclusao", valor)}
              />
            </Field>

            <Checkbox
              label="Chamado público"
              hint='Aparece na busca por título/descrição de "Consultar chamado", mesmo para quem não abriu o chamado nem está logado.'
              checked={chamado.publico}
              disabled={salvandoControle}
              onChange={(event) => handleAtualizar("publico", event.target.checked)}
            />
          </Stack>
        </Card>
      )}

      {(chamado.ehAtendente || chamado.ehDono) && (
        <Card
          title="Pessoas em cópia"
          description="Recebem as respostas deste chamado por e-mail e podem acompanhar a conversa."
        >
          <Stack gap={16}>
            {copia.length > 0 && (
              <div className={styles.copiaLista}>
                {copia.map((pessoa) => (
                  <span key={pessoa.usuarioId} className={styles.copiaChip} title={pessoa.email ?? undefined}>
                    {pessoa.nome}
                    <button
                      type="button"
                      className={styles.copiaChipRemover}
                      aria-label={`Remover ${pessoa.nome} da cópia`}
                      disabled={salvandoCopia}
                      onClick={() => handleRemoverCopia(pessoa.usuarioId)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <UsuarioAutocomplete
              placeholder="Adicionar pessoa em cópia"
              disabled={salvandoCopia}
              onSelecionar={(usuario) => handleAdicionarCopia(usuario)}
            />

            {erroCopia && <Alert variant="danger">{erroCopia}</Alert>}
          </Stack>
        </Card>
      )}

      <Card title="Conversa">
        <Stack gap={20}>
          <div className={styles.mensagensLista}>
            {chamado.mensagens.map((mensagem) =>
              mensagem.autorTipo === "sistema" ? (
                <p key={mensagem.id} className={styles.mensagemSistema}>
                  {mensagem.texto} · {formatarData(mensagem.criadoEm)}
                </p>
              ) : (
                <div
                  key={mensagem.id}
                  className={[
                    styles.mensagem,
                    mensagem.autorTipo === "atendente" ? styles.mensagemAtendente : "",
                    mensagem.interno ? styles.mensagemInterna : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className={styles.mensagemTopo}>
                    <span className={styles.mensagemAutor}>
                      {mensagem.autorNome}
                      {mensagem.interno && (
                        <>
                          {" "}
                          <Lock
                            size={12}
                            style={{ display: "inline", verticalAlign: "middle" }}
                          />{" "}
                          <small>nota interna</small>
                        </>
                      )}
                    </span>

                    <span className={styles.mensagemData}>{formatarData(mensagem.criadoEm)}</span>
                  </div>

                  <p className={styles.mensagemTexto}>{mensagem.texto}</p>

                  {mensagem.anexos.length > 0 && (
                    <div className={styles.mensagemAnexos}>
                      {mensagem.anexos.map((anexo) => (
                        <a
                          key={anexo.id}
                          className={styles.anexoChip}
                          href={anexoHref(anexo.id, nomeConfirmado)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Paperclip size={13} />
                          {anexo.nomeArquivo}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          {!podeResponder ? (
            <Alert variant="info">
              Este chamado é público e está disponível apenas para consulta.
            </Alert>
          ) : precisaAceitarAntes ? (
            <Alert variant="warning">
              Aceite o chamado (no botão acima) antes de responder.
            </Alert>
          ) : (
            <>
              <Field label="Responder" hint={`${texto.length}/4000 caracteres`}>
                <Textarea
                  rows={4}
                  maxLength={4000}
                  value={texto}
                  onChange={(event) => setTexto(event.target.value)}
                />
              </Field>

              <Field label="Anexos" hint="até 10 MB por arquivo">
                <FileUpload multiple maxSizeMB={10} files={anexos} onFilesChange={setAnexos} />
              </Field>

              {chamado.ehAtendente && (
                <Checkbox
                  label="Nota interna"
                  hint="visível só para atendentes/administradores, não para quem abriu o chamado"
                  checked={interno}
                  onChange={(event) => setInterno(event.target.checked)}
                />
              )}

              {erro && <Alert variant="danger">{erro}</Alert>}

              <Stack direction="row" justify="end">
                <Button onClick={handleEnviarMensagem} loading={enviando}>
                  Enviar
                </Button>
              </Stack>
            </>
          )}
        </Stack>
      </Card>

      <ConfirmDialog
        open={confirmandoReabrir}
        title="Reabrir chamado?"
        variant="warning"
        message="O chamado volta para 'em andamento' e o atendente será notificado para continuar o atendimento. Use isso se o problema não foi realmente resolvido."
        confirmLabel="Reabrir"
        loading={executandoAcao === "reabrir"}
        onConfirm={async () => {
          await executarAcao("reabrir", reabrirChamado);
          setConfirmandoReabrir(false);
        }}
        onClose={() => setConfirmandoReabrir(false)}
      />

      <ConfirmDialog
        open={confirmandoExcluir}
        title="Excluir chamado?"
        variant="danger"
        message="Esta ação é permanente e não pode ser desfeita. Todas as mensagens e anexos deste chamado serão excluídos junto. Um registro desta exclusão ficará nos logs de monitoramento."
        confirmLabel="Excluir"
        loading={excluindo}
        onConfirm={handleExcluir}
        onClose={() => setConfirmandoExcluir(false)}
      />

      <Modal
        open={transferenciaAberta}
        title="Transferir chamado"
        size="small"
        onClose={() => setTransferenciaAberta(false)}
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={() => setTransferenciaAberta(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarTransferencia}
              loading={transferindo}
              disabled={!novoSetorId || transferenciaSemAlteracao}
            >
              Transferir
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          <Field label="Setor">
            <Dropdown
              value={novoSetorId}
              onValueChange={handleTrocarSetorTransferencia}
              options={setoresParaTransferir.map((setor) => ({
                value: setor.id,
                label: setor.nome,
              }))}
            />
          </Field>

          <Field
            label="Novo atendente"
            hint={
              novoSetorId !== chamado.setorId
                ? "categoria será limpa — categorias pertencem a um setor específico"
                : undefined
            }
          >
            {carregandoAtendentesTransferir ? (
              <Alert variant="info">Carregando atendentes...</Alert>
            ) : (
              <Dropdown
                value={novoAtendenteId}
                onValueChange={setNovoAtendenteId}
                options={[
                  { value: "", label: "Sem atendente definido" },
                  ...atendentesParaTransferir.map((atendente) => ({
                    value: atendente.usuarioId,
                    label: atendente.usuarioNome,
                  })),
                ]}
              />
            )}
          </Field>

          {transferenciaSemAlteracao && (
            <Alert variant="warning">
              Selecione um setor ou atendente diferente do atual para transferir.
            </Alert>
          )}

          {erroTransferencia && <Alert variant="danger">{erroTransferencia}</Alert>}
        </Stack>
      </Modal>
    </PageContainer>
  );
}
