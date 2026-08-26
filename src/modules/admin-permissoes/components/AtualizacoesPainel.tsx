"use client";

import { useEffect, useState } from "react";
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
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DateInput } from "@/components/ui/DateInput";
import { Drawer } from "@/components/ui/Drawer";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import {
  CORES_TAG_DISPONIVEIS,
  ESTILOS_CORES_TAG,
} from "@/lib/atualizacoes/cores-tag";

import {
  atualizarAtualizacao,
  atualizarTagAtualizacao,
  criarAtualizacao,
  criarTagAtualizacao,
  excluirAtualizacao,
  excluirTagAtualizacao,
  listarAtualizacoesAdmin,
  listarTagsAtualizacao,
} from "../services/adminPermissoes.service";
import type {
  Atualizacao,
  AtualizacaoTag,
  TipoAtualizacaoItem,
} from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

interface AtualizacoesPainelProps {
  onFeedback: FeedbackHandler;
}

const TIPO_ESTILOS: Record<
  TipoAtualizacaoItem,
  { label: string; bg: string; texto: string }
> = {
  novo: { label: "Novo", bg: "rgba(15, 118, 110, 0.1)", texto: "#0f766e" },
  melhoria: {
    label: "Melhoria",
    bg: "var(--tag-red-bg)",
    texto: "var(--tag-red-text)",
  },
  correcao: { label: "Correção", bg: "rgba(146, 64, 14, 0.1)", texto: "#92400e" },
};

function pad2(valor: number): string {
  return String(valor).padStart(2, "0");
}

