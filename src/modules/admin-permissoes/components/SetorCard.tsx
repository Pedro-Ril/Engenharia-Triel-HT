"use client";

import { useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { IconPicker } from "@/components/ui/IconPicker";
import { Input } from "@/components/ui/Input";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import {
  Table,
  TableBody,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import { criarModulo } from "../services/adminPermissoes.service";
import type {
  PortalModulo,
  PortalSetor,
} from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import { ModuloTableRow } from "./ModuloTableRow";
import adminStyles from "./AdminPermissoes.module.css";

const novoModuloInicial = {
  chave: "",
  nome: "",
  path: "",
  icone: "",
  ordem: "0",
  publicoSemLogin: false,
  publicoAutenticado: true,
  emDesenvolvimento: false,
  setorIds: [] as string[],
};

function alternarIdEmLista(lista: string[], id: string): string[] {
  return lista.includes(id)
    ? lista.filter((item) => item !== id)
    : [...lista, id];
}

interface SetorCardProps {
  setor: PortalSetor;
  setoresDisponiveis: PortalSetor[];
  modulosDoSetor: PortalModulo[];
  onToggleAtivoSetor: (setor: PortalSetor, ativo: boolean) => void;
  onEditarSetor: (setor: PortalSetor) => void;
  onExcluirSetor: (setor: PortalSetor) => void;
  onAtualizarModulo: (
    modulo: PortalModulo,
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
  onEditarModulo: (modulo: PortalModulo) => void;
  onExcluirModulo: (modulo: PortalModulo) => void;
  onModuloCriado: (modulo: PortalModulo) => void;
  onReordenarModulos: (modulosReordenados: PortalModulo[]) => void;
  onFeedback: FeedbackHandler;
}

export function SetorCard({
  setor,
  setoresDisponiveis,
  modulosDoSetor,
  onToggleAtivoSetor,
  onEditarSetor,
  onExcluirSetor,
  onAtualizarModulo,
  onEditarModulo,
  onExcluirModulo,
  onModuloCriado,
  onReordenarModulos,
  onFeedback,
}: SetorCardProps) {
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [novoModulo, setNovoModulo] = useState({
    ...novoModuloInicial,
    setorIds: [setor.id],
  });
  const [criandoModulo, setCriandoModulo] = useState(false);
  const [erroModulo, setErroModulo] = useState<string | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: setor.id });

  const cardWrapperStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEndModulos(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const indiceAntigo = modulosDoSetor.findIndex((m) => m.id === active.id);
    const indiceNovo = modulosDoSetor.findIndex((m) => m.id === over.id);
    if (indiceAntigo === -1 || indiceNovo === -1) return;

    onReordenarModulos(arrayMove(modulosDoSetor, indiceAntigo, indiceNovo));
  }

  async function handleCriarModulo() {
    setErroModulo(null);
    setCriandoModulo(true);

    try {
      const resultado = await criarModulo({
        setorIds: novoModulo.setorIds,
        chave: novoModulo.chave,
        nome: novoModulo.nome,
        path: novoModulo.path,
        icone: novoModulo.icone.trim() || null,
        publicoSemLogin: novoModulo.publicoSemLogin,
        publicoAutenticado: novoModulo.publicoAutenticado,
        emDesenvolvimento: novoModulo.emDesenvolvimento,
        ordem: Number(novoModulo.ordem) || 0,
      });

      if (resultado.ok && resultado.data) {
        onModuloCriado(resultado.data);
        setNovoModulo({ ...novoModuloInicial, setorIds: [setor.id] });
        setFormularioAberto(false);
        onFeedback(
          "success",
          "Módulo criado",
          `"${resultado.data.nome}" já pode receber permissões.`
        );
      } else {
        setErroModulo(resultado.message ?? "Não foi possível criar o módulo.");
      }
    } finally {
      setCriandoModulo(false);
    }
  }

  return (
    <div ref={setNodeRef} style={cardWrapperStyle}>
      <Card
        title={setor.nome}
        actions={
          <Stack direction="row" gap={10} align="center">
            <IconButton
              icon={<GripVertical size={16} />}
              label="Arrastar para reordenar setor"
              className={adminStyles.alcaArrastar}
              {...attributes}
              {...listeners}
            />

            <Switch
              label="Ativo"
              compact
              checked={setor.ativo}
              onChange={(event) =>
                onToggleAtivoSetor(setor, event.target.checked)
              }
            />

            <IconButton
              icon={<Pencil size={16} />}
              label="Editar setor"
              onClick={() => onEditarSetor(setor)}
            />

            <IconButton
              icon={<Trash2 size={16} />}
              label="Excluir setor"
              variant="danger"
              onClick={() => onExcluirSetor(setor)}
            />
          </Stack>
        }
      >
        <Stack gap={16}>
          {modulosDoSetor.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEndModulos}
            >
              <SortableContext
                items={modulosDoSetor.map((modulo) => modulo.id)}
                strategy={verticalListSortingStrategy}
              >
                <Table minWidth={960}>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell align="center">Ordem</TableHeaderCell>
                      <TableHeaderCell>Módulo</TableHeaderCell>
                      <TableHeaderCell>Caminho</TableHeaderCell>
                      <TableHeaderCell align="center">
                        Público (sem login)
                      </TableHeaderCell>
                      <TableHeaderCell align="center">
                        Público (autenticado)
                      </TableHeaderCell>
                      <TableHeaderCell align="center">
                        Em desenvolvimento
                      </TableHeaderCell>
                      <TableHeaderCell align="center">Ativo</TableHeaderCell>
                      <TableHeaderCell align="center">Ações</TableHeaderCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {modulosDoSetor.map((modulo) => (
                      <ModuloTableRow
                        key={modulo.id}
                        modulo={modulo}
                        onAtualizar={(campos) =>
                          onAtualizarModulo(modulo, campos)
                        }
                        onEditar={() => onEditarModulo(modulo)}
                        onExcluir={() => onExcluirModulo(modulo)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </SortableContext>
            </DndContext>
          )}

          {formularioAberto ? (
            <Stack gap={16}>
              <FormGrid columns={4}>
                <Field label="Chave">
                  <Input
                    value={novoModulo.chave}
                    onChange={(event) =>
                      setNovoModulo((atual) => ({
                        ...atual,
                        chave: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="Nome">
                  <Input
                    value={novoModulo.nome}
                    onChange={(event) =>
                      setNovoModulo((atual) => ({
                        ...atual,
                        nome: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="Caminho (path)" hint='ex: "/financeiro-contas"'>
                  <Input
                    value={novoModulo.path}
                    onChange={(event) =>
                      setNovoModulo((atual) => ({
                        ...atual,
                        path: event.target.value,
                      }))
                    }
                  />
                </Field>

                <Field label="Ícone">
                  <IconPicker
                    value={novoModulo.icone || null}
                    onChange={(icone) =>
                      setNovoModulo((atual) => ({ ...atual, icone }))
                    }
                  />
                </Field>
              </FormGrid>

              <Field label="Setores" hint="o módulo aparece em cada setor marcado">
                <Stack direction="row" gap={16} wrap>
                  {setoresDisponiveis.map((setorDisponivel) => (
                    <Checkbox
                      key={setorDisponivel.id}
                      label={setorDisponivel.nome}
                      checked={novoModulo.setorIds.includes(setorDisponivel.id)}
                      onChange={() =>
                        setNovoModulo((atual) => ({
                          ...atual,
                          setorIds: alternarIdEmLista(
                            atual.setorIds,
                            setorDisponivel.id
                          ),
                        }))
                      }
                    />
                  ))}
                </Stack>
              </Field>

              <Stack direction="row" gap={20} wrap>
                <Checkbox
                  label="Público sem login"
                  checked={novoModulo.publicoSemLogin}
                  onChange={(event) =>
                    setNovoModulo((atual) => ({
                      ...atual,
                      publicoSemLogin: event.target.checked,
                    }))
                  }
                />

                <Checkbox
                  label="Público para qualquer autenticado"
                  checked={novoModulo.publicoAutenticado}
                  onChange={(event) =>
                    setNovoModulo((atual) => ({
                      ...atual,
                      publicoAutenticado: event.target.checked,
                    }))
                  }
                />

                <Checkbox
                  label="Em desenvolvimento"
                  hint="só administradores enxergam, mesmo que liberado acima"
                  checked={novoModulo.emDesenvolvimento}
                  onChange={(event) =>
                    setNovoModulo((atual) => ({
                      ...atual,
                      emDesenvolvimento: event.target.checked,
                    }))
                  }
                />
              </Stack>

              {erroModulo && <Alert variant="danger">{erroModulo}</Alert>}

              <Stack direction="row" justify="end" gap={10}>
                <Button
                  variant="secondary"
                  onClick={() => setFormularioAberto(false)}
                >
                  Cancelar
                </Button>

                <Button
                  onClick={handleCriarModulo}
                  loading={criandoModulo}
                  disabled={
                    !novoModulo.chave ||
                    !novoModulo.nome ||
                    !novoModulo.path ||
                    novoModulo.setorIds.length === 0
                  }
                >
                  Criar módulo
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack direction="row" justify="end">
              <Button
                variant="secondary"
                onClick={() => {
                  setErroModulo(null);
                  setNovoModulo({ ...novoModuloInicial, setorIds: [setor.id] });
                  setFormularioAberto(true);
                }}
              >
                Novo módulo neste setor
              </Button>
            </Stack>
          )}
        </Stack>
      </Card>
    </div>
  );
}
