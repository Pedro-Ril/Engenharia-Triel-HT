"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import {
  atualizarGrade,
  buscarGrade,
  criarGrade,
  excluirGrade,
  listarGrades,
  listarMidias,
  salvarSlotsDaGrade,
} from "../services/tvCorporativa.service";
import type {
  GradeComSlots,
  GradeTv,
  MidiaTv,
  TipoConteudoTv,
} from "../types/tvCorporativa.types";

interface GradesTvPainelProps {
  onFeedback: FeedbackHandler;
}

interface ItemEditavel {
  chave: string;
  tipoConteudo: TipoConteudoTv;
  midiaId: string | null;
  urlPaginaWeb: string;
  duracaoSegundos: number;
}

interface SlotEditavel {
  chave: string;
  nome: string;
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
  itens: ItemEditavel[];
}

const DIAS = [
  { valor: 0, label: "Dom" },
  { valor: 1, label: "Seg" },
  { valor: 2, label: "Ter" },
  { valor: 3, label: "Qua" },
  { valor: 4, label: "Qui" },
  { valor: 5, label: "Sex" },
  { valor: 6, label: "Sáb" },
];

const OPCOES_TIPO_CONTEUDO = [
  { value: "video", label: "Vídeo" },
  { value: "foto", label: "Foto" },
  { value: "documento", label: "Documento" },
  { value: "pagina_web", label: "Página web" },
];

function novoItem(): ItemEditavel {
  return {
    chave: crypto.randomUUID(),
    tipoConteudo: "foto",
    midiaId: null,
    urlPaginaWeb: "",
    duracaoSegundos: 15,
  };
}

function novoSlot(): SlotEditavel {
  return {
    chave: crypto.randomUUID(),
    nome: "",
    diasSemana: "todos",
    horaInicio: "08:00",
    horaFim: "18:00",
    itens: [],
  };
}

function ItemPlaylistLinha({
  item,
  midias,
  onAlterar,
  onRemover,
}: {
  item: ItemEditavel;
  midias: MidiaTv[];
  onAlterar: (item: ItemEditavel) => void;
  onRemover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.chave,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const midiasDoTipo = midias.filter((midia) => midia.tipo === item.tipoConteudo);

  return (
    <div ref={setNodeRef} style={style}>
      <Stack direction="row" gap={10} align="center" wrap>
        <IconButton
          icon={<GripVertical size={15} />}
          label="Arrastar pra reordenar"
          size="small"
          variant="neutral"
          {...attributes}
          {...listeners}
        />

        <div style={{ width: 150 }}>
          <Dropdown
            value={item.tipoConteudo}
            options={OPCOES_TIPO_CONTEUDO}
            onValueChange={(valor) =>
              onAlterar({
                ...item,
                tipoConteudo: valor as TipoConteudoTv,
                midiaId: null,
                urlPaginaWeb: "",
              })
            }
          />
        </div>

        {item.tipoConteudo === "pagina_web" ? (
          <div style={{ flex: 1, minWidth: 220 }}>
            <Input
              value={item.urlPaginaWeb}
              placeholder="https://..."
              onChange={(event) => onAlterar({ ...item, urlPaginaWeb: event.target.value })}
            />
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 220 }}>
            <Dropdown
              value={item.midiaId ?? ""}
              options={[
                { value: "", label: "Selecione uma mídia..." },
                ...midiasDoTipo.map((midia) => ({ value: midia.id, label: midia.nomeOriginal })),
              ]}
              onValueChange={(valor) => onAlterar({ ...item, midiaId: valor || null })}
            />
          </div>
        )}

        <div style={{ width: 110 }}>
          <NumberInput
            value={String(item.duracaoSegundos)}
            min={1}
            suffix="s"
            onChange={(event) =>
              onAlterar({ ...item, duracaoSegundos: Number(event.target.value) || 1 })
            }
          />
        </div>

        <IconButton
          icon={<Trash2 size={15} />}
          label="Remover item"
          size="small"
          variant="danger"
          onClick={onRemover}
        />
      </Stack>
    </div>
  );
}