function agoraData(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function agoraHora(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function separarDataHora(publicadoEmIso: string): {
  data: string;
  hora: string;
} {
  const [data, resto] = publicadoEmIso.split("T");
  return { data: data ?? agoraData(), hora: (resto ?? "00:00").slice(0, 5) };
}

function novaTagInicial() {
  return { chave: "", nome: "", cor: "red", ordem: "0" };
}

interface ItemForm {
  id: string;
  tipo: TipoAtualizacaoItem;
  texto: string;
}

function novoItemForm(): ItemForm {
  return {
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random()),
    tipo: "melhoria",
    texto: "",
  };
}

function novaAtualizacaoInicial(ordem: number) {
  return {
    versao: "",
    titulo: "",
    descricao: "",
    data: agoraData(),
    hora: agoraHora(),
    publicado: true,
    ordem,
    tagIds: [] as string[],
    itens: [novoItemForm()],
  };
}

function alternarIdEmLista(lista: string[], id: string): string[] {
  return lista.includes(id)
    ? lista.filter((item) => item !== id)
    : [...lista, id];
}

function ColorSwatchPicker({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (cor: string) => void;
}) {
  return (
    <Stack direction="row" gap={8} wrap>
      {CORES_TAG_DISPONIVEIS.map((cor) => {
        const estilo = ESTILOS_CORES_TAG[cor];
        const selecionada = cor === valor;

        return (
          <button
            key={cor}
            type="button"
            title={estilo.nome}
            aria-label={estilo.nome}
            aria-pressed={selecionada}
            onClick={() => onChange(cor)}
            className={styles.corSwatch}
            style={{
              background: estilo.dot,
              outline: selecionada ? `2px solid ${estilo.dot}` : "none",
              outlineOffset: selecionada ? "2px" : "0",
              boxShadow: selecionada ? "0 0 0 2px #fff inset" : "none",
            }}
          />
        );
      })}
    </Stack>
  );
}

function TagBadge({ tag }: { tag: Pick<AtualizacaoTag, "nome" | "cor"> }) {
  const estilo =
    ESTILOS_CORES_TAG[tag.cor as keyof typeof ESTILOS_CORES_TAG] ??
    ESTILOS_CORES_TAG.slate;

  return (
    <span
      className={styles.tagBadge}
      style={{
        background: estilo.bg,
        color: estilo.texto,
        borderColor: estilo.borda,
      }}
    >
      {tag.nome}
    </span>
  );
}

const OPCOES_TIPO_ITEM = (Object.keys(TIPO_ESTILOS) as TipoAtualizacaoItem[]).map((tipo) => ({
  value: tipo,
  label: TIPO_ESTILOS[tipo].label,
}));

function SelectTipoItem({
  valor,
  onChange,
}: {
  valor: TipoAtualizacaoItem;
  onChange: (tipo: TipoAtualizacaoItem) => void;
}) {
  return (
    <div className={styles.tipoSelect}>
      <Dropdown
        value={valor}
        options={OPCOES_TIPO_ITEM}
        onValueChange={(novoValor) => onChange(novoValor as TipoAtualizacaoItem)}
      />
    </div>
  );
}

function ItemFormRow({
  item,
  podeRemover,
  onTipoChange,
  onTextoChange,
  onRemover,
}: {
  item: ItemForm;
  podeRemover: boolean;
  onTipoChange: (tipo: TipoAtualizacaoItem) => void;
  onTextoChange: (texto: string) => void;
  onRemover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={styles.itemFormRow}>
      <IconButton
        icon={<GripVertical size={15} />}
        label="Arrastar para reordenar item"
        size="small"
        className={styles.alcaArrastar}
        {...attributes}
        {...listeners}
      />

      <SelectTipoItem valor={item.tipo} onChange={onTipoChange} />

      <Input
        value={item.texto}
        placeholder="Descreva o item..."
        className={styles.itemFormTexto}
        onChange={(event) => onTextoChange(event.target.value)}
      />

      <IconButton
        icon={<Trash2 size={15} />}
        label="Remover item"
        size="small"
        variant="danger"
        onClick={onRemover}
        disabled={!podeRemover}
      />
    </div>
  );
}

function AtualizacaoLinha({
  atualizacao,
  onEditar,
  onExcluir,
}: {
  atualizacao: Atualizacao;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: atualizacao.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={styles.atualizacaoLinha}>
      <IconButton
        icon={<GripVertical size={16} />}
        label="Arrastar para reordenar"
        className={styles.alcaArrastar}
        {...attributes}
        {...listeners}
      />

      <div className={styles.atualizacaoLinhaInfo}>
        <Stack direction="row" gap={8} align="center" wrap>
          <strong>{atualizacao.versao}</strong>
          <span>{atualizacao.titulo}</span>
          {atualizacao.publicado ? (
            <Badge variant="success">Publicado</Badge>
          ) : (
            <Badge variant="warning">Rascunho</Badge>
          )}
        </Stack>

        <Stack direction="row" gap={6} wrap>
          {atualizacao.tags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} />
          ))}
        </Stack>
      </div>

      <Stack direction="row" gap={6}>
        <IconButton
          icon={<Pencil size={15} />}
          label="Editar atualização"
          size="small"
          onClick={onEditar}
        />
        <IconButton
          icon={<Trash2 size={15} />}
          label="Excluir atualização"
          size="small"
          variant="danger"
          onClick={onExcluir}
        />
      </Stack>
    </div>
  );
}

