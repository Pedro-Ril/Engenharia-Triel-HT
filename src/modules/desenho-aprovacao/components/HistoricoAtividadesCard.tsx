"use client";

import { RefreshCw } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
import { approvalStatusConfig } from "@/modules/desenho-aprovacao/constants/approval-status";
import type { ApprovalHistoryItem } from "@/modules/desenho-aprovacao/types/approval";
import {
  formatDateTime,
  getHistoryActionLabel,
  getHistoryActionVariant,
  getHistoryRevisionCode,
  getStatusVariant,
} from "@/modules/desenho-aprovacao/utils/formatters";

interface HistoricoAtividadesCardProps {
  historico: ApprovalHistoryItem[];
  carregando: boolean;
  erro: string | null;
  onTentarNovamente: () => void;
}

export function HistoricoAtividadesCard({
  historico,
  carregando,
  erro,
  onTentarNovamente,
}: HistoricoAtividadesCardProps) {
  return (
    <Card
      title="Histórico de atividades"
      description="Eventos registrados durante o ciclo de vida do desenho."
      allowOverflow
    >
      {carregando && <Loader centered label="Carregando histórico..." />}

      {!carregando && erro && (
        <Stack gap={16}>
          <Alert variant="danger" title="Erro ao carregar o histórico">
            {erro}
          </Alert>

          <div>
            <Button type="button" variant="secondary" onClick={onTentarNovamente}>
              <RefreshCw size={16} aria-hidden="true" />
              Tentar novamente
            </Button>
          </div>
        </Stack>
      )}

      {!carregando && !erro && historico.length === 0 && (
        <Alert variant="info" title="Nenhuma atividade registrada">
          Este desenho ainda não possui eventos no histórico.
        </Alert>
      )}

      {!carregando && !erro && historico.length > 0 && (
        <Table minWidth={1200}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Data</TableHeaderCell>
              <TableHeaderCell>Ação</TableHeaderCell>
              <TableHeaderCell>Revisão</TableHeaderCell>
              <TableHeaderCell>Alteração de status</TableHeaderCell>
              <TableHeaderCell>Usuário</TableHeaderCell>
              <TableHeaderCell>Observação</TableHeaderCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {historico.map((registro) => {
              const codigoRevisao = getHistoryRevisionCode(registro.dados);

              return (
                <TableRow key={registro.id}>
                  <TableCell>{formatDateTime(registro.criadoEm)}</TableCell>

                  <TableCell>
                    <Badge variant={getHistoryActionVariant(registro.acao)}>
                      {getHistoryActionLabel(registro.acao)}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    {codigoRevisao ? (
                      <Badge variant="info">{codigoRevisao}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>

                  <TableCell>
                    {registro.statusAnterior || registro.statusNovo ? (
                      <Stack direction="row" gap={8} align="center" wrap>
                        {registro.statusAnterior ? (
                          <Badge variant={getStatusVariant(registro.statusAnterior)}>
                            {approvalStatusConfig[registro.statusAnterior].label}
                          </Badge>
                        ) : (
                          <span>Início</span>
                        )}

                        <span aria-hidden="true">→</span>

                        {registro.statusNovo ? (
                          <Badge variant={getStatusVariant(registro.statusNovo)}>
                            {approvalStatusConfig[registro.statusNovo].label}
                          </Badge>
                        ) : (
                          <span>—</span>
                        )}
                      </Stack>
                    ) : (
                      "Sem alteração"
                    )}
                  </TableCell>

                  <TableCell>{registro.usuario ?? "—"}</TableCell>
                  <TableCell>{registro.observacao ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
