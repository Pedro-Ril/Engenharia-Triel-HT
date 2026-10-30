"use client";

import { useEffect, useState } from "react";
import { Ban, Copy, KeyRound, Pencil, Plus } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateInput } from "@/components/ui/DateInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import { copiarParaAreaDeTransferencia } from "@/lib/utils/copiar-para-area-transferencia";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { atualizarToken, criarToken, listarImpressoras, listarTokens, revogarToken } from "../services/rotasAvulsas.service";
import type { Impressora, SituacaoToken, TokenRotaAvulsa } from "../types/rotasAvulsas.types";
import styles from "./RotasAvulsas.module.css";

interface TokensRotaAvulsaProps {
  chave: string;
  onFeedback: FeedbackHandler;
}

interface Formulario {
  id: string | null;
  nome: string;
  expiraEm: string;
  impressoras: string[];
}

const SITUACAO: Record<SituacaoToken, { label: string; variant: "success" | "warning" | "neutral" }> = {
  ativo: { label: "Ativo", variant: "success" },
  expirado: { label: "Expirado", variant: "warning" },
  revogado: { label: "Revogado", variant: "neutral" },
};

function formatarData(valorIso: string | null): string {
  return valorIso ? new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function paraDataLocal(valorIso: string | null): string {
  if (!valorIso) return "";
  const d = new Date(valorIso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function amanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return paraDataLocal(d.toISOString());
}

/*
 * Tokens de uma rota avulsa: um por sistema que chama. O valor aparece
 * uma única vez, logo após criar — o Portal guarda só o hash. Revogar é
 * definitivo (para trocar um token, cria-se outro e revoga o antigo).
 */
export function TokensRotaAvulsa({ chave, onFeedback }: TokensRotaAvulsaProps) {
  const ehImpressao = chave === "impressao-pdf";
  const [tokens, setTokens] = useState<TokenRotaAvulsa[] | null>(null);
  const [impressoras, setImpressoras] = useState<Impressora[]>([]);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [revelado, setRevelado] = useState<{ nome: string; valor: string } | null>(null);
  const [revogando, setRevogando] = useState<TokenRotaAvulsa | null>(null);
  const [processandoRevogacao, setProcessandoRevogacao] = useState(false);

  async function recarregar() {
    const resposta = await listarTokens(chave);
    setTokens(resposta.data ?? []);
  }

  useEffect(() => {
    let vivo = true;
    Promise.all([listarTokens(chave), ehImpressao ? listarImpressoras() : Promise.resolve(null)]).then(
      ([respostaTokens, respostaImpressoras]) => {
        if (!vivo) return;
        setTokens(respostaTokens.data ?? []);
        setImpressoras(respostaImpressoras?.data ?? []);
      }
    );
    return () => {
      vivo = false;
    };
  }, [chave, ehImpressao]);

  function abrir(token: TokenRotaAvulsa | null) {
    setFormulario({
      id: token?.id ?? null,
      nome: token?.nome ?? "",
      expiraEm: paraDataLocal(token?.expiraEm ?? null),
      impressoras: token?.escopo.impressoras ?? [],
    });
  }

  function alternarImpressora(codigo: string, marcada: boolean) {
    setFormulario((atual) =>
      atual
        ? {
            ...atual,
            impressoras: marcada ? [...atual.impressoras, codigo] : atual.impressoras.filter((c) => c !== codigo),
          }
        : atual
    );
  }

  async function salvar() {
    if (!formulario) return;
    setSalvando(true);
    try {
      const dados = {
        nome: formulario.nome.trim(),
        expiraEm: formulario.expiraEm || null,
        escopo: ehImpressao && formulario.impressoras.length ? { impressoras: formulario.impressoras } : {},
      };
      if (formulario.id) {
        const resposta = await atualizarToken(chave, formulario.id, dados);
        if (!resposta.ok) {
          onFeedback("danger", "Não foi possível salvar", resposta.message ?? "Tente novamente.");
          return;
        }
        onFeedback("success", "Token atualizado", `${dados.nome} continua com o mesmo valor de token.`);
      } else {
        const resposta = await criarToken(chave, dados);
        if (!resposta.ok || !resposta.data) {
          onFeedback("danger", "Não foi possível criar", resposta.message ?? "Tente novamente.");
          return;
        }
        setRevelado({ nome: resposta.data.token.nome, valor: resposta.data.valor });
      }
      setFormulario(null);
      await recarregar();
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarRevogacao() {
    if (!revogando) return;
    setProcessandoRevogacao(true);
    try {
      const resposta = await revogarToken(chave, revogando.id);
      if (resposta.ok) onFeedback("success", "Token revogado", `${revogando.nome} não consegue mais usar a rota.`);
      else onFeedback("danger", "Não foi possível revogar", resposta.message ?? "Tente novamente.");
      setRevogando(null);
      await recarregar();
    } finally {
      setProcessandoRevogacao(false);
    }
  }

  async function copiar() {
    if (!revelado) return;
    if (await copiarParaAreaDeTransferencia(revelado.valor)) {
      onFeedback("success", "Token copiado", "Cole no sistema que vai chamar a rota.");
    } else {
      onFeedback("danger", "Não foi possível copiar", "Selecione o token e copie manualmente.");
    }
  }

  return (
    <Card
      title="Tokens"
      description="Um token por sistema que chama esta rota. Vai no cabeçalho Authorization: Bearer <token>."
      actions={
        <Button onClick={() => abrir(null)}>
          <Plus size={16} /> Novo token
        </Button>
      }
    >
      {!tokens ? (
        <Loader label="Carregando tokens..." />
      ) : tokens.length === 0 ? (
        <EmptyState
          title="Nenhum token criado"
          description="Sem token, nenhum sistema consegue usar a rota."
          icon={<KeyRound />}
        />
      ) : (
        <div className={styles.tabela}>
          <Table minWidth={860}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Sistema</TableHeaderCell>
                <TableHeaderCell>Token</TableHeaderCell>
                {ehImpressao && <TableHeaderCell>Impressoras</TableHeaderCell>}
                <TableHeaderCell>Validade</TableHeaderCell>
                <TableHeaderCell>Último uso</TableHeaderCell>
                <TableHeaderCell align="right">Usos</TableHeaderCell>
                <TableHeaderCell>Situação</TableHeaderCell>
                <TableHeaderCell align="right">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell>
                    <strong>{token.nome}</strong>
                    <div className={styles.suave}>
                      Criado em {formatarData(token.criadoEm)} por {token.criadoPor}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`${styles.mono} ${styles.semQuebra}`}>{token.prefixo}…</span>
                  </TableCell>
                  {ehImpressao && (
                    <TableCell>
                      {token.escopo.impressoras?.length ? (
                        <div className={styles.chips}>
                          {token.escopo.impressoras.map((codigo) => (
                            <Badge key={codigo} variant="info">
                              {codigo}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        "Todas"
                      )}
                    </TableCell>
                  )}
                  <TableCell>{token.expiraEm ? new Date(token.expiraEm).toLocaleDateString("pt-BR") : "Sem validade"}</TableCell>
                  <TableCell>
                    {formatarData(token.ultimoUsoEm)}
                    {token.ultimoIp && <div className={styles.suave}>IP {token.ultimoIp}</div>}
                  </TableCell>
                  <TableCell align="right">{token.totalUsos.toLocaleString("pt-BR")}</TableCell>
                  <TableCell>
                    <Badge variant={SITUACAO[token.situacao].variant}>{SITUACAO[token.situacao].label}</Badge>
                    {token.revogadoEm && (
                      <div className={styles.suave}>
                        {formatarData(token.revogadoEm)} por {token.revogadoPor}
                      </div>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {token.situacao !== "revogado" && (
                      <div className={styles.acoes}>
                        <IconButton icon={<Pencil size={16} />} label="Editar" onClick={() => abrir(token)} />
                        <IconButton
                          icon={<Ban size={16} />}
                          label="Revogar"
                          variant="danger"
                          onClick={() => setRevogando(token)}
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Modal
        open={formulario !== null}
        title={formulario?.id ? "Editar token" : "Novo token"}
        description={formulario?.id ? "O valor do token não muda." : "O token aparece uma única vez, logo depois de criar."}
        onClose={() => !salvando && setFormulario(null)}
        footer={
          <Stack direction="row" justify="end" gap={8}>
            <Button variant="secondary" onClick={() => setFormulario(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={salvando} disabled={!formulario?.nome.trim()}>
              {formulario?.id ? "Salvar" : "Criar token"}
            </Button>
          </Stack>
        }
      >
        {formulario && (
          <Stack gap={16}>
            <Field label="Sistema" htmlFor="tokenNome" hint="Quem vai usar este token. Aparece no log e na impressora." required>
              <Input
                id="tokenNome"
                value={formulario.nome}
                maxLength={120}
                onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              />
            </Field>
            <Field label="Validade" htmlFor="tokenValidade" hint="Vale até o fim do dia escolhido. Em branco: sem validade.">
              <DateInput
                id="tokenValidade"
                value={formulario.expiraEm}
                min={amanha()}
                onValueChange={(valor) => setFormulario({ ...formulario, expiraEm: valor })}
              />
            </Field>
            {ehImpressao && (
              <Field label="Impressoras liberadas" hint="Nenhuma marcada: pode usar todas as impressoras ativas.">
                {impressoras.length === 0 ? (
                  <span className={styles.suave}>Nenhuma impressora cadastrada ainda (aba Configurações).</span>
                ) : (
                  <div className={styles.grupoImpressoras}>
                    {impressoras.map((impressora) => (
                      <Checkbox
                        key={impressora.id}
                        id={`tokenImp-${impressora.codigo}`}
                        label={`${impressora.codigo} · ${impressora.nome}`}
                        checked={formulario.impressoras.includes(impressora.codigo)}
                        onChange={(e) => alternarImpressora(impressora.codigo, e.target.checked)}
                      />
                    ))}
                  </div>
                )}
              </Field>
            )}
          </Stack>
        )}
      </Modal>

      <Modal
        open={revelado !== null}
        title="Token criado"
        description={revelado ? `Para: ${revelado.nome}` : undefined}
        closeOnOverlay={false}
        onClose={() => setRevelado(null)}
        footer={
          <Stack direction="row" justify="end">
            <Button onClick={() => setRevelado(null)}>Já copiei, fechar</Button>
          </Stack>
        }
      >
        {revelado && (
          <Stack gap={16}>
            <Alert variant="warning" title="Copie agora">
              Este valor não aparece de novo: o Portal guarda só uma impressão digital dele. Se perder, crie outro token e revogue
              este.
            </Alert>
            <div className={styles.tokenRevelado}>
              <code>{revelado.valor}</code>
              <IconButton icon={<Copy size={16} />} label="Copiar token" onClick={copiar} />
            </div>
          </Stack>
        )}
      </Modal>

      <ConfirmDialog
        open={revogando !== null}
        title="Revogar token?"
        message={`${revogando?.nome ?? ""} perde o acesso na hora, e não dá para desfazer. Para voltar a usar a rota, será preciso criar um token novo.`}
        confirmLabel="Revogar"
        variant="danger"
        loading={processandoRevogacao}
        onConfirm={confirmarRevogacao}
        onClose={() => setRevogando(null)}
      />
    </Card>
  );
}