export function AtualizacoesPainel({ onFeedback }: AtualizacoesPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [tags, setTags] = useState<AtualizacaoTag[]>([]);
  const [atualizacoes, setAtualizacoes] = useState<Atualizacao[]>([]);

  const [novaTag, setNovaTag] = useState(novaTagInicial());
  const [criandoTag, setCriandoTag] = useState(false);
  const [erroTag, setErroTag] = useState<string | null>(null);

  const [tagEditando, setTagEditando] = useState<AtualizacaoTag | null>(null);
  const [formTagEdicao, setFormTagEdicao] = useState({
    nome: "",
    cor: "red",
    ordem: "0",
  });
  const [salvandoTagEdicao, setSalvandoTagEdicao] = useState(false);
  const [erroTagEdicao, setErroTagEdicao] = useState<string | null>(null);
  const [tagExcluindo, setTagExcluindo] = useState<AtualizacaoTag | null>(null);
  const [confirmandoExclusaoTag, setConfirmandoExclusaoTag] = useState(false);

  const [drawerAberto, setDrawerAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formAtualizacao, setFormAtualizacao] = useState(
    novaAtualizacaoInicial(0)
  );
  const [salvandoAtualizacao, setSalvandoAtualizacao] = useState(false);
  const [erroAtualizacao, setErroAtualizacao] = useState<string | null>(null);

  const [atualizacaoExcluindo, setAtualizacaoExcluindo] =
    useState<Atualizacao | null>(null);
  const [confirmandoExclusaoAtualizacao, setConfirmandoExclusaoAtualizacao] =
    useState(false);

  const sensoresLista = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const sensoresItens = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    async function carregar() {
      const [tagsData, atualizacoesData] = await Promise.all([
        listarTagsAtualizacao(),
        listarAtualizacoesAdmin(),
      ]);
      setTags(tagsData);
      setAtualizacoes(atualizacoesData);
      setCarregando(false);
    }

    carregar();
  }, []);

  const atualizacoesOrdenadas = [...atualizacoes].sort(
    (a, b) => b.ordem - a.ordem
  );

  async function handleReordenarAtualizacoes(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const indiceAntigo = atualizacoesOrdenadas.findIndex(
      (item) => item.id === active.id
    );
    const indiceNovo = atualizacoesOrdenadas.findIndex(
      (item) => item.id === over.id
    );
    if (indiceAntigo === -1 || indiceNovo === -1) return;

    const reordenados = arrayMove(atualizacoesOrdenadas, indiceAntigo, indiceNovo);
    const total = reordenados.length;

    const ordemAnteriorPorId = new Map(
      atualizacoesOrdenadas.map((item) => [item.id, item.ordem])
    );

    const comNovaOrdem = reordenados.map((item, indice) => ({
      ...item,
      ordem: total - 1 - indice,
    }));

    const alterados = comNovaOrdem.filter(
      (item) => item.ordem !== ordemAnteriorPorId.get(item.id)
    );

    setAtualizacoes(comNovaOrdem);

    try {
      const resultados = await Promise.all(
        alterados.map((item) =>
          atualizarAtualizacao(item.id, {
            versao: item.versao,
            titulo: item.titulo,
            descricao: item.descricao,
            publicadoEm: item.publicadoEm,
            publicado: item.publicado,
            ordem: item.ordem,
            tagIds: item.tags.map((tag) => tag.id),
            itens: item.itens.map((i) => ({ tipo: i.tipo, texto: i.texto })),
          })
        )
      );

      if (resultados.some((resultado) => !resultado.ok)) {
        throw new Error("Falha ao salvar parte da nova ordem.");
      }
    } catch {
      onFeedback(
        "danger",
        "Não foi possível salvar a nova ordem",
        "A lista foi restaurada com os dados reais do servidor — tente reordenar novamente."
      );

      setAtualizacoes(await listarAtualizacoesAdmin());
    }
  }

  async function handleCriarTag() {
    setErroTag(null);
    setCriandoTag(true);

    try {
      const resultado = await criarTagAtualizacao({
        chave: novaTag.chave,
        nome: novaTag.nome,
        cor: novaTag.cor,
        ordem: Number(novaTag.ordem) || 0,
      });

      if (resultado.ok && resultado.data) {
        setTags((atual) => [...atual, resultado.data as AtualizacaoTag]);
        setNovaTag(novaTagInicial());
        onFeedback(
          "success",
          "Tag criada",
          `"${resultado.data.nome}" já pode ser usada nas atualizações.`
        );
      } else {
        setErroTag(resultado.message ?? "Não foi possível criar a tag.");
      }
    } finally {
      setCriandoTag(false);
    }
  }

  function abrirEdicaoTag(tag: AtualizacaoTag) {
    setTagEditando(tag);
    setErroTagEdicao(null);
    setFormTagEdicao({ nome: tag.nome, cor: tag.cor, ordem: String(tag.ordem) });
  }

  async function handleSalvarEdicaoTag() {
    if (!tagEditando) return;

    setErroTagEdicao(null);
    setSalvandoTagEdicao(true);

    try {
      const resultado = await atualizarTagAtualizacao(tagEditando.id, {
        nome: formTagEdicao.nome,
        cor: formTagEdicao.cor,
        ordem: Number(formTagEdicao.ordem) || 0,
        ativo: tagEditando.ativo,
      });

      if (resultado.ok && resultado.data) {
        setTags((atual) =>
          atual.map((item) =>
            item.id === tagEditando.id ? (resultado.data as AtualizacaoTag) : item
          )
        );
        onFeedback("success", "Tag atualizada", `"${resultado.data.nome}" foi atualizada.`);
        setTagEditando(null);
      } else {
        setErroTagEdicao(resultado.message ?? "Não foi possível salvar as alterações.");
      }
    } finally {
      setSalvandoTagEdicao(false);
    }
  }

  async function handleConfirmarExclusaoTag() {
    if (!tagExcluindo) return;

    setConfirmandoExclusaoTag(true);

    try {
      const resultado = await excluirTagAtualizacao(tagExcluindo.id);

      if (resultado.ok) {
        setTags((atual) => atual.filter((item) => item.id !== tagExcluindo.id));
        onFeedback("success", "Tag excluída", `"${tagExcluindo.nome}" foi removida.`);
        setTagExcluindo(null);
      } else {
        onFeedback(
          "danger",
          "Não foi possível excluir a tag",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setConfirmandoExclusaoTag(false);
    }
  }

  function abrirNovaAtualizacao() {
    const maxOrdem = atualizacoes.reduce(
      (max, item) => Math.max(max, item.ordem),
      -1
    );
    setEditandoId(null);
    setFormAtualizacao(novaAtualizacaoInicial(maxOrdem + 1));
    setErroAtualizacao(null);
    setDrawerAberto(true);
  }

  function abrirEdicaoAtualizacao(atualizacao: Atualizacao) {
    const { data, hora } = separarDataHora(atualizacao.publicadoEm);

    setEditandoId(atualizacao.id);
    setFormAtualizacao({
      versao: atualizacao.versao,
      titulo: atualizacao.titulo,
      descricao: atualizacao.descricao,
      data,
      hora,
      publicado: atualizacao.publicado,
      ordem: atualizacao.ordem,
      tagIds: atualizacao.tags.map((tag) => tag.id),
      itens: atualizacao.itens.map((item) => ({
        id: item.id,
        tipo: item.tipo,
        texto: item.texto,
      })),
    });
    setErroAtualizacao(null);
    setDrawerAberto(true);
  }

  function adicionarItemForm() {
    setFormAtualizacao((atual) => ({
      ...atual,
      itens: [...atual.itens, novoItemForm()],
    }));
  }

  function removerItemForm(id: string) {
    setFormAtualizacao((atual) => ({
      ...atual,
      itens: atual.itens.filter((item) => item.id !== id),
    }));
  }

  function atualizarItemForm(
    id: string,
    campo: "tipo" | "texto",
    valor: string
  ) {
    setFormAtualizacao((atual) => ({
      ...atual,
      itens: atual.itens.map((item) =>
        item.id === id ? { ...item, [campo]: valor } : item
      ),
    }));
  }

  function handleReordenarItensForm(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setFormAtualizacao((atual) => {
      const indiceAntigo = atual.itens.findIndex((item) => item.id === active.id);
      const indiceNovo = atual.itens.findIndex((item) => item.id === over.id);
      if (indiceAntigo === -1 || indiceNovo === -1) return atual;

      return {
        ...atual,
        itens: arrayMove(atual.itens, indiceAntigo, indiceNovo),
      };
    });
  }

  async function handleSalvarAtualizacao() {
    const itensValidos = formAtualizacao.itens.filter((item) => item.texto.trim());

    if (itensValidos.length === 0) {
      setErroAtualizacao("Adicione ao menos um item com texto preenchido.");
      return;
    }

    setErroAtualizacao(null);
    setSalvandoAtualizacao(true);

    const payload = {
      versao: formAtualizacao.versao,
      titulo: formAtualizacao.titulo,
      descricao: formAtualizacao.descricao,
      publicadoEm: `${formAtualizacao.data}T${formAtualizacao.hora}`,
      publicado: formAtualizacao.publicado,
      ordem: formAtualizacao.ordem,
      tagIds: formAtualizacao.tagIds,
      itens: itensValidos.map((item) => ({ tipo: item.tipo, texto: item.texto })),
    };

    try {
      const resultado = editandoId
        ? await atualizarAtualizacao(editandoId, payload)
        : await criarAtualizacao(payload);

      if (resultado.ok && resultado.data) {
        setAtualizacoes((atual) => {
          if (editandoId) {
            return atual.map((item) =>
              item.id === editandoId ? (resultado.data as Atualizacao) : item
            );
          }
          return [resultado.data as Atualizacao, ...atual];
        });

        onFeedback(
          "success",
          editandoId ? "Atualização salva" : "Atualização publicada",
          `"${resultado.data.titulo}" foi ${editandoId ? "salva" : "publicada"}.`
        );
        setDrawerAberto(false);
      } else {
        setErroAtualizacao(
          resultado.message ?? "Não foi possível salvar a atualização."
        );
      }
    } finally {
      setSalvandoAtualizacao(false);
    }
  }

  async function handleConfirmarExclusaoAtualizacao() {
    if (!atualizacaoExcluindo) return;

    setConfirmandoExclusaoAtualizacao(true);

    try {
      const resultado = await excluirAtualizacao(atualizacaoExcluindo.id);

      if (resultado.ok) {
        setAtualizacoes((atual) =>
          atual.filter((item) => item.id !== atualizacaoExcluindo.id)
        );
        onFeedback(
          "success",
          "Atualização excluída",
          `"${atualizacaoExcluindo.titulo}" foi removida.`
        );
        setAtualizacaoExcluindo(null);
      } else {
        onFeedback(
          "danger",
          "Não foi possível excluir",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setConfirmandoExclusaoAtualizacao(false);
    }
  }

  if (carregando) {
    return <Loader label="Carregando atualizações..." />;
  }

  return (
    <Stack gap={20}>
      <Card
        title="Tags de módulo"
        description="Categorias coloridas usadas para marcar a que parte do portal cada atualização se refere."
      >
        <Stack gap={16}>
          {tags.length > 0 && (
            <Stack direction="row" gap={10} wrap>
              {tags.map((tag) => (
                <Stack key={tag.id} direction="row" gap={4} align="center">
                  <TagBadge tag={tag} />
                  <IconButton
                    icon={<Pencil size={13} />}
                    label={`Editar tag ${tag.nome}`}
                    size="small"
                    onClick={() => abrirEdicaoTag(tag)}
                  />
                  <IconButton
                    icon={<Trash2 size={13} />}
                    label={`Excluir tag ${tag.nome}`}
                    size="small"
                    variant="danger"
                    onClick={() => setTagExcluindo(tag)}
                  />
                </Stack>
              ))}
            </Stack>
          )}

          <FormGrid columns={4}>
            <Field label="Chave" hint='ex: "dashboard-bi"'>
              <Input
                value={novaTag.chave}
                onChange={(event) =>
                  setNovaTag((atual) => ({ ...atual, chave: event.target.value }))
                }
              />
            </Field>

            <Field label="Nome">
              <Input
                value={novaTag.nome}
                onChange={(event) =>
                  setNovaTag((atual) => ({ ...atual, nome: event.target.value }))
                }
              />
            </Field>

            <Field label="Cor">
              <ColorSwatchPicker
                valor={novaTag.cor}
                onChange={(cor) => setNovaTag((atual) => ({ ...atual, cor }))}
              />
            </Field>

            <Field label="Ordem" hint="também pode ser ajustada arrastando a lista — evite repetir o número de outro item">
              <NumberInput
                value={novaTag.ordem}
                onChange={(event) =>
                  setNovaTag((atual) => ({ ...atual, ordem: event.target.value }))
                }
              />
            </Field>
          </FormGrid>

          {erroTag && <Alert variant="danger">{erroTag}</Alert>}

          <Stack direction="row" justify="end">
            <Button
              variant="secondary"
              onClick={handleCriarTag}
              loading={criandoTag}
              disabled={!novaTag.chave || !novaTag.nome}
            >
              <Plus size={16} />
              Nova tag
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card
        title="Atualizações publicadas"
        description="O que os usuários veem em /atualizacoes, mais rascunhos ainda não publicados. Arraste para reordenar a timeline."
        actions={
          <Button onClick={abrirNovaAtualizacao}>
            <Plus size={16} />
            Nova atualização
          </Button>
        }
      >
        <Stack gap={16}>
          {atualizacoesOrdenadas.length === 0 ? (
            <p>Nenhuma atualização cadastrada ainda.</p>
          ) : (
            <DndContext
              sensors={sensoresLista}
              collisionDetection={closestCenter}
              onDragEnd={handleReordenarAtualizacoes}
            >
              <SortableContext
                items={atualizacoesOrdenadas.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <Stack gap={12}>
                  {atualizacoesOrdenadas.map((atualizacao) => (
                    <AtualizacaoLinha
                      key={atualizacao.id}
                      atualizacao={atualizacao}
                      onEditar={() => abrirEdicaoAtualizacao(atualizacao)}
                      onExcluir={() => setAtualizacaoExcluindo(atualizacao)}
                    />
                  ))}
                </Stack>
              </SortableContext>
            </DndContext>
          )}
        </Stack>
      </Card>

      <Modal
        open={tagEditando !== null}
        title="Editar tag"
        size="small"
        onClose={() => setTagEditando(null)}
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={() => setTagEditando(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarEdicaoTag}
              loading={salvandoTagEdicao}
              disabled={!formTagEdicao.nome}
            >
              Salvar
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          <Field label="Nome">
            <Input
              value={formTagEdicao.nome}
              onChange={(event) =>
                setFormTagEdicao((atual) => ({ ...atual, nome: event.target.value }))
              }
            />
          </Field>

          <Field label="Cor">
            <ColorSwatchPicker
              valor={formTagEdicao.cor}
              onChange={(cor) => setFormTagEdicao((atual) => ({ ...atual, cor }))}
            />
          </Field>

          <Field label="Ordem" hint="também pode ser ajustada arrastando a lista — evite repetir o número de outro item">
            <NumberInput
              value={formTagEdicao.ordem}
              onChange={(event) =>
                setFormTagEdicao((atual) => ({ ...atual, ordem: event.target.value }))
              }
            />
          </Field>

          {erroTagEdicao && <Alert variant="danger">{erroTagEdicao}</Alert>}
        </Stack>
      </Modal>

      <Drawer
        open={drawerAberto}
        onClose={() => setDrawerAberto(false)}
        title={editandoId ? "Editar atualização" : "Nova atualização"}
        description="Preencha os dados da entrada do changelog."
        size="large"
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={() => setDrawerAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarAtualizacao}
              loading={salvandoAtualizacao}
              disabled={
                !formAtualizacao.versao ||
                !formAtualizacao.titulo ||
                !formAtualizacao.descricao
              }
            >
              {editandoId ? "Salvar" : "Publicar"}
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          <FormGrid columns={2}>
            <Field label="Versão" hint='ex: "V1.2.0"'>
              <Input
                value={formAtualizacao.versao}
                onChange={(event) =>
                  setFormAtualizacao((atual) => ({
                    ...atual,
                    versao: event.target.value,
                  }))
                }
              />
            </Field>

            <Field label="Título">
              <Input
                value={formAtualizacao.titulo}
                onChange={(event) =>
                  setFormAtualizacao((atual) => ({
                    ...atual,
                    titulo: event.target.value,
                  }))
                }
              />
            </Field>
          </FormGrid>

          <FormGrid columns={2}>
            <Field label="Data de publicação">
              <DateInput
                value={formAtualizacao.data}
                onValueChange={(valor) =>
                  setFormAtualizacao((atual) => ({ ...atual, data: valor }))
                }
              />
            </Field>

            <Field label="Hora">
              <input
                type="time"
                className={styles.horaInput}
                value={formAtualizacao.hora}
                onChange={(event) =>
                  setFormAtualizacao((atual) => ({
                    ...atual,
                    hora: event.target.value,
                  }))
                }
              />
            </Field>
          </FormGrid>

          <Field label="Descrição">
            <Textarea
              rows={3}
              value={formAtualizacao.descricao}
              onChange={(event) =>
                setFormAtualizacao((atual) => ({
                  ...atual,
                  descricao: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Tags">
            <Stack direction="row" gap={16} wrap>
              {tags.map((tag) => (
                <Checkbox
                  key={tag.id}
                  label={tag.nome}
                  checked={formAtualizacao.tagIds.includes(tag.id)}
                  onChange={() =>
                    setFormAtualizacao((atual) => ({
                      ...atual,
                      tagIds: alternarIdEmLista(atual.tagIds, tag.id),
                    }))
                  }
                />
              ))}
            </Stack>
          </Field>

          <Switch
            label="Publicado"
            hint="quando desligado, fica salvo como rascunho — só o admin vê"
            checked={formAtualizacao.publicado}
            onChange={(event) =>
              setFormAtualizacao((atual) => ({
                ...atual,
                publicado: event.target.checked,
              }))
            }
          />

          <Field label="Itens do changelog">
            <DndContext
              sensors={sensoresItens}
              collisionDetection={closestCenter}
              onDragEnd={handleReordenarItensForm}
            >
              <SortableContext
                items={formAtualizacao.itens.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <Stack gap={10}>
                  {formAtualizacao.itens.map((item) => (
                    <ItemFormRow
                      key={item.id}
                      item={item}
                      podeRemover={formAtualizacao.itens.length > 1}
                      onTipoChange={(tipo) => atualizarItemForm(item.id, "tipo", tipo)}
                      onTextoChange={(texto) =>
                        atualizarItemForm(item.id, "texto", texto)
                      }
                      onRemover={() => removerItemForm(item.id)}
                    />
                  ))}
                </Stack>
              </SortableContext>
            </DndContext>

            <Stack direction="row" justify="end" style={{ marginTop: 10 }}>
              <Button variant="secondary" onClick={adicionarItemForm}>
                <Plus size={16} />
                Adicionar item
              </Button>
            </Stack>
          </Field>

          {erroAtualizacao && <Alert variant="danger">{erroAtualizacao}</Alert>}
        </Stack>
      </Drawer>

      <ConfirmDialog
        open={tagExcluindo !== null}
        title="Excluir tag"
        message={
          <>
            Tem certeza que deseja excluir a tag{" "}
            <strong>{tagExcluindo?.nome}</strong>? Só é possível excluir tags
            que não estejam em uso em nenhuma atualização.
          </>
        }
        confirmLabel="Excluir"
        variant="danger"
        loading={confirmandoExclusaoTag}
        onClose={() => setTagExcluindo(null)}
        onConfirm={handleConfirmarExclusaoTag}
      />

      <ConfirmDialog
        open={atualizacaoExcluindo !== null}
        title="Excluir atualização"
        message={
          <>
            Tem certeza que deseja excluir{" "}
            <strong>
              {atualizacaoExcluindo?.versao} — {atualizacaoExcluindo?.titulo}
            </strong>
            ? Ela some da tela de atualizações imediatamente.
          </>
        }
        confirmLabel="Excluir"
        variant="danger"
        loading={confirmandoExclusaoAtualizacao}
        onClose={() => setAtualizacaoExcluindo(null)}
        onConfirm={handleConfirmarExclusaoAtualizacao}
      />
    </Stack>
  );
}
