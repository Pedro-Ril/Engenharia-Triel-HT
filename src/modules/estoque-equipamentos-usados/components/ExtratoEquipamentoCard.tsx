"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Paperclip, RefreshCw } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import { atualizarDoErp, buscarSituacaoErp } from "../services/estoque.service";
import type {
  AnexoMovimentacao,
  MovimentacaoEquipamento,
  SituacaoErpEquipamento,
  StatusEquipamento,
} from "../types/estoque.types";
import { LOCAL_LABEL, ORIGEM, montarLinhas } from "../utils/extrato-unificado";
import { STATUS_LABELS } from "../utils/rotulos";
import styles from "./ExtratoEquipamentoCard.module.css";

function formatarData(iso: string | null): string {
  if (!iso) return "-";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function formatarDataHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-";
}

function formatarMoeda(valor: number | null): string {
  return valor === null ? "-" : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/*
 * Extrato do equipamento: tudo o que aconteceu com ele, no Portal e no ERP,
 * numa tabela só. No topo, a situação atual segundo o ERP e o botão para
 * conferir com o ERP agora (o status do Portal segue o ERP, de hora em hora).
 */
export function ExtratoEquipamentoCard({
  equipamentoId,
  status,
  identificadoNoErp,
  movimentacoes,
  anexosPorMovimentacao,
  onExportar,
}: {
  equipamentoId: string;
  status: StatusEquipamento;
  identificadoNoErp: boolean;
  movimentacoes: MovimentacaoEquipamento[];
  anexosPorMovimentacao: Map<string, AnexoMovimentacao[]>;
  onExportar: (situacaoErp: SituacaoErpEquipamento | null) => void;
}) {
  const router = useRouter();
  const [situacao, setSituacao] = useState<SituacaoErpEquipamento | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [aviso, setAviso] = useState<{ variant: "success" | "danger"; texto: string } | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!identificadoNoErp) return;
    let vivo = true;
    buscarSituacaoErp(equipamentoId).then((dados) => {
      if (vivo) setSituacao(dados);
    });
    return () => {
      vivo = false;
    };
  }, [equipamentoId, identificadoNoErp, recarga]);

  async function handleAtualizar() {
    setAtualizando(true);
    setAviso(null);
    try {
      const resposta = await atualizarDoErp(equipamentoId);
      const r = resposta.data;
      if (resposta.ok && r) {
        const partes = [
          r.statusAntes !== r.statusDepois ? `status: ${STATUS_LABELS[r.statusDepois]}` : null,
          r.movimentacoesCriadas ? `${r.movimentacoesCriadas} movimentação(ões) nova(s)` : null,
          r.movimentacoesVinculadas ? `${r.movimentacoesVinculadas} confirmada(s) pela NF` : null,
          r.movimentosErpRemovidos ? `${r.movimentosErpRemovidos} NF cancelada(s) no ERP` : null,
          r.pdfsAnexados ? `${r.pdfsAnexados} PDF(s) de NF anexado(s)` : null,
        ].filter(Boolean);
        setAviso({ variant: "success", texto: partes.length ? `Atualizado do ERP: ${partes.join(", ")}.` : "Tudo igual ao ERP." });
        router.refresh();
      } else {
        setAviso({ variant: "danger", texto: resposta.message ?? "Não foi possível atualizar do ERP." });
      }
    } finally {
      setAtualizando(false);
      setRecarga((n) => n + 1);
    }
  }

  const linhas = montarLinhas(movimentacoes, situacao?.movimentos ?? [], anexosPorMovimentacao);
  const local = situacao?.local ? LOCAL_LABEL[situacao.local] : null;
  const podeAtualizar = identificadoNoErp && status !== "baixado";

  return (
    <Card
      title="Extrato — histórico completo"
      description={
        !identificadoNoErp
          ? "Movimentações registradas no Portal. As do ERP aparecem aqui assim que a NF de entrada for encontrada."
          : status === "baixado"
            ? "Portal e ERP juntos. Equipamento baixado: não é mais conferido com o ERP."
            : "Portal e ERP juntos, em ordem de data. O status segue o ERP, conferido a cada hora."
      }
      actions={
        <Stack direction="row" gap={8}>
          {podeAtualizar && (
            <Button variant="secondary" onClick={handleAtualizar} loading={atualizando}>
              <RefreshCw size={16} /> Atualizar do ERP
            </Button>
          )}
          <Button variant="secondary" onClick={() => onExportar(situacao)}>
            <Download size={16} /> Exportar extrato
          </Button>
        </Stack>
      }
    >
      <Stack gap={16}>
        {aviso && <Alert variant={aviso.variant}>{aviso.texto}</Alert>}
        {situacao?.erro && <Alert variant="warning">Última conferência com o ERP falhou: {situacao.erro}</Alert>}

        {identificadoNoErp && situacao && (
          <dl className={styles.resumo}>
            <div>
              <dt>Situação no ERP</dt>
              <dd>
                {local ? <Badge variant={local.variant}>{local.texto}</Badge> : "Ainda não conferido"}
                {situacao.desde && <span className={styles.suave}> desde {formatarData(situacao.desde)}</span>}
              </dd>
            </div>
            <div>
              <dt>Com quem</dt>
              <dd>{situacao.local === "EM_TERCEIRO" || situacao.local === "FORA_DA_EMPRESA" ? (situacao.contraparte ?? "-") : "-"}</dd>
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
        )}

        <div className={styles.tabela}>
          <Table minWidth={1500}>
            <TableHead>
              <TableRow>
                <TableHeaderCell style={{ width: 100 }}>Data</TableHeaderCell>
                <TableHeaderCell style={{ width: 200 }}>Movimentação</TableHeaderCell>
                <TableHeaderCell style={{ width: 110 }}>NF</TableHeaderCell>
                <TableHeaderCell style={{ width: 70 }}>CFOP</TableHeaderCell>
                <TableHeaderCell style={{ width: 130 }} align="right">Valor</TableHeaderCell>
                <TableHeaderCell style={{ width: 110 }}>Emissão NF</TableHeaderCell>
                <TableHeaderCell style={{ width: 260 }}>Com quem</TableHeaderCell>
                <TableHeaderCell style={{ width: 150 }}>Status</TableHeaderCell>
                <TableHeaderCell style={{ width: 200 }}>Anexos</TableHeaderCell>
                <TableHeaderCell style={{ width: 190 }}>Responsável</TableHeaderCell>
                <TableHeaderCell style={{ width: 110 }}>Origem</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {linhas.map((linha) => (
                <TableRow key={linha.chave} className={linha.cancelada ? styles.cancelada : undefined}>
                  <TableCell className={styles.semQuebra}>{formatarData(linha.data)}</TableCell>
                  <TableCell>
                    {linha.acao}
                    {linha.detalheErp && <div className={styles.suave}>{linha.detalheErp}</div>}
                  </TableCell>
                  <TableCell className={styles.semQuebra}>{linha.nf ?? "-"}</TableCell>
                  <TableCell title={linha.naturezaOperacao ?? undefined}>{linha.cfop ?? "-"}</TableCell>
                  <TableCell align="right" className={styles.semQuebra}>
                    {formatarMoeda(linha.valor)}
                  </TableCell>
                  <TableCell className={styles.semQuebra}>{formatarData(linha.emissao)}</TableCell>
                  <TableCell>{linha.comQuem ?? "-"}</TableCell>
                  <TableCell>{linha.status ? <Badge variant={linha.status.variant}>{linha.status.texto}</Badge> : "-"}</TableCell>
                  <TableCell>
                    {linha.anexos.length === 0 ? (
                      "-"
                    ) : (
                      <Stack gap={4}>
                        {linha.anexos.map((anexo) => (
                          <a
                            key={anexo.id}
                            href={`/api/estoque-equipamentos-usados/anexos/${anexo.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.linkAnexo}
                          >
                            <Paperclip size={13} />
                            {anexo.nomeArquivo}
                          </a>
                        ))}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell>{linha.responsavel}</TableCell>
                  <TableCell>
                    <Badge variant={ORIGEM[linha.origem].variant}>{ORIGEM[linha.origem].texto}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Stack>
    </Card>
  );
}
