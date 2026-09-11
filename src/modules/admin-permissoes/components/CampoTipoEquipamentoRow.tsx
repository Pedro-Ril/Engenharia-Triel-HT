"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { TableCell, TableRow } from "@/components/ui/Table";

import type { CampoTipoEquipamento } from "@/modules/estoque-equipamentos-usados/types/estoque.types";
import adminStyles from "./AdminPermissoes.module.css";

const TIPO_DADO_LABELS: Record<CampoTipoEquipamento["tipoDado"], string> = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
  booleano: "Sim/Não",
  unica_escolha: "Escolha única",
  multipla_escolha: "Múltipla escolha",
};

interface CampoTipoEquipamentoRowProps {
  campo: CampoTipoEquipamento;
  travaAtivo: boolean;
  podeExcluir: boolean;
  onAlternarAtivo: (ativo: boolean) => void;
  onEditar: () => void;
  onExcluirClick: () => void;
}

export function CampoTipoEquipamentoRow({
  campo,
  travaAtivo,
  podeExcluir,
  onAlternarAtivo,
  onEditar,
  onExcluirClick,
}: CampoTipoEquipamentoRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: campo.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell align="center">
        <div className={adminStyles.checkboxCentro}>
          <IconButton
            icon={<GripVertical size={15} />}
            label="Arrastar para reordenar"
            size="small"
            className={adminStyles.alcaArrastar}
            {...attributes}
            {...listeners}
          />
        </div>
      </TableCell>

      <TableCell>
        <Stack direction="row" gap={8} align="center">
          {campo.rotulo}
          {campo.ehSistema && <Badge variant="info">Sistema</Badge>}
          {campo.vemDeIntegracao && <Badge variant="primary">Integração</Badge>}
          {campo.geraPendencia && <Badge variant="neutral">Vira status</Badge>}
        </Stack>
      </TableCell>

      <TableCell>{TIPO_DADO_LABELS[campo.tipoDado]}</TableCell>
      <TableCell>{campo.unidade ?? "-"}</TableCell>

      <TableCell align="center">
        {campo.obrigatorio ? <Badge variant="warning">Obrigatório</Badge> : "-"}
      </TableCell>

      <TableCell align="center">
        <div className={adminStyles.checkboxCentro}>
          <Switch
            label=""
            compact
            checked={campo.ativo}
            disabled={travaAtivo}
            onChange={(event) => onAlternarAtivo(event.target.checked)}
          />
        </div>
      </TableCell>

      <TableCell align="center">
        <Stack direction="row" gap={6} justify="center">
          <IconButton
            size="small"
            variant="neutral"
            icon={<Pencil size={13} />}
            label="Editar campo"
            onClick={onEditar}
          />
          {podeExcluir && (
            <IconButton
              size="small"
              variant="danger"
              icon={<Trash2 size={13} />}
              label="Excluir campo"
              onClick={onExcluirClick}
            />
          )}
        </Stack>
      </TableCell>
    </TableRow>
  );
}
