"use client";

import { Fragment, useEffect, useState } from "react";
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
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, Copy, FileText, Globe, Plus, Trash2, Video } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
import styles from "./GradesTvPainel.module.css";
import { SeletorMidiaModal } from "./SeletorMidiaModal";

interface GradesTvPainelProps {
  onFeedback: FeedbackHandler;
}

interface ItemEditavel {
  chave: string;
  tipoConteudo: TipoConteudoTv;
  midiaId: string | null;
  urlPaginaWeb: string;
  duracaoSegundos: number;
  /*
   * Agendamento próprio do item, opcional — "todos"/00:00-23:59
   * (padrão de novoItem()) significa "sem restrição além da janela do
   * slot"; um item pode ser restringido pra só aparecer em dias/horas
   * específicos DENTRO da janela do slot (ver estaNaJanela em
   * src/lib/tv/grades.ts).
   */
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
}

interface SlotEditavel {
  chave: string;
  nome: string;
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
  itens: ItemEditavel[];
}

interface PreviewConteudo {
  tipoConteudo: TipoConteudoTv;
  midia: MidiaTv | null;
  urlPaginaWeb: string;
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

function formatarDuracaoHMS(totalSegundos: number): string {
  const h = Math.floor(totalSegundos / 3600);
  const m = Math.floor((totalSegundos % 3600) / 60);
  const s = totalSegundos % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function resumoAgendaItem(diasSemana: string, horaInicio: string, horaFim: string): string {
  const semRestricao = diasSemana === "todos" && horaInicio === "00:00" && horaFim === "23:59";
  if (semRestricao) return "Todo dia";

  const diasTexto =
    diasSemana === "todos"
      ? "Todo dia"
      : diasSemana
          .split(",")
          .map((d) => DIAS.find((dia) => dia.valor === Number(d))?.label ?? d)
          .join(", ");

  return `${diasTexto}, ${horaInicio}–${horaFim}`;
}

function IconeTipoConteudo({ tipo }: { tipo: TipoConteudoTv }) {
  if (tipo === "video") return <Video size={28} />;
  if (tipo === "documento") return <FileText size={28} />;
  if (tipo === "pagina_web") return <Globe size={28} />;
  return <FileText size={28} />;
}

function novoItem(): ItemEditavel {
  return {
    chave: crypto.randomUUID(),
    tipoConteudo: "foto",
    midiaId: null,
    urlPaginaWeb: "",
    duracaoSegundos: 15,
    diasSemana: "todos",
    horaInicio: "00:00",
    horaFim: "23:59",
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

function ItemPlaylistCard({
  item,
  midias,
  tempoInicioAcumulado,
  onAlterar,
  onRemover,
  onDuplicar,
  onInserirAntes,
  onPreview,
}: {
  item: ItemEditavel;
  midias: MidiaTv[];
  tempoInicioAcumulado: number;
  onAlterar: (item: ItemEditavel) => void;
  onRemover: () => void;
  onDuplicar: () => void;
  onInserirAntes: () => void;
  onPreview: (conteudo: PreviewConteudo) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.chave,
  });
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [agendaAberta, setAgendaAberta] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const midiaSelecionada = midias.find((midia) => midia.id === item.midiaId) ?? null;
  const temConteudoPreview = midiaSelecionada !== null || item.urlPaginaWeb.trim() !== "";

  function abrirPreview() {
    onPreview({ tipoConteudo: item.tipoConteudo, midia: midiaSelecionada, urlPaginaWeb: item.urlPaginaWeb });
  }

  return (
    <div ref={setNodeRef} style={style} className={styles.card}>
      <div className={styles.cardHeader} {...attributes} {...listeners}>
        <IconButton
          icon={<Trash2 size={13} />}
          label="Remover item"
          size="small"
          variant="danger"
          onClick={onRemover}
        />
        <IconButton
          icon={<Copy size={13} />}
          label="Duplicar item"
          size="small"
          variant="neutral"
          onClick={onDuplicar}
        />
        <button type="button" className={styles.inserirAntes} onClick={onInserirAntes}>
          <Plus size={12} />
          Inserir à frente
        </button>
      </div>

      <button
        type="button"
        className={styles.thumb}
        onClick={abrirPreview}
        disabled={!temConteudoPreview}
        title={temConteudoPreview ? "Visualizar" : undefined}
      >
        {item.tipoConteudo === "foto" && midiaSelecionada ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura de mídia vinda de disco, não do pipeline de otimização do Next
          <img src={`/api/tv/midias/${midiaSelecionada.id}/arquivo`} alt="" />
        ) : (
          <IconeTipoConteudo tipo={item.tipoConteudo} />
        )}
      </button>

      <div className={styles.corpo}>
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

        {item.tipoConteudo === "pagina_web" ? (
          <Input
            value={item.urlPaginaWeb}
            placeholder="https://..."
            onChange={(event) => onAlterar({ ...item, urlPaginaWeb: event.target.value })}
          />
        ) : (
          <>
            <Button variant="secondary" onClick={() => setSeletorAberto(true)}>
              {midiaSelecionada ? "Trocar mídia" : "Selecionar mídia..."}
            </Button>
            <SeletorMidiaModal
              open={seletorAberto}
              tipo={item.tipoConteudo}
              midias={midias}
              onClose={() => setSeletorAberto(false)}
              onSelecionar={(midiaId) => {
                onAlterar({ ...item, midiaId });
                setSeletorAberto(false);
              }}
            />
          </>
        )}

        <span className={styles.labelPeriodo}>Duração</span>
        <NumberInput
          value={String(item.duracaoSegundos)}
          min={1}
          suffix="s"
          onChange={(event) =>
            onAlterar({ ...item, duracaoSegundos: Number(event.target.value) || 1 })
          }
        />

        <button
          type="button"
          className={styles.botaoPeriodoExibicao}
          onClick={() => setAgendaAberta(true)}
        >
          Período de exibição: {resumoAgendaItem(item.diasSemana, item.horaInicio, item.horaFim)}
        </button>

        <Modal
          open={agendaAberta}
          onClose={() => setAgendaAberta(false)}
          title="Período de exibição do item"
          description="Restringe esse item a só aparecer em dias/horários específicos, dentro da janela do slot."
          size="small"
        >
          <Stack gap={16}>
            <CampoDiasHorario
              diasSemana={item.diasSemana}
              horaInicio={item.horaInicio}
              horaFim={item.horaFim}
              idPrefix={`item-${item.chave}`}
              onAlterarDias={(dias) => onAlterar({ ...item, diasSemana: dias })}
              onAlterarHoraInicio={(hora) => onAlterar({ ...item, horaInicio: hora })}
              onAlterarHoraFim={(hora) => onAlterar({ ...item, horaFim: hora })}
            />
            <Stack direction="row" justify="end">
              <Button onClick={() => setAgendaAberta(false)}>Concluído</Button>
            </Stack>
          </Stack>
        </Modal>

        <span className={styles.nomeArquivo} title={midiaSelecionada?.nomeOriginal}>
          {midiaSelecionada?.nomeOriginal ?? (item.tipoConteudo === "pagina_web" ? "Página web" : "—")}
        </span>
      </div>

      <div className={styles.barraTempo}>{formatarDuracaoHMS(tempoInicioAcumulado)}</div>
    </div>
  );
}

/*
 * Dias da semana + hora início/fim — mesmo controle usado tanto pela
 * janela do slot (dia/horário em que ele vale) quanto, opcionalmente,
 * por um item específico dentro dele (ver ItemPlaylistCard).
 */
function CampoDiasHorario({
  diasSemana,
  horaInicio,
  horaFim,
  idPrefix,
  onAlterarDias,
  onAlterarHoraInicio,
  onAlterarHoraFim,
}: {
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
  idPrefix: string;
  onAlterarDias: (dias: string) => void;
  onAlterarHoraInicio: (hora: string) => void;
  onAlterarHoraFim: (hora: string) => void;
}) {
  const diasSelecionados = diasSemana === "todos" ? [] : diasSemana.split(",").map(Number);

  function alternarDia(dia: number) {
    if (diasSemana === "todos") {
      onAlterarDias(String(dia));
      return;
    }

    const jaTem = diasSelecionados.includes(dia);
    const novaLista = jaTem
      ? diasSelecionados.filter((d) => d !== dia)
      : [...diasSelecionados, dia].sort();

    onAlterarDias(novaLista.length > 0 ? novaLista.join(",") : String(dia));
  }

  return (
    <Stack gap={16}>
      <Field label="Dias da semana">
        <Stack direction="row" gap={6} wrap>
          <Switch
            compact
            label="Todos os dias"
            checked={diasSemana === "todos"}
            onChange={(event) => onAlterarDias(event.target.checked ? "todos" : "1,2,3,4,5")}
          />
          {diasSemana !== "todos" &&
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
        <Field label="Hora início" htmlFor={`${idPrefix}-inicio`}>
          <input
            id={`${idPrefix}-inicio`}
            type="time"
            value={horaInicio}
            onChange={(event) => onAlterarHoraInicio(event.target.value)}
          />
        </Field>
        <Field label="Hora fim" htmlFor={`${idPrefix}-fim`}>
          <input
            id={`${idPrefix}-fim`}
            type="time"
            value={horaFim}
            onChange={(event) => onAlterarHoraFim(event.target.value)}
          />
        </Field>
      </Stack>
    </Stack>
  );
}

function SlotEditor({
  slot,
  midias,
  onAlterar,
  onRemover,
  onPreview,
}: {
  slot: SlotEditavel;
  midias: MidiaTv[];
  onAlterar: (slot: SlotEditavel) => void;
  onRemover: () => void;
  onPreview: (conteudo: PreviewConteudo) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = slot.itens.findIndex((item) => item.chave === active.id);
    const newIndex = slot.itens.findIndex((item) => item.chave === over.id);

    onAlterar({ ...slot, itens: arrayMove(slot.itens, oldIndex, newIndex) });
  }

  function handleDuplicarItem(indice: number) {
    const copia: ItemEditavel = { ...slot.itens[indice], chave: crypto.randomUUID() };
    const novaLista = [...slot.itens];
    novaLista.splice(indice + 1, 0, copia);
    onAlterar({ ...slot, itens: novaLista });
  }

  function handleInserirAntes(indice: number) {
    const novaLista = [...slot.itens];
    novaLista.splice(indice, 0, novoItem());
    onAlterar({ ...slot, itens: novaLista });
  }

  const duracaoTotalSegundos = slot.itens.reduce((soma, item) => soma + item.duracaoSegundos, 0);

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

        <CampoDiasHorario
          diasSemana={slot.diasSemana}
          horaInicio={slot.horaInicio}
          horaFim={slot.horaFim}
          idPrefix={`slot-${slot.chave}`}
          onAlterarDias={(dias) => onAlterar({ ...slot, diasSemana: dias })}
          onAlterarHoraInicio={(hora) => onAlterar({ ...slot, horaInicio: hora })}
          onAlterarHoraFim={(hora) => onAlterar({ ...slot, horaFim: hora })}
        />

        <Field label="Playlist">
          <Stack gap={10}>
            <div className={styles.cabecalhoComposicao}>
              <span>Composição da grade de programação.</span>
              <span>
                Total: <strong>{slot.itens.length}</strong> mídias adicionadas, tempo total:{" "}
                <strong>{formatarDuracaoHMS(duracaoTotalSegundos)}</strong>
              </span>
            </div>

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
                  strategy={horizontalListSortingStrategy}
                >
                  <div className={styles.tiraCards}>
                    {slot.itens.map((item, indice) => (
                      <ItemPlaylistCard
                        key={item.chave}
                        item={item}
                        midias={midias}
                        tempoInicioAcumulado={slot.itens
                          .slice(0, indice)
                          .reduce((soma, i) => soma + i.duracaoSegundos, 0)}
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
                        onDuplicar={() => handleDuplicarItem(indice)}
                        onInserirAntes={() => handleInserirAntes(indice)}
                        onPreview={onPreview}
                      />
                    ))}
                  </div>
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

  const [gradeEmEdicaoId, setGradeEmEdicaoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [ativaEdicao, setAtivaEdicao] = useState(true);
  const [slots, setSlots] = useState<SlotEditavel[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [preview, setPreview] = useState<PreviewConteudo | null>(null);

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

  async function handleAlternarEdicao(grade: GradeTv) {
    if (gradeEmEdicaoId === grade.id) {
      setGradeEmEdicaoId(null);
      return;
    }

    setGradeEmEdicaoId(grade.id);
    setNomeEdicao(grade.nome);
    setAtivaEdicao(grade.ativa);
    setSlots([]);

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
          diasSemana: item.diasSemana,
          horaInicio: item.horaInicio.slice(0, 5),
          horaFim: item.horaFim.slice(0, 5),
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
            diasSemana: item.diasSemana,
            horaInicio: item.horaInicio,
            horaFim: item.horaFim,
          })),
        }))
      );

      if (slotsResultado.ok) {
        onFeedback("success", "Grade salva", "A programação foi salva.");
        setGradeEmEdicaoId(null);
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
            {grades.map((grade) => {
              const expandida = gradeEmEdicaoId === grade.id;

              return (
                <Fragment key={grade.id}>
                  <TableRow>
                    <TableCell>
                      <button
                        type="button"
                        className={styles.linhaClicavel}
                        onClick={() => handleAlternarEdicao(grade)}
                      >
                        {expandida ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        {grade.nome}
                      </button>
                    </TableCell>
                    <TableCell align="center">
                      <Badge variant={grade.ativa ? "success" : "neutral"}>
                        {grade.ativa ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        icon={<Trash2 size={15} />}
                        label="Excluir grade"
                        size="small"
                        variant="danger"
                        onClick={() => setGradeParaExcluir(grade)}
                      />
                    </TableCell>
                  </TableRow>

                  {expandida && (
                    <TableRow>
                      <TableCell colSpan={3}>
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
                            <Field label="Status">
                              <Switch
                                compact
                                label="Ativa"
                                checked={ativaEdicao}
                                onChange={(event) => setAtivaEdicao(event.target.checked)}
                              />
                            </Field>
                          </Stack>

                          {slots.map((slot) => (
                            <SlotEditor
                              key={slot.chave}
                              slot={slot}
                              midias={midias}
                              onPreview={setPreview}
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
                            <Button
                              variant="secondary"
                              onClick={() => setSlots((atual) => [...atual, novoSlot()])}
                            >
                              <Plus size={15} />
                              Adicionar slot
                            </Button>
                          </Stack>

                          <Stack direction="row" justify="end" gap={8}>
                            <Button variant="secondary" onClick={() => setGradeEmEdicaoId(null)}>
                              Cancelar
                            </Button>
                            <Button onClick={handleSalvarEdicao} loading={salvando}>
                              Salvar
                            </Button>
                          </Stack>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
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

      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title="Pré-visualização"
        size="large"
      >
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
          {preview?.tipoConteudo === "foto" && preview.midia && (
            // eslint-disable-next-line @next/next/no-img-element -- preview de mídia vinda de disco, não do pipeline de otimização do Next
            <img
              src={`/api/tv/midias/${preview.midia.id}/arquivo`}
              alt=""
              style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
            />
          )}
          {preview?.tipoConteudo === "video" && preview.midia && (
            <video
              src={`/api/tv/midias/${preview.midia.id}/arquivo`}
              controls
              autoPlay
              style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 8 }}
            />
          )}
          {preview?.tipoConteudo === "documento" && preview.midia && (
            <iframe
              src={`/api/tv/midias/${preview.midia.id}/arquivo`}
              title="Documento"
              style={{ width: "100%", height: "70vh", border: "none", borderRadius: 8 }}
            />
          )}
          {preview?.tipoConteudo === "pagina_web" && preview.urlPaginaWeb.trim() && (
            <iframe
              src={preview.urlPaginaWeb}
              title="Página web"
              style={{ width: "100%", height: "70vh", border: "none", borderRadius: 8 }}
            />
          )}
          {preview &&
            ((preview.tipoConteudo !== "pagina_web" && !preview.midia) ||
              (preview.tipoConteudo === "pagina_web" && !preview.urlPaginaWeb.trim())) && (
              <p>Nenhum conteúdo selecionado ainda pra este item.</p>
            )}
        </div>
      </Modal>

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
