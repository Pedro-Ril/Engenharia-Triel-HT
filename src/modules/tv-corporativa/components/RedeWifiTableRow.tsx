"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/IconButton";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { TableCell, TableRow } from "@/components/ui/Table";
import type { RedeWifiTv } from "../types/tvCorporativa.types";

import styles from "./RedesWifiCard.module.css";

interface RedeWifiTableRowProps {
  rede: RedeWifiTv;
  alterandoAtiva: boolean;
  onAlternarAtiva: (ativa: boolean) => void;
  onEditar: () => void;
  onExcluir: () => void;
}

export function RedeWifiTableRow({
  rede,
  alterandoAtiva,
  onAlternarAtiva,
  onEditar,
  onExcluir,
}: RedeWifiTableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rede.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell align="center">
        <div className={styles.checkboxCentro}>
          <IconButton
            icon={<GripVertical size={15} />}
            label="Arrastar para reordenar"
            size="small"
            className={styles.alcaArrastar}
            {...attributes}
            {...listeners}
          />
        </div>
      </TableCell>

      <TableCell>{rede.ssid}</TableCell>

      <TableCell align="center">
        <div className={styles.checkboxCentro}>
          <Switch
            label=""
            compact
            checked={rede.ativa}
            disabled={alterandoAtiva}
            onChange={(event) => onAlternarAtiva(event.target.checked)}
          />
        </div>
      </TableCell>

      <TableCell align="center">
        <Stack direction="row" gap={6} justify="center">
          <IconButton
            icon={<Pencil size={15} />}
            label="Editar rede Wi-Fi"
            size="small"
            onClick={onEditar}
          />
          <IconButton
            icon={<Trash2 size={15} />}
            label="Excluir rede Wi-Fi"
            size="small"
            variant="danger"
            onClick={onExcluir}
          />
        </Stack>
      </TableCell>
    </TableRow>
  );
}
