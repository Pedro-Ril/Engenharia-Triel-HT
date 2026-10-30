"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import { atualizarDoErp, buscarSituacaoErp } from "../services/estoque.service";
import type { SituacaoErpEquipamento, StatusEquipamento } from "../types/estoque.types";
import styles from "./ErpExtratoCard.module.css";

const LOCAL_LABEL: Record<string, { texto: string; variant: "success" | "info" | "neutral" | "warning" }> = {
  EM_ESTOQUE: { texto: "Em estoque", variant: "success" },
  EM_TERCEIRO: { texto: "Com terceiro", variant: "info" },
  FORA_DA_EMPRESA: { texto: "Fora da empresa", variant: "neutral" },
  SEM_MOVIMENTO: { texto: "Sem movimento", variant: "warning" },
};

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function formatarDataHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
}

function formatarMoeda(valor: number | null): string {
  return valor === null ? "—" : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/*
 * O que o ERP diz deste equipamento: a situação atual e todas as
 * movimentações do extrato do item (compra, remessas, retornos, venda,
 * transferências), com valor e NF. O status do Portal segue o ERP pela
 * sincronização automática (a cada hora) ou pelo botão "Atualizar do ERP".
 */
export function ErpExtratoCard({
  equipamentoId,
  status,
  identificadoNoErp,
}: {
  equipamentoId: string;
  status: StatusEquipamento;
  identificadoNoErp: boolean;
}) {
  const router = useRouter();
  const [situacao, setSituacao] = useState<SituacaoErpEquipamento | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [aviso, setAviso] = useState<{ variant: "success" | "danger"; texto: string } | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    buscarSituacaoErp(equipamentoId).then((dados) => {
      if (!vivo) return;
      setSituacao(dados);
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [equipamentoId, recarga]);

  async function handleAtualizar() {
    setAtualizando(true);
    setAviso(null);
    try {
      const resposta = await atualizarDoErp(equipamentoId);
      const r = resposta.data;
      if (resposta.ok && r) {
        const partes = [
          r.statusAntes !== r.statusDepois ? "status atualizado" : null,
          r.movimentacoesCriadas ? `${r.movimentacoesCriadas} movimentação(ões) lançada(s) no extrato` : null,
          r.movimentacoesVinculadas ? `${r.movimentacoesVinculadas} confirmada(s) pela NF` : null,
          r.movimentosErpRemovidos ? `${r.movimentosErpRemovidos} cancelada(s) no ERP` : null,
        ].filter(Boolean);
        setAviso({ variant: "success", texto: partes.length ? `Atualizado: ${partes.join(", ")}.` : "Tudo igual ao ERP." });
        router.refresh();
      } else {
        setAviso({ variant: "danger", texto: resposta.message ?? "Não foi possível atualizar do ERP." });
      }
    } finally {
      setAtualizando(false);
      setRecarga((n) => n + 1);
    }
  }

  const podeAtualizar = identificadoNoErp && status !== "baixado";
  const local = situacao?.local ? LOCAL_LABEL[situacao.local] : null;

  return (
    <Card
      title="Movimentações no ERP"
      description={
        status === "baixado"
          ? "Equipamento baixado: não é mais consultado no ERP."
          : "Extrato do item no ERP. O status do Portal segue o ERP, conferido a cada hora."
      }
      actions={
        podeAtualizar ? (
          <Button variant="secondary" onClick={handleAtualizar} loading={atualizando}>
            <RefreshCw size={16} /> Atualizar do ERP
          </Button>
        ) : undefined
      }
    >
      <Stack gap={16}>
        {aviso && <Alert variant={aviso.variant}>{aviso.texto}</Alert>}

        {!identificadoNoErp ? (
          <EmptyState
            title="Ainda não identificado no ERP"
            description="Assim que a NF de entrada for encontrada no ERP, as movimentações passam a aparecer aqui."
          />
        ) : carregando ? (
          <Loader label="Carregando o extrato do ERP..." />
        ) : !situacao ? (
          <Alert variant="danger">Não foi possível carregar a situação no ERP.</Alert>
        ) : (
          <>
            {situacao.erro && <Alert variant="warning">Última consulta ao ERP falhou: {situacao.erro}</Alert>}

            <dl className={styles.resumo}>
              <div>
                <dt>Situação no ERP</dt>
                <dd>
                  {local ? <Badge variant={local.variant}>{local.texto}</Badge> : "Ainda não sincronizado"}
                  {situacao.desde && <span className={styles.suave}> desde {formatarData(situacao.desde)}</span>}
                </dd>
              </div>
              <div>
                <dt>Com quem</dt>
                <dd>{situacao.local === "EM_TERCEIRO" || situacao.local === "FORA_DA_EMPRESA" ? (situacao.contraparte ?? "—") : "—"}</dd>
              </div>
              <div>
                <dt>Custo de compra</dt>
                <dd>{formatarMoeda(situacao.custoCompra)}</dd>
              </div>
              <div>
                <dt>Última conferência</dt>
                <dd>{formatarDataHora(situacao.sincronizadoEm)}</dd>
              </div>
            </dl>

            {situacao.movimentos.length === 0 ? (
              <p className={styles.suave}>Nenhuma movimentação trazida do ERP ainda.</p>
            ) : (
              <div className={styles.tabela}>
                <Table minWidth={980}>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Data</TableHeaderCell>
                      <TableHeaderCell>Movimento</TableHeaderCell>
                      <TableHeaderCell>NF</TableHeaderCell>
                      <TableHeaderCell>CFOP</TableHeaderCell>
                      <TableHeaderCell>Com quem</TableHeaderCell>
                      <TableHeaderCell align="right">Valor</TableHeaderCell>
                      <TableHeaderCell>Depois</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {situacao.movimentos.map((m) => (
                      <TableRow key={m.idMovimentacao} className={m.removido ? styles.removido : undefined}>
                        <TableCell className={styles.semQuebra}>{formatarData(m.data)}</TableCell>
                        <TableCell>
                          {m.tipoLabel}
                          {m.vendaDeConsignacao && <span className={styles.suave}> (de consignação)</span>}
                          {m.removido && (
                            <div>
                              <Badge variant="danger">NF cancelada no ERP</Badge>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className={styles.semQuebra}>
                          {m.nfNumero ? `${m.nfNumero}${m.nfSerie ? `/${m.nfSerie}` : ""}` : "—"}
                        </TableCell>
                        <TableCell title={m.naturezaOperacao ?? undefined}>{m.cfop ?? "—"}</TableCell>
                        <TableCell>{m.contraparteNome ?? "—"}</TableCell>
                        <TableCell align="right" className={styles.semQuebra}>
                          {formatarMoeda(m.valorTotalItem)}
                        </TableCell>
                        <TableCell>{m.localDepois ? (LOCAL_LABEL[m.localDepois]?.texto ?? m.localDepois) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </Stack>
    </Card>
  );
}
