"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/IconButton";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { TableCell, TableRow } from "@/components/ui/Table";
import { urlImagemModeloAdmin } from "@/modules/assinaturas/services/assinaturas.service";
import type { ModeloAssinaturaAdmin } from "@/modules/assinaturas/types/assinaturas.types";

import adminStyles from "./AdminPermissoes.module.css";
import styles from "./AssinaturaModeloEditor.module.css";

interface AssinaturaModeloTableRowProps {
  modelo: ModeloAssinaturaAdmin;
  alterandoAtivo: boolean;
  onAlternarAtivo: (ativo: boolean) => void;
  onEditar: () => void;
  onExcluir: () => void;
}

export function AssinaturaModeloTableRow({
  modelo,
  alterandoAtivo,
  onAlternarAtivo,
  onEditar,
  onExcluir,
}: AssinaturaModeloTableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: modelo.id,
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
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de modelo vinda do banco, não do pipeline de otimização do Next */}
        <img src={urlImagemModeloAdmin(modelo.id)} alt="" className={styles.miniaturaTabela} />
      </TableCell>

      <TableCell>{modelo.nome}</TableCell>

      <TableCell align="center">
        <div className={adminStyles.checkboxCentro}>
          <Switch
            label=""
            compact
            checked={modelo.ativo}
            disabled={alterandoAtivo}
            onChange={(event) => onAlternarAtivo(event.target.checked)}
          />
        </div>
      </TableCell>

      <TableCell align="center">
        <Stack direction="row" gap={6} justify="center">
          <IconButton icon={<Pencil size={15} />} label="Editar modelo" size="small" onClick={onEditar} />
          <IconButton
            icon={<Trash2 size={15} />}
            label="Excluir modelo"
            size="small"
            variant="danger"
            onClick={onExcluir}
          />
        </Stack>
      </TableCell>
    </TableRow>
  );
}
