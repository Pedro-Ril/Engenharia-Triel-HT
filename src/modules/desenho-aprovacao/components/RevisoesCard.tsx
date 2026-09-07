"use client";

import { Download, Eye, RefreshCw } from "lucide-react";

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
import type { ApprovalRevision } from "@/modules/desenho-aprovacao/types/approval";
import {
  formatDateTime,
  getRevisionStatusLabel,
  getRevisionStatusVariant,
} from "@/modules/desenho-aprovacao/utils/formatters";

interface RevisoesCardProps {
  revisoes: ApprovalRevision[];
  revisaoAtualId: string | null;
  carregando: boolean;
  erro: string | null;
  gerandoPdfRevisaoId: string | null;
  onTentarNovamente: () => void;
  onAbrirSvg: (revisaoId: string) => void;
  onBaixarPdf: (revisao: ApprovalRevision) => void;
}

export function RevisoesCard({
  revisoes,
  revisaoAtualId,
  carregando,
  erro,
  gerandoPdfRevisaoId,
  onTentarNovamente,
  onAbrirSvg,
  onBaixarPdf,
}: RevisoesCardProps) {
  return (
    <Card
      title="Revisões"
      description="Histórico de versões geradas para este desenho."
      allowOverflow
    >
      {carregando && <Loader centered label="Carregando revisões..." />}

      {!carregando && erro && (
        <Stack gap={16}>
          <Alert variant="danger" title="Erro ao carregar as revisões">
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

      {!carregando && !erro && revisoes.length === 0 && (
        <Alert variant="info" title="Nenhuma revisão gerada">
          Este desenho ainda não possui uma revisão.
        </Alert>
      )}

      {!carregando && !erro && revisoes.length > 0 && (
        <Table minWidth={1450}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Revisão</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Criada em</TableHeaderCell>
              <TableHeaderCell>Gerada em</TableHeaderCell>
              <TableHeaderCell>Enviada em</TableHeaderCell>
              <TableHeaderCell>Decidida em</TableHeaderCell>
              <TableHeaderCell>Decidida por</TableHeaderCell>
              <TableHeaderCell>Observação</TableHeaderCell>
              <TableHeaderCell align="right">Ações</TableHeaderCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {revisoes.map((revisao) => {
              const isCurrent = revisao.id === revisaoAtualId;

              return (
                <TableRow key={revisao.id}>
                  <TableCell>
                    <Stack direction="row" gap={8} align="center" wrap>
                      <strong>{revisao.codigoRevisao}</strong>
                      {isCurrent && <Badge variant="info">Atual</Badge>}
                    </Stack>
                  </TableCell>

                  <TableCell>
                    <Badge variant={getRevisionStatusVariant(revisao.statusRevisao)}>
                      {getRevisionStatusLabel(revisao.statusRevisao)}
                    </Badge>
                  </TableCell>

                  <TableCell>{formatDateTime(revisao.criadoEm)}</TableCell>
                  <TableCell>{formatDateTime(revisao.geradoEm)}</TableCell>
                  <TableCell>{formatDateTime(revisao.enviadoAprovacaoEm)}</TableCell>
                  <TableCell>{formatDateTime(revisao.decididoEm)}</TableCell>
                  <TableCell>{revisao.decididoPor ?? "—"}</TableCell>
                  <TableCell>{revisao.observacaoDecisao ?? "—"}</TableCell>

                  <TableCell align="right">
                    <Stack direction="row" gap={8} justify="end" wrap>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!revisao.possuiSvg || gerandoPdfRevisaoId !== null}
                        onClick={() => onAbrirSvg(revisao.id)}
                      >
                        <Eye size={16} aria-hidden="true" />
                        Abrir SVG
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        loading={gerandoPdfRevisaoId === revisao.id}
                        loadingLabel="Gerando PDF..."
                        disabled={
                          !revisao.possuiSvg ||
                          (gerandoPdfRevisaoId !== null && gerandoPdfRevisaoId !== revisao.id)
                        }
                        onClick={() => onBaixarPdf(revisao)}
                      >
                        <Download size={16} aria-hidden="true" />
                        Baixar PDF
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