function SlotEditor({
  slot,
  midias,
  onAlterar,
  onRemover,
}: {
  slot: SlotEditavel;
  midias: MidiaTv[];
  onAlterar: (slot: SlotEditavel) => void;
  onRemover: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const diasSelecionados =
    slot.diasSemana === "todos" ? [] : slot.diasSemana.split(",").map(Number);

  function alternarDia(dia: number) {
    if (slot.diasSemana === "todos") {
      onAlterar({ ...slot, diasSemana: String(dia) });
      return;
    }

    const jaTem = diasSelecionados.includes(dia);
    const novaLista = jaTem
      ? diasSelecionados.filter((d) => d !== dia)
      : [...diasSelecionados, dia].sort();

    onAlterar({
      ...slot,
      diasSemana: novaLista.length > 0 ? novaLista.join(",") : String(dia),
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = slot.itens.findIndex((item) => item.chave === active.id);
    const newIndex = slot.itens.findIndex((item) => item.chave === over.id);

    onAlterar({ ...slot, itens: arrayMove(slot.itens, oldIndex, newIndex) });
  }

  return (
    <Card
      title={slot.nome || "Novo slot"}
      actions={
        <IconButton
          icon={<Trash2 size={15} />}
          label="Remover slot"
          size="small"
          variant="danger"
          onClick={onRemover}
        />
      }
    >
      <Stack gap={16}>
        <Field label="Nome do slot" htmlFor={`slot-nome-${slot.chave}`}>
          <Input
            id={`slot-nome-${slot.chave}`}
            value={slot.nome}
            placeholder="Ex: Manhã, Horário de almoço"
            onChange={(event) => onAlterar({ ...slot, nome: event.target.value })}
          />
        </Field>

        <Field label="Dias da semana">
          <Stack direction="row" gap={6} wrap>
            <Switch
              compact
              label="Todos os dias"
              checked={slot.diasSemana === "todos"}
              onChange={(event) =>
                onAlterar({ ...slot, diasSemana: event.target.checked ? "todos" : "1,2,3,4,5" })
              }
            />
            {slot.diasSemana !== "todos" &&
              DIAS.map((dia) => (
                <Button
                  key={dia.valor}
                  type="button"
                  variant={diasSelecionados.includes(dia.valor) ? "primary" : "secondary"}
                  onClick={() => alternarDia(dia.valor)}
                >
                  {dia.label}
                </Button>
              ))}
          </Stack>
        </Field>

        <Stack direction="row" gap={16}>
          <Field label="Hora início" htmlFor={`slot-inicio-${slot.chave}`}>
            <input
              id={`slot-inicio-${slot.chave}`}
              type="time"
              value={slot.horaInicio}
              onChange={(event) => onAlterar({ ...slot, horaInicio: event.target.value })}
            />
          </Field>
          <Field label="Hora fim" htmlFor={`slot-fim-${slot.chave}`}>
            <input
              id={`slot-fim-${slot.chave}`}
              type="time"
              value={slot.horaFim}
              onChange={(event) => onAlterar({ ...slot, horaFim: event.target.value })}
            />
          </Field>
        </Stack>

        <Field label="Playlist">
          <Stack gap={10}>
            {slot.itens.length === 0 ? (
              <EmptyState
                icon={<Plus size={20} />}
                title="Nenhum item ainda"
                description="Adicione vídeos, fotos, documentos ou páginas web pra este slot."
              />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={slot.itens.map((item) => item.chave)}
                  strategy={verticalListSortingStrategy}
                >
                  <Stack gap={8}>
                    {slot.itens.map((item) => (
                      <ItemPlaylistLinha
                        key={item.chave}
                        item={item}
                        midias={midias}
                        onAlterar={(novoItemValor) =>
                          onAlterar({
                            ...slot,
                            itens: slot.itens.map((i) =>
                              i.chave === item.chave ? novoItemValor : i
                            ),
                          })
                        }
                        onRemover={() =>
                          onAlterar({
                            ...slot,
                            itens: slot.itens.filter((i) => i.chave !== item.chave),
                          })
                        }
                      />
                    ))}
                  </Stack>
                </SortableContext>
              </DndContext>
            )}

            <Stack direction="row" justify="end">
              <Button
                variant="secondary"
                onClick={() => onAlterar({ ...slot, itens: [...slot.itens, novoItem()] })}
              >
                <Plus size={15} />
                Adicionar item
              </Button>
            </Stack>
          </Stack>
        </Field>
      </Stack>
    </Card>
  );
}

export function GradesTvPainel({ onFeedback }: GradesTvPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [grades, setGrades] = useState<GradeTv[]>([]);
  const [midias, setMidias] = useState<MidiaTv[]>([]);

  const [criarAberto, setCriarAberto] = useState(false);
  const [nomeNovaGrade, setNomeNovaGrade] = useState("");
  const [criando, setCriando] = useState(false);

  const [gradeParaExcluir, setGradeParaExcluir] = useState<GradeTv | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const [editorAberto, setEditorAberto] = useState(false);
  const [gradeEmEdicaoId, setGradeEmEdicaoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [ativaEdicao, setAtivaEdicao] = useState(true);
  const [slots, setSlots] = useState<SlotEditavel[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function carregarListas() {
    const [listaGrades, listaMidias] = await Promise.all([listarGrades(), listarMidias()]);
    setGrades(listaGrades);
    setMidias(listaMidias);
  }

  useEffect(() => {
    let cancelado = false;

    async function inicial() {
      setCarregando(true);
      await carregarListas();
      if (!cancelado) setCarregando(false);
    }

    inicial();

    return () => {
      cancelado = true;
    };
  }, []);

  async function handleCriar() {
    setCriando(true);

    try {
      const resultado = await criarGrade(nomeNovaGrade.trim());

      if (resultado.ok) {
        onFeedback("success", "Grade criada", "A grade foi criada.");
        setCriarAberto(false);
        setNomeNovaGrade("");
        await carregarListas();
      } else {
        onFeedback(
          "danger",
          "Não foi possível criar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setCriando(false);
    }
  }

  async function handleAbrirEditor(grade: GradeTv) {
    setGradeEmEdicaoId(grade.id);
    setNomeEdicao(grade.nome);
    setAtivaEdicao(grade.ativa);
    setEditorAberto(true);

    const detalhe: GradeComSlots | null = await buscarGrade(grade.id);

    setSlots(
      (detalhe?.slots ?? []).map((slot) => ({
        chave: crypto.randomUUID(),
        nome: slot.nome ?? "",
        diasSemana: slot.diasSemana,
        horaInicio: slot.horaInicio.slice(0, 5),
        horaFim: slot.horaFim.slice(0, 5),
        itens: slot.itens.map((item) => ({
          chave: crypto.randomUUID(),
          tipoConteudo: item.tipoConteudo,
          midiaId: item.midiaId,
          urlPaginaWeb: item.urlPaginaWeb ?? "",
          duracaoSegundos: item.duracaoSegundos,
        })),
      }))
    );
  }

  async function handleSalvarEdicao() {
    if (!gradeEmEdicaoId) return;
    setSalvando(true);

    try {
      const metadadosResultado = await atualizarGrade(gradeEmEdicaoId, {
        nome: nomeEdicao.trim(),
        ativa: ativaEdicao,
      });

      if (!metadadosResultado.ok) {
        onFeedback(
          "danger",
          "Não foi possível salvar",
          metadadosResultado.message ?? "Tente novamente em instantes."
        );
        return;
      }

      const slotsResultado = await salvarSlotsDaGrade(
        gradeEmEdicaoId,
        slots.map((slot, indice) => ({
          id: slot.chave,
          nome: slot.nome.trim() || null,
          diasSemana: slot.diasSemana,
          horaInicio: slot.horaInicio,
          horaFim: slot.horaFim,
          ordem: indice,
          itens: slot.itens.map((item, indiceItem) => ({
            id: item.chave,
            tipoConteudo: item.tipoConteudo,
            midiaId: item.tipoConteudo === "pagina_web" ? null : item.midiaId,
            urlPaginaWeb: item.tipoConteudo === "pagina_web" ? item.urlPaginaWeb.trim() : null,
            duracaoSegundos: item.duracaoSegundos,
            ordem: indiceItem,
          })),
        }))
      );

      if (slotsResultado.ok) {
        onFeedback("success", "Grade salva", "A programação foi salva.");
        setEditorAberto(false);
        await carregarListas();
      } else {
        onFeedback(
          "danger",
          "Não foi possível salvar a programação",
          slotsResultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir() {
    if (!gradeParaExcluir) return;
    setExcluindo(true);

    try {
      const resultado = await excluirGrade(gradeParaExcluir.id);

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Grade excluída" : "Não foi possível excluir",
        resultado.message ?? "Tente novamente em instantes."
      );

      if (resultado.ok) await carregarListas();
    } finally {
      setExcluindo(false);
      setGradeParaExcluir(null);
    }
  }

  if (carregando) {
    return <Loader label="Carregando grades..." />;
  }

  return (
    <Card
      title="Grades de programação"
      description="Cada grade pode ser atribuída a um ou mais terminais."
      actions={<Button onClick={() => setCriarAberto(true)}>Nova grade</Button>}
    >
      {grades.length === 0 ? (
        <EmptyState
          icon={<Plus size={26} />}
          title="Nenhuma grade criada ainda"
          description='Clique em "Nova grade" pra montar a primeira programação.'
        />
      ) : (
        <Table minWidth={600}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Nome</TableHeaderCell>
              <TableHeaderCell align="center">Status</TableHeaderCell>
              <TableHeaderCell align="center">Ações</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {grades.map((grade) => (
              <TableRow key={grade.id}>
                <TableCell>{grade.nome}</TableCell>
                <TableCell align="center">
                  <Badge variant={grade.ativa ? "success" : "neutral"}>
                    {grade.ativa ? "Ativa" : "Inativa"}
                  </Badge>
                </TableCell>
                <TableCell align="center">
                  <Stack direction="row" justify="center" gap={4}>
                    <IconButton
                      icon={<Pencil size={15} />}
                      label="Editar grade"
                      size="small"
                      onClick={() => handleAbrirEditor(grade)}
                    />
                    <IconButton
                      icon={<Trash2 size={15} />}
                      label="Excluir grade"
                      size="small"
                      variant="danger"
                      onClick={() => setGradeParaExcluir(grade)}
                    />
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal
        open={criarAberto}
        onClose={() => setCriarAberto(false)}
        title="Nova grade de programação"
      >
        <Stack gap={16}>
          <Field label="Nome" htmlFor="tv-nova-grade-nome" required>
            <Input
              id="tv-nova-grade-nome"
              value={nomeNovaGrade}
              onChange={(event) => setNomeNovaGrade(event.target.value)}
              placeholder="Ex: Grade Recepção"
            />
          </Field>
          <Stack direction="row" justify="end">
            <Button onClick={handleCriar} loading={criando} disabled={!nomeNovaGrade.trim()}>
              Criar
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <Drawer
        open={editorAberto}
        onClose={() => setEditorAberto(false)}
        title={nomeEdicao || "Editar grade"}
        description="Configure os slots (janelas de dia/horário) e a playlist de cada um."
        size="large"
        footer={
          <Stack direction="row" justify="end" gap={8}>
            <Button variant="secondary" onClick={() => setEditorAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarEdicao} loading={salvando}>
              Salvar
            </Button>
          </Stack>
        }
      >
        <Stack gap={20}>
          <Stack direction="row" gap={16} align="end">
            <div style={{ flex: 1 }}>
              <Field label="Nome da grade" htmlFor="tv-editar-grade-nome">
                <Input
                  id="tv-editar-grade-nome"
                  value={nomeEdicao}
                  onChange={(event) => setNomeEdicao(event.target.value)}
                />
              </Field>
            </div>
            <Switch
              label="Ativa"
              checked={ativaEdicao}
              onChange={(event) => setAtivaEdicao(event.target.checked)}
            />
          </Stack>

          {slots.map((slot) => (
            <SlotEditor
              key={slot.chave}
              slot={slot}
              midias={midias}
              onAlterar={(novoSlotValor) =>
                setSlots((atual) =>
                  atual.map((s) => (s.chave === slot.chave ? novoSlotValor : s))
                )
              }
              onRemover={() =>
                setSlots((atual) => atual.filter((s) => s.chave !== slot.chave))
              }
            />
          ))}

          <Stack direction="row" justify="end">
            <Button variant="secondary" onClick={() => setSlots((atual) => [...atual, novoSlot()])}>
              <Plus size={15} />
              Adicionar slot
            </Button>
          </Stack>
        </Stack>
      </Drawer>

      <ConfirmDialog
        open={gradeParaExcluir !== null}
        title="Excluir grade?"
        message={`A grade "${gradeParaExcluir?.nome}" e toda sua programação serão apagadas. Terminais que usam essa grade ficam sem programação atribuída. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="danger"
        loading={excluindo}
        onClose={() => setGradeParaExcluir(null)}
        onConfirm={handleExcluir}
      />
    </Card>
  );
}
