"use client";

import { useMemo, useState } from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { BookOpen, Plus } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { Switch } from "@/components/ui/Switch";
import type { WikiArtigo } from "@/modules/wiki/types/wiki.types";

import {
  atualizarWikiArtigo,
  criarWikiArtigo,
  excluirWikiArtigo,
  listarWikiArtigosAdmin,
} from "../services/adminPermissoes.service";
import type { PortalModulo } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import { WikiArtigoRow } from "./WikiArtigoRow";

interface WikiPainelProps {
  artigos: WikiArtigo[];
  modulos: PortalModulo[];
  onArtigoCriado: (artigo: WikiArtigo) => void;
  onArtigoAtualizado: (artigo: WikiArtigo) => void;
  onArtigoExcluido: (id: string) => void;
  onArtigosRecarregados: (artigos: WikiArtigo[]) => void;
  onFeedback: FeedbackHandler;
}

interface FormularioArtigo {
  titulo: string;
  moduloId: string;
  conteudo: string;
  privadoAdmin: boolean;
  ativo: boolean;
}

const formularioInicial: FormularioArtigo = {
  titulo: "",
  moduloId: "",
  conteudo: "",
  privadoAdmin: false,
  ativo: true,
};

const GRUPO_GERAL = "geral";

interface GrupoArtigos {
  chave: string;
  titulo: string;
  artigos: WikiArtigo[];
}

function agruparPorModulo(artigos: WikiArtigo[]): GrupoArtigos[] {
  const mapa = new Map<string, GrupoArtigos>();

  for (const artigo of artigos) {
    const chave = artigo.moduloId ?? GRUPO_GERAL;
    const titulo = artigo.moduloNome ?? "Geral (todo o sistema)";

    if (!mapa.has(chave)) {
      mapa.set(chave, { chave, titulo, artigos: [] });
    }

    mapa.get(chave)?.artigos.push(artigo);
  }

  for (const grupo of mapa.values()) {
    grupo.artigos.sort((a, b) => a.ordem - b.ordem);
  }

  return Array.from(mapa.values()).sort((a, b) => {
    if (a.chave === GRUPO_GERAL) return -1;
    if (b.chave === GRUPO_GERAL) return 1;
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });
}

