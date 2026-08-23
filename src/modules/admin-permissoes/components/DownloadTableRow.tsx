"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/IconButton";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { TableCell, TableRow } from "@/components/ui/Table";
import type { DownloadAdmin } from "@/modules/downloads/types/downloads.types";

import adminStyles from "./AdminPermissoes.module.css";

interface DownloadTableRowProps {
  download: DownloadAdmin;
  alterandoAtivo: boolean;
  onAlternarAtivo: (ativo: boolean) => void;
  onEditar: () => void;
  onExcluir: () => void;
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DownloadTableRow({
  download,
  alterandoAtivo,
  onAlternarAtivo,
  onEditar,
  onExcluir,
}: DownloadTableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: download.id });

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

      <TableCell>{download.nome}</TableCell>
      <TableCell>{download.tag || "—"}</TableCell>
      <TableCell>
        {download.nomeArquivo} · {formatarTamanho(download.tamanhoBytes)}
      </TableCell>

      <TableCell align="center">
        <div className={adminStyles.checkboxCentro}>
          <Switch
            label=""
            compact
            checked={download.ativo}
            disabled={alterandoAtivo}
            onChange={(event) => onAlternarAtivo(event.target.checked)}
          />
        </div>
      </TableCell>

      <TableCell align="center">
        <Stack direction="row" gap={6} justify="center">
          <IconButton
            icon={<Pencil size={15} />}
            label="Editar download"
            size="small"
            onClick={onEditar}
          />
          <IconButton
            icon={<Trash2 size={15} />}
            label="Excluir download"
            size="small"
            variant="danger"
            onClick={onExcluir}
          />
        </Stack>
      </TableCell>
    </TableRow>
  );
}
