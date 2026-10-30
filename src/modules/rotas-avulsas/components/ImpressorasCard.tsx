"use client";

import { useEffect, useState } from "react";
import { Activity, Pencil, Plus, Printer, ShieldCheck, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import {
  atualizarImpressora,
  criarImpressora,
  excluirImpressora,
  imprimirPaginaTeste,
  lerCertificadoImpressora,
  listarImpressoras,
  testarImpressora,
} from "../services/rotasAvulsas.service";
import type { CertificadoImpressora, DadosImpressora, Impressora, SituacaoImpressora } from "../types/rotasAvulsas.types";
import styles from "./RotasAvulsas.module.css";

const VAZIA: DadosImpressora = {
  codigo: "",
  nome: "",
  endereco: "",
  porta: 631,
  caminhoIpp: "/ipp/print",
  usarTls: true,
  certificadoSha256: null,
  frenteVersoPadrao: false,
  ativo: true,
};

const ESTADOS: Record<SituacaoImpressora["estado"], string> = {
  ociosa: "Ociosa (pronta)",
  imprimindo: "Imprimindo",
  parada: "Parada",
  desconhecido: "Desconhecido",
};

function dadosDe(impressora: Impressora): DadosImpressora {
  return {
    codigo: impressora.codigo,
    nome: impressora.nome,
    endereco: impressora.endereco,
    porta: impressora.porta,
    caminhoIpp: impressora.caminhoIpp,
    usarTls: impressora.usarTls,
    certificadoSha256: impressora.certificadoSha256,
    frenteVersoPadrao: impressora.frenteVersoPadrao,
    ativo: impressora.ativo,
  };
}

function uri(impressora: Pick<Impressora, "usarTls" | "endereco" | "porta" | "caminhoIpp">): string {
  return `${impressora.usarTls ? "ipps" : "ipp"}://${impressora.endereco}:${impressora.porta}${impressora.caminhoIpp}`;
}

/*
 * Impressoras que a rota de impressão pode usar. O sistema que chama
 * escolhe pelo código; o endereço e a forma de conexão ficam só aqui.
 * Testar não imprime (lê o estado e valida um trabalho); página de teste
 * imprime de verdade, por isso passa por confirmação.
 */
export function ImpressorasCard({ onFeedback }: { onFeedback: FeedbackHandler }) {
  const [impressoras, setImpressoras] = useState<Impressora[] | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; dados: DadosImpressora } | null>(null);
  const [certificadoLido, setCertificadoLido] = useState<CertificadoImpressora | null>(null);
  const [lendoCertificado, setLendoCertificado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<Impressora | null>(null);
  const [paginaTeste, setPaginaTeste] = useState<Impressora | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [teste, setTeste] = useState<{ impressora: Impressora; situacao: SituacaoImpressora } | null>(null);

  async function recarregar() {
    const resposta = await listarImpressoras();
    setImpressoras(resposta.data ?? []);
  }

  useEffect(() => {
    let vivo = true;
    listarImpressoras().then((resposta) => {
      if (vivo) setImpressoras(resposta.data ?? []);
    });
    return () => {
      vivo = false;
    };
  }, []);

  function abrir(impressora: Impressora | null) {
    setCertificadoLido(null);
    setEditando({ id: impressora?.id ?? null, dados: impressora ? dadosDe(impressora) : VAZIA });
  }

  function mudar<K extends keyof DadosImpressora>(campo: K, valor: DadosImpressora[K]) {
    setEditando((atual) => (atual ? { ...atual, dados: { ...atual.dados, [campo]: valor } } : atual));
  }

  async function lerCertificado() {
    if (!editando) return;
    setLendoCertificado(true);
    try {
      const resposta = await lerCertificadoImpressora(editando.dados.endereco.trim(), editando.dados.porta);
      if (resposta.ok && resposta.data) {
        setCertificadoLido(resposta.data);
        mudar("certificadoSha256", resposta.data.sha256);
      } else {
        onFeedback("danger", "Não foi possível ler o certificado", resposta.message ?? "Confira o endereço e a porta.");
      }
    } finally {
      setLendoCertificado(false);
    }
  }

  async function salvar() {
    if (!editando) return;
    setSalvando(true);
    try {
      const dados = { ...editando.dados, codigo: editando.dados.codigo.trim().toUpperCase(), endereco: editando.dados.endereco.trim() };
      const resposta = editando.id ? await atualizarImpressora(editando.id, dados) : await criarImpressora(dados);
      if (resposta.ok) {
        onFeedback("success", "Impressora salva", `${dados.codigo} pronta para a rota de impressão.`);
        setEditando(null);
        await recarregar();
      } else {
        onFeedback("danger", "Não foi possível salvar", resposta.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtiva(impressora: Impressora, ativo: boolean) {
    setImpressoras((atual) => atual?.map((i) => (i.id === impressora.id ? { ...i, ativo } : i)) ?? atual);
    const resposta = await atualizarImpressora(impressora.id, { ...dadosDe(impressora), ativo });
    if (!resposta.ok) {
      onFeedback("danger", "Não foi possível alterar", resposta.message ?? "Tente novamente.");
      await recarregar();
    }
  }

  async function testar(impressora: Impressora) {
    setOcupado(impressora.id);
    try {
      const resposta = await testarImpressora(impressora.id);
      if (resposta.ok && resposta.data) setTeste({ impressora, situacao: resposta.data });
      else onFeedback("danger", `Falha ao testar ${impressora.codigo}`, resposta.message ?? "A impressora não respondeu.");
    } finally {
      setOcupado(null);
    }
  }

  async function confirmarPaginaTeste() {
    if (!paginaTeste) return;
    const alvo = paginaTeste;
    setOcupado(alvo.id);
    try {
      const resposta = await imprimirPaginaTeste(alvo.id);
      if (resposta.ok) onFeedback("success", "Página de teste enviada", resposta.message ?? "");
      else onFeedback("danger", "A página de teste não saiu", resposta.message ?? "Tente novamente.");
    } finally {
      setOcupado(null);
      setPaginaTeste(null);
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    const alvo = excluindo;
    setOcupado(alvo.id);
    try {
      const resposta = await excluirImpressora(alvo.id);
      if (resposta.ok) {
        onFeedback("success", "Impressora excluída", `${alvo.codigo} não recebe mais impressões.`);
        await recarregar();
      } else {
        onFeedback("danger", "Não foi possível excluir", resposta.message ?? "Tente novamente.");
      }
    } finally {
      setOcupado(null);
      setExcluindo(null);
    }
  }

  return (
    <Card
      title="Impressoras"
      description="Para onde a rota pode mandar os PDFs. O outro sistema escolhe a impressora pelo código."
      actions={
        <Button onClick={() => abrir(null)}>
          <Plus size={16} /> Nova impressora
        </Button>
      }
    >
      {!impressoras ? (
        <Loader label="Carregando impressoras..." />
      ) : impressoras.length === 0 ? (
        <EmptyState
          title="Nenhuma impressora cadastrada"
          description="Cadastre ao menos uma para a rota conseguir imprimir."
          icon={<Printer />}
        />
      ) : (
        <div className={styles.tabela}>
          <Table minWidth={760}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Código</TableHeaderCell>
                <TableHeaderCell>Nome</TableHeaderCell>
                <TableHeaderCell>Endereço</TableHeaderCell>
                <TableHeaderCell>Frente e verso</TableHeaderCell>
                <TableHeaderCell align="center">Ativa</TableHeaderCell>
                <TableHeaderCell align="right">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {impressoras.map((impressora) => (
                <TableRow key={impressora.id}>
                  <TableCell className={styles.semQuebra}>
                    <strong>{impressora.codigo}</strong>
                  </TableCell>
                  <TableCell>{impressora.nome}</TableCell>
                  <TableCell>
                    <span className={`${styles.mono} ${styles.semQuebra}`}>{uri(impressora)}</span>
                    {impressora.usarTls && (
                      <div className={styles.suave}>
                        <ShieldCheck size={12} /> Criptografado, certificado fixado
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{impressora.frenteVersoPadrao ? "Sim, por padrão" : "Não, por padrão"}</TableCell>
                  <TableCell align="center">
                    <Switch
                      compact
                      label=""
                      aria-label={`Impressora ${impressora.codigo} ativa`}
                      checked={impressora.ativo}
                      onChange={(e) => alternarAtiva(impressora, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <div className={styles.acoes}>
                      <IconButton
                        icon={<Activity size={16} />}
                        label="Testar conexão (não imprime)"
                        loading={ocupado === impressora.id}
                        onClick={() => testar(impressora)}
                      />
                      <IconButton
                        icon={<Printer size={16} />}
                        label="Imprimir página de teste"
                        onClick={() => setPaginaTeste(impressora)}
                        disabled={ocupado !== null}
                      />
                      <IconButton icon={<Pencil size={16} />} label="Editar" onClick={() => abrir(impressora)} />
                      <IconButton
                        icon={<Trash2 size={16} />}
                        label="Excluir"
                        variant="danger"
                        onClick={() => setExcluindo(impressora)}
                        disabled={ocupado !== null}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Modal
        open={editando !== null}
        title={editando?.id ? "Editar impressora" : "Nova impressora"}
        description="Conexão direta pela rede (IPP), sem passar pelo Windows."
        size="large"
        onClose={() => !salvando && setEditando(null)}
        footer={
          <Stack direction="row" justify="end" gap={8}>
            <Button variant="secondary" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={salvando}>
              Salvar impressora
            </Button>
          </Stack>
        }
      >
        {editando && (
          <Stack gap={16}>
            <FormGrid columns={2}>
              <Field label="Código" htmlFor="impCodigo" hint="O que o outro sistema manda no campo impressora. Ex: EXPEDICAO" required>
                <Input
                  id="impCodigo"
                  value={editando.dados.codigo}
                  maxLength={40}
                  onChange={(e) => mudar("codigo", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                />
              </Field>
              <Field label="Nome" htmlFor="impNome" hint="Ex: HP LaserJet MFP E42540 - Expedição" required>
                <Input id="impNome" value={editando.dados.nome} maxLength={120} onChange={(e) => mudar("nome", e.target.value)} />
              </Field>
              <Field label="Endereço" htmlFor="impEndereco" hint="IP ou nome, sem http://. Ex: 192.168.1.158" required>
                <Input
                  id="impEndereco"
                  value={editando.dados.endereco}
                  maxLength={255}
                  onChange={(e) => {
                    mudar("endereco", e.target.value);
                    mudar("certificadoSha256", null);
                    setCertificadoLido(null);
                  }}
                />
              </Field>
              <FormGrid columns={2}>
                <Field label="Porta" htmlFor="impPorta" hint="IPP: 631.">
                  <Input
                    id="impPorta"
                    inputMode="numeric"
                    value={String(editando.dados.porta)}
                    onChange={(e) => mudar("porta", Number(e.target.value.replace(/\D/g, "").slice(0, 5)) || 0)}
                  />
                </Field>
                <Field label="Caminho IPP" htmlFor="impCaminho" hint="HP: /ipp/print">
                  <Input id="impCaminho" value={editando.dados.caminhoIpp} onChange={(e) => mudar("caminhoIpp", e.target.value)} />
                </Field>
              </FormGrid>
            </FormGrid>

            <Switch
              id="impTls"
              label="Conexão criptografada (TLS)"
              hint="Recomendado. O Portal só envia se o certificado da impressora for o mesmo fixado abaixo."
              checked={editando.dados.usarTls}
              onChange={(e) => mudar("usarTls", e.target.checked)}
            />

            {editando.dados.usarTls && (
              <Stack gap={8}>
                <Field
                  label="Certificado fixado (SHA-256)"
                  htmlFor="impCert"
                  hint="Leia direto da impressora e confira. Se a impressora trocar de certificado, leia de novo."
                >
                  <div className={styles.certificado}>
                    <Input id="impCert" value={editando.dados.certificadoSha256 ?? ""} readOnly placeholder="Ainda não lido" />
                    <Button
                      variant="secondary"
                      onClick={lerCertificado}
                      loading={lendoCertificado}
                      disabled={!editando.dados.endereco.trim()}
                    >
                      Ler certificado
                    </Button>
                  </div>
                </Field>
                {certificadoLido && (
                  <Alert variant="info">
                    Certificado de <strong>{certificadoLido.assunto ?? "nome não informado"}</strong>
                    {certificadoLido.validoAte && `, válido até ${new Date(certificadoLido.validoAte).toLocaleDateString("pt-BR")}`}.
                    Salve para fixar.
                  </Alert>
                )}
              </Stack>
            )}

            {!editando.dados.usarTls && (
              <Alert variant="warning">
                Sem TLS, o PDF trafega aberto na rede entre o Portal e a impressora.
              </Alert>
            )}

            <FormGrid columns={2}>
              <Switch
                id="impFrenteVerso"
                label="Frente e verso por padrão"
                hint="Usado quando o sistema não manda o campo frente_verso."
                checked={editando.dados.frenteVersoPadrao}
                onChange={(e) => mudar("frenteVersoPadrao", e.target.checked)}
              />
              <Switch
                id="impAtiva"
                label="Ativa"
                hint="Desativada, a rota recusa impressões para ela."
                checked={editando.dados.ativo}
                onChange={(e) => mudar("ativo", e.target.checked)}
              />
            </FormGrid>
          </Stack>
        )}
      </Modal>

      <Modal
        open={teste !== null}
        title={`Teste de ${teste?.impressora.codigo ?? ""}`}
        description="Nada foi impresso: o Portal leu o estado da impressora e validou um trabalho."
        onClose={() => setTeste(null)}
        footer={
          <Stack direction="row" justify="end">
            <Button variant="secondary" onClick={() => setTeste(null)}>
              Fechar
            </Button>
          </Stack>
        }
      >
        {teste && (
          <Stack gap={16}>
            <Alert variant={teste.situacao.validacao.ok ? "success" : "danger"}>{teste.situacao.validacao.detalhe}</Alert>
            <dl className={styles.listaDefinicao}>
              <dt>Modelo</dt>
              <dd>{teste.situacao.modelo ?? "—"}</dd>
              <dt>Estado</dt>
              <dd>{ESTADOS[teste.situacao.estado]}</dd>
              <dt>Aceitando trabalhos</dt>
              <dd>{teste.situacao.aceitandoTrabalhos === null ? "—" : teste.situacao.aceitandoTrabalhos ? "Sim" : "Não"}</dd>
              <dt>Aceita PDF</dt>
              <dd>
                <Badge variant={teste.situacao.aceitaPdf ? "success" : "danger"}>{teste.situacao.aceitaPdf ? "Sim" : "Não"}</Badge>
              </dd>
              <dt>Frente e verso</dt>
              <dd>{teste.situacao.frenteVersoSuportado ? "Suportado" : "Não suportado"}</dd>
              <dt>Avisos</dt>
              <dd>{teste.situacao.motivos.length ? teste.situacao.motivos.join(", ") : "Nenhum"}</dd>
              {teste.situacao.mensagem && (
                <>
                  <dt>Mensagem</dt>
                  <dd>{teste.situacao.mensagem}</dd>
                </>
              )}
            </dl>
          </Stack>
        )}
      </Modal>

      <ConfirmDialog
        open={paginaTeste !== null}
        title="Imprimir página de teste?"
        message={`Uma página A4 vai sair de verdade na impressora ${paginaTeste?.codigo ?? ""} (${paginaTeste?.endereco ?? ""}). O envio fica registrado no log da rota.`}
        confirmLabel="Imprimir"
        loading={ocupado !== null}
        onConfirm={confirmarPaginaTeste}
        onClose={() => setPaginaTeste(null)}
      />

      <ConfirmDialog
        open={excluindo !== null}
        title="Excluir impressora?"
        message={`${excluindo?.codigo ?? ""} deixa de receber impressões na hora. Tokens que só podiam usar ela ficam sem impressora. O histórico do log continua.`}
        confirmLabel="Excluir"
        variant="danger"
        loading={ocupado !== null}
        onConfirm={confirmarExclusao}
        onClose={() => setExcluindo(null)}
      />
    </Card>
  );
}
