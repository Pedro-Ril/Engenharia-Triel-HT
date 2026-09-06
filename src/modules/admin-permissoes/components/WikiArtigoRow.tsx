"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { TableCell, TableRow } from "@/components/ui/Table";
import type { WikiArtigo } from "@/modules/wiki/types/wiki.types";

import adminStyles from "./AdminPermissoes.module.css";

interface WikiArtigoRowProps {
  artigo: WikiArtigo;
  alterandoAtivo: boolean;
  onAlternarAtivo: (ativo: boolean) => void;
  onEditar: () => void;
  onExcluir: () => void;
}

export function WikiArtigoRow({
  artigo,
  alterandoAtivo,
  onAlternarAtivo,
  onEditar,
  onExcluir,
}: WikiArtigoRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: artigo.id,
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
        <strong>{artigo.titulo}</strong>
        {artigo.autorNome && <div className={adminStyles.usuarioSub}>por {artigo.autorNome}</div>}
      </TableCell>

      <TableCell align="center">
        {artigo.topicoNome ? <Badge variant="info">{artigo.topicoNome}</Badge> : "—"}
      </TableCell>

      <TableCell align="center">
        {artigo.privadoAdmin ? (
          <Badge variant="warning">
            <Stack direction="row" gap={5} align="center">
              <Lock size={12} />
              Somente admin
            </Stack>
          </Badge>
        ) : (
          "—"
        )}
      </TableCell>

      <TableCell align="center">
        <div className={adminStyles.checkboxCentro}>
          <Switch
            label=""
            compact
            checked={artigo.ativo}
            disabled={alterandoAtivo}
            onChange={(event) => onAlternarAtivo(event.target.checked)}
          />
        </div>
      </TableCell>

      <TableCell align="center">
        <Stack direction="row" gap={6} justify="center">
          <IconButton
            icon={<Pencil size={15} />}
            label="Editar artigo"
            size="small"
            onClick={onEditar}
          />
          <IconButton
            icon={<Trash2 size={15} />}
            label="Excluir artigo"
            size="small"
            variant="danger"
            onClick={onExcluir}
          />
        </Stack>
      </TableCell>
    </TableRow>
  );
}
