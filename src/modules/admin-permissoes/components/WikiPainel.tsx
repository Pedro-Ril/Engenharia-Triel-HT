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
import { BookOpen, Plus, X } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
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
import type { WikiArtigo, WikiTopico } from "@/modules/wiki/types/wiki.types";

import {
  atualizarWikiArtigo,
  atualizarWikiTopico,
  criarWikiArtigo,
  criarWikiTopico,
  excluirWikiArtigo,
  excluirWikiTopico,
  listarWikiArtigosAdmin,
  uploadWikiImagem,
} from "../services/adminPermissoes.service";
import type { PortalModulo } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import { WikiArtigoRow } from "./WikiArtigoRow";

interface WikiPainelProps {
  artigos: WikiArtigo[];
  modulos: PortalModulo[];
  topicos: WikiTopico[];
  onArtigoCriado: (artigo: WikiArtigo) => void;
  onArtigoAtualizado: (artigo: WikiArtigo) => void;
  onArtigoExcluido: (id: string) => void;
  onArtigosRecarregados: (artigos: WikiArtigo[]) => void;
  onTopicoCriado: (topico: WikiTopico) => void;
  onTopicoAtualizado: (topico: WikiTopico) => void;
  onTopicoExcluido: (id: string) => void;
  onFeedback: FeedbackHandler;
}

interface FormularioArtigo {
  titulo: string;
  moduloId: string;
  topicoId: string;
  conteudo: string;
  privadoAdmin: boolean;
  ativo: boolean;
}

const formularioInicial: FormularioArtigo = {
  titulo: "",
  moduloId: "",
  topicoId: "",
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
  topicos,
  onArtigoCriado,
  onArtigoAtualizado,
  onArtigoExcluido,
  onArtigosRecarregados,
  onTopicoCriado,
  onTopicoAtualizado,
  onTopicoExcluido,
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
  const [excluindoTopico, setExcluindoTopico] = useState<WikiTopico | null>(null);
  const [criandoTopico, setCriandoTopico] = useState(false);
  const [novoTopicoNome, setNovoTopicoNome] = useState("");

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

  const opcoesTopico = useMemo(
    () => [
      { value: "", label: "Nenhum" },
      ...topicos.map((topico) => ({ value: topico.id, label: topico.nome })),
    ],
    [topicos]
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
      topicoId: artigo.topicoId ?? "",
      conteudo: artigo.conteudo,
      privadoAdmin: artigo.privadoAdmin,
      ativo: artigo.ativo,
    });
    setErro(null);
    setDrawerAberto(true);
  }

  async function handleCriarTopico() {
    const nome = novoTopicoNome.trim();
    if (!nome) return;

    setCriandoTopico(true);

    try {
      const resultado = await criarWikiTopico({ nome, icone: null });

      if (resultado.ok && resultado.data) {
        onTopicoCriado(resultado.data);
        setNovoTopicoNome("");
      } else {
        onFeedback(
          "danger",
          "Não foi possível criar o tópico",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setCriandoTopico(false);
    }
  }

  async function handleRenomearTopico(topico: WikiTopico) {
    const nome = window.prompt("Novo nome do tópico:", topico.nome);
    if (!nome || !nome.trim() || nome.trim() === topico.nome) return;

    const resultado = await atualizarWikiTopico(topico.id, { nome: nome.trim() });

    if (resultado.ok && resultado.data) {
      onTopicoAtualizado(resultado.data);
    } else {
      onFeedback(
        "danger",
        "Não foi possível renomear o tópico",
        resultado.message ?? "Tente novamente em instantes."
      );
    }
  }

  async function handleConfirmarExclusaoTopico() {
    if (!excluindoTopico) return;

    const resultado = await excluirWikiTopico(excluindoTopico.id);

    if (resultado.ok) {
      onTopicoExcluido(excluindoTopico.id);
      onFeedback("success", "Tópico excluído", `"${excluindoTopico.nome}" foi removido.`);
      setExcluindoTopico(null);
    } else {
      onFeedback(
        "danger",
        "Não foi possível excluir o tópico",
        resultado.message ?? "Tente novamente em instantes."
      );
    }
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
        topicoId: formulario.topicoId || null,
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

      <Card
        title="Tópicos"
        description="Categorias livres para organizar os artigos, independente de módulo — um artigo pode ter um tópico além do módulo."
      >
        <Stack gap={14}>
          <Stack direction="row" gap={8} wrap>
            {topicos.length === 0 && (
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Nenhum tópico criado ainda.
              </span>
            )}

            {topicos.map((topico) => {
              const totalArtigos = artigos.filter((artigo) => artigo.topicoId === topico.id).length;

              return (
                <Badge key={topico.id} variant="info">
                  <Stack direction="row" gap={6} align="center">
                    <button
                      type="button"
                      onClick={() => handleRenomearTopico(topico)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: "inherit",
                        font: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      {topico.nome} ({totalArtigos})
                    </button>
                    <IconButton
                      icon={<X size={12} />}
                      label={`Excluir tópico "${topico.nome}"`}
                      size="small"
                      onClick={() => setExcluindoTopico(topico)}
                    />
                  </Stack>
                </Badge>
              );
            })}
          </Stack>

          <Stack direction="row" gap={8}>
            <Input
              placeholder="Nome do novo tópico"
              value={novoTopicoNome}
              onChange={(event) => setNovoTopicoNome(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCriarTopico();
              }}
            />
            <Button
              variant="secondary"
              onClick={handleCriarTopico}
              loading={criandoTopico}
              disabled={!novoTopicoNome.trim()}
            >
              <Plus size={16} />
              Novo tópico
            </Button>
          </Stack>
        </Stack>
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

          <FormGrid columns={2}>
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

            <Field
              label="Tópico"
              hint="categoria livre, independente do módulo — crie novos tópicos no card acima"
            >
              <Dropdown
                value={formulario.topicoId}
                options={opcoesTopico}
                onValueChange={(valor) =>
                  setFormulario((atual) => ({ ...atual, topicoId: valor }))
                }
              />
            </Field>
          </FormGrid>

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
              imagemUpload={async (arquivo) => {
                const resultado = await uploadWikiImagem(arquivo);
                if (!resultado.ok || !resultado.data) {
                  throw new Error(resultado.message ?? "Falha ao enviar a imagem.");
                }
                return resultado.data.url;
              }}
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

      <ConfirmDialog
        open={excluindoTopico !== null}
        title="Excluir tópico"
        variant="danger"
        message={
          excluindoTopico
            ? `Tem certeza que deseja excluir "${excluindoTopico.nome}"? ${
                artigos.filter((artigo) => artigo.topicoId === excluindoTopico.id).length
              } artigo(s) ficarão sem tópico atribuído.`
            : ""
        }
        confirmLabel="Excluir"
        onClose={() => setExcluindoTopico(null)}
        onConfirm={handleConfirmarExclusaoTopico}
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
          <Table minWidth={720}>
            <TableHead>
              <TableRow>
                <TableHeaderCell align="center">Ordem</TableHeaderCell>
                <TableHeaderCell>Título</TableHeaderCell>
                <TableHeaderCell align="center">Tópico</TableHeaderCell>
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
