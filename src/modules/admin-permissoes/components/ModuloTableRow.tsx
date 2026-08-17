"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { Stack } from "@/components/ui/Stack";
import { TableCell, TableRow } from "@/components/ui/Table";

import type { PortalModulo } from "../types/adminPermissoes.types";
import adminStyles from "./AdminPermissoes.module.css";

interface ModuloTableRowProps {
  modulo: PortalModulo;
  onAtualizar: (
    campos: Partial<
      Pick<
        PortalModulo,
        | "publicoSemLogin"
        | "publicoAutenticado"
        | "emDesenvolvimento"
        | "ativo"
        | "ordem"
      >
    >
  ) => void;
  onEditar: () => void;
  onExcluir: () => void;
}

export function ModuloTableRow({
  modulo,
  onAtualizar,
  onEditar,
  onExcluir,
}: ModuloTableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: modulo.id });

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

      <TableCell>{modulo.nome}</TableCell>
      <TableCell>{modulo.path}</TableCell>

      <TableCell align="center">
        <div className={adminStyles.checkboxCentro}>
          <Checkbox
            label=""
            checked={modulo.publicoSemLogin}
            onChange={(event) =>
              onAtualizar({ publicoSemLogin: event.target.checked })
            }
          />
        </div>
      </TableCell>

      <TableCell align="center">
        <div className={adminStyles.checkboxCentro}>
          <Checkbox
            label=""
            checked={modulo.publicoAutenticado}
            onChange={(event) =>
              onAtualizar({ publicoAutenticado: event.target.checked })
            }
          />
        </div>
      </TableCell>

      <TableCell align="center">
        <div className={adminStyles.checkboxCentro}>
          <Checkbox
            label=""
            checked={modulo.emDesenvolvimento}
            onChange={(event) =>
              onAtualizar({ emDesenvolvimento: event.target.checked })
            }
          />
        </div>
      </TableCell>

      <TableCell align="center">
        <div className={adminStyles.checkboxCentro}>
          <Checkbox
            label=""
            checked={modulo.ativo}
            onChange={(event) => onAtualizar({ ativo: event.target.checked })}
          />
        </div>
      </TableCell>

      <TableCell align="center">
        <Stack direction="row" gap={6} justify="center">
          <IconButton
            icon={<Pencil size={15} />}
            label="Editar módulo"
            size="small"
            onClick={onEditar}
          />

          <IconButton
            icon={<Trash2 size={15} />}
            label="Excluir módulo"
            size="small"
            variant="danger"
            onClick={onExcluir}
          />
        </Stack>
      </TableCell>
    </TableRow>
  );
}