export function WikiPainel({
  artigos,
  modulos,
  onArtigoCriado,
  onArtigoAtualizado,
  onArtigoExcluido,
  onArtigosRecarregados,
  onFeedback,
}: WikiPainelProps) {
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<FormularioArtigo>(formularioInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<WikiArtigo | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [alterandoAtivoId, setAlterandoAtivoId] = useState<string | null>(null);

  const grupos = useMemo(() => agruparPorModulo(artigos), [artigos]);

  const opcoesModulo = useMemo(
    () => [
      { value: "", label: "Geral (todo o sistema)" },
      ...modulos
        .filter((modulo) => modulo.ativo)
        .map((modulo) => ({ value: modulo.id, label: modulo.nome })),
    ],
    [modulos]
  );

  function abrirNovo() {
    setEditandoId(null);
    setFormulario(formularioInicial);
    setErro(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(artigo: WikiArtigo) {
    setEditandoId(artigo.id);
    setFormulario({
      titulo: artigo.titulo,
      moduloId: artigo.moduloId ?? "",
      conteudo: artigo.conteudo,
      privadoAdmin: artigo.privadoAdmin,
      ativo: artigo.ativo,
    });
    setErro(null);
    setDrawerAberto(true);
  }

  async function handleSalvar() {
    const tituloLimpo = formulario.titulo.trim();
    const conteudoLimpo = formulario.conteudo.trim();

    if (!tituloLimpo) {
      setErro("Preencha o título do artigo.");
      return;
    }

    if (!conteudoLimpo || conteudoLimpo === "<p></p>") {
      setErro("Escreva o conteúdo do artigo.");
      return;
    }

    setErro(null);
    setSalvando(true);

    try {
      const dados = {
        titulo: tituloLimpo,
        conteudo: formulario.conteudo,
        moduloId: formulario.moduloId || null,
        privadoAdmin: formulario.privadoAdmin,
        ativo: formulario.ativo,
      };

      const resultado = editandoId
        ? await atualizarWikiArtigo(editandoId, dados)
        : await criarWikiArtigo(dados);

      if (resultado.ok && resultado.data) {
        if (editandoId) {
          onArtigoAtualizado(resultado.data);
          onFeedback("success", "Artigo atualizado", `"${resultado.data.titulo}" foi salvo.`);
        } else {
          onArtigoCriado(resultado.data);
          onFeedback("success", "Artigo criado", `"${resultado.data.titulo}" foi publicado.`);
        }
        setDrawerAberto(false);
      } else {
        setErro(resultado.message ?? "Não foi possível salvar o artigo.");
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleAlternarAtivo(artigo: WikiArtigo, ativo: boolean) {
    setAlterandoAtivoId(artigo.id);

    try {
      const resultado = await atualizarWikiArtigo(artigo.id, { ativo });

      if (resultado.ok && resultado.data) {
        onArtigoAtualizado(resultado.data);
      } else {
        onFeedback(
          "danger",
          "Não foi possível atualizar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setAlterandoAtivoId(null);
    }
  }

  async function handleReordenarGrupo(grupo: GrupoArtigos, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const indiceAntigo = grupo.artigos.findIndex((item) => item.id === active.id);
    const indiceNovo = grupo.artigos.findIndex((item) => item.id === over.id);
    if (indiceAntigo === -1 || indiceNovo === -1) return;

    const reordenados = arrayMove(grupo.artigos, indiceAntigo, indiceNovo);
    const comNovaOrdem = reordenados.map((item, indice) => ({ ...item, ordem: indice }));
    const alterados = comNovaOrdem.filter(
      (item, indice) => item.ordem !== grupo.artigos[indice]?.ordem
    );

    comNovaOrdem.forEach((item) => onArtigoAtualizado(item));

    try {
      const resultados = await Promise.all(
        alterados.map((item) => atualizarWikiArtigo(item.id, { ordem: item.ordem }))
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

      onArtigosRecarregados(await listarWikiArtigosAdmin());
    }
  }

  async function handleConfirmarExclusao() {
    if (!excluindo) return;

    setConfirmandoExclusao(true);

    try {
      const resultado = await excluirWikiArtigo(excluindo.id);

      if (resultado.ok) {
        onArtigoExcluido(excluindo.id);
        onFeedback("success", "Artigo excluído", `"${excluindo.titulo}" foi removido.`);
        setExcluindo(null);
      } else {
        onFeedback(
          "danger",
          "Não foi possível excluir o artigo",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setConfirmandoExclusao(false);
    }
  }

  return (
    <Stack gap={20}>
      <Card
        title="Wiki"
        description="Artigos de apoio mostrados aos usuários de acordo com os módulos que eles têm acesso."
        actions={
          <Button onClick={abrirNovo}>
            <Plus size={16} />
            Novo artigo
          </Button>
        }
      >
        {artigos.length === 0 && (
          <EmptyState
            icon={<BookOpen size={28} />}
            title="Nenhum artigo cadastrado"
            description='Clique em "Novo artigo" para publicar o primeiro conteúdo do wiki.'
          />
        )}
      </Card>

      {grupos.map((grupo) => (
        <GrupoWikiCard
          key={grupo.chave}
          grupo={grupo}
          alterandoAtivoId={alterandoAtivoId}
          onAlternarAtivo={handleAlternarAtivo}
          onEditar={abrirEdicao}
          onExcluir={setExcluindo}
          onReordenar={(event) => handleReordenarGrupo(grupo, event)}
        />
      ))}

      <Drawer
        open={drawerAberto}
        onClose={() => setDrawerAberto(false)}
        title={editandoId ? "Editar artigo" : "Novo artigo"}
        description="Escolha a quem esse conteúdo deve aparecer e escreva o artigo."
        size="large"
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={() => setDrawerAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} loading={salvando}>
              Salvar
            </Button>
          </Stack>
        }
      >
        <Stack gap={18}>
          <Field label="Título" required>
            <Input
              value={formulario.titulo}
              onChange={(event) =>
                setFormulario((atual) => ({ ...atual, titulo: event.target.value }))
              }
            />
          </Field>

          <Field
            label="Módulo referenciado"
            hint="define quem enxerga o artigo: só quem já tem acesso a esse módulo (ou todo mundo, se for geral)"
          >
            <Dropdown
              value={formulario.moduloId}
              options={opcoesModulo}
              onValueChange={(valor) =>
                setFormulario((atual) => ({ ...atual, moduloId: valor }))
              }
            />
          </Field>

          <Checkbox
            label="Privado para administradores"
            hint="mesmo que o módulo seja acessível a todos, só administradores verão este artigo"
            checked={formulario.privadoAdmin}
            onChange={(event) =>
              setFormulario((atual) => ({ ...atual, privadoAdmin: event.target.checked }))
            }
          />

          <Field label="Conteúdo" required>
            <RichTextEditor
              value={formulario.conteudo}
              onChange={(html) => setFormulario((atual) => ({ ...atual, conteudo: html }))}
            />
          </Field>

          {editandoId && (
            <Switch
              label={formulario.ativo ? "Visível no wiki" : "Oculto"}
              checked={formulario.ativo}
              onChange={(event) =>
                setFormulario((atual) => ({ ...atual, ativo: event.target.checked }))
              }
            />
          )}

          {erro && <Alert variant="danger">{erro}</Alert>}
        </Stack>
      </Drawer>

      <ConfirmDialog
        open={excluindo !== null}
        title="Excluir artigo"
        variant="danger"
        message={`Tem certeza que deseja excluir "${excluindo?.titulo}"? Ele deixa de aparecer no wiki imediatamente.`}
        confirmLabel="Excluir"
        loading={confirmandoExclusao}
        onClose={() => setExcluindo(null)}
        onConfirm={handleConfirmarExclusao}
      />
    </Stack>
  );
}

function GrupoWikiCard({
  grupo,
  alterandoAtivoId,
  onAlternarAtivo,
  onEditar,
  onExcluir,
  onReordenar,
}: {
  grupo: GrupoArtigos;
  alterandoAtivoId: string | null;
  onAlternarAtivo: (artigo: WikiArtigo, ativo: boolean) => void;
  onEditar: (artigo: WikiArtigo) => void;
  onExcluir: (artigo: WikiArtigo) => void;
  onReordenar: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <Card title={grupo.titulo} description={`${grupo.artigos.length} artigo(s)`}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onReordenar}>
        <SortableContext
          items={grupo.artigos.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <Table minWidth={640}>
            <TableHead>
              <TableRow>
                <TableHeaderCell align="center">Ordem</TableHeaderCell>
                <TableHeaderCell>Título</TableHeaderCell>
                <TableHeaderCell align="center">Privado</TableHeaderCell>
                <TableHeaderCell align="center">Ativo</TableHeaderCell>
                <TableHeaderCell align="center">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {grupo.artigos.map((artigo) => (
                <WikiArtigoRow
                  key={artigo.id}
                  artigo={artigo}
                  alterandoAtivo={alterandoAtivoId === artigo.id}
                  onAlternarAtivo={(ativo) => onAlternarAtivo(artigo, ativo)}
                  onEditar={() => onEditar(artigo)}
                  onExcluir={() => onExcluir(artigo)}
                />
              ))}
            </TableBody>
          </Table>
        </SortableContext>
      </DndContext>
    </Card>
  );
}
