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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Download, Plus } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import type { DownloadAdmin } from "@/modules/downloads/types/downloads.types";

import {
  atualizarDownloadAdmin,
  criarDownloadAdmin,
  excluirDownloadAdmin,
  listarDownloadsAdmin,
} from "../services/adminPermissoes.service";
import type { FeedbackHandler } from "../types/toast.types";
import { DownloadTableRow } from "./DownloadTableRow";

interface DownloadsPainelProps {
  downloads: DownloadAdmin[];
  onDownloadCriado: (download: DownloadAdmin) => void;
  onDownloadAtualizado: (download: DownloadAdmin) => void;
  onDownloadExcluido: (id: string) => void;
  onDownloadsRecarregados: (downloads: DownloadAdmin[]) => void;
  onFeedback: FeedbackHandler;
}

interface FormularioDownload {
  nome: string;
  descricao: string;
  tag: string;
  instrucoes: string;
  funcionamento: string;
  ativo: boolean;
}

const formularioInicial: FormularioDownload = {
  nome: "",
  descricao: "",
  tag: "",
  instrucoes: "",
  funcionamento: "",
  ativo: true,
};

function linhasParaLista(texto: string): string[] {
  return texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);
}

function montarFormData(
  download: Omit<DownloadAdmin, "id" | "criadoEm" | "atualizadoEm" | "criadoPor">
): FormData {
  const dados = new FormData();
  dados.set("nome", download.nome);
  dados.set("descricao", download.descricao);
  dados.set("tag", download.tag ?? "");
  dados.set("instrucoes", JSON.stringify(download.instrucoes));
  dados.set("funcionamento", JSON.stringify(download.funcionamento));
  dados.set("ordem", String(download.ordem));
  dados.set("ativo", String(download.ativo));
  return dados;
}

export function DownloadsPainel({
  downloads,
  onDownloadCriado,
  onDownloadAtualizado,
  onDownloadExcluido,
  onDownloadsRecarregados,
  onFeedback,
}: DownloadsPainelProps) {
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<FormularioDownload>(formularioInicial);
  const [arquivo, setArquivo] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<DownloadAdmin | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [alterandoAtivoId, setAlterandoAtivoId] = useState<string | null>(null);

  const downloadsOrdenados = [...downloads].sort((a, b) => a.ordem - b.ordem);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function abrirNovo() {
    setEditandoId(null);
    setFormulario(formularioInicial);
    setArquivo([]);
    setErro(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(download: DownloadAdmin) {
    setEditandoId(download.id);
    setFormulario({
      nome: download.nome,
      descricao: download.descricao,
      tag: download.tag ?? "",
      instrucoes: download.instrucoes.join("\n"),
      funcionamento: download.funcionamento.join("\n"),
      ativo: download.ativo,
    });
    setArquivo([]);
    setErro(null);
    setDrawerAberto(true);
  }

  async function handleSalvar() {
    if (!formulario.nome.trim() || !formulario.descricao.trim()) {
      setErro("Preencha nome e descrição.");
      return;
    }

    if (!editandoId && arquivo.length === 0) {
      setErro("Selecione o arquivo do download.");
      return;
    }

    setErro(null);
    setSalvando(true);

    try {
      const editando = editandoId ? downloads.find((item) => item.id === editandoId) : null;

      const dados = new FormData();
      dados.set("nome", formulario.nome.trim());
      dados.set("descricao", formulario.descricao.trim());
      dados.set("tag", formulario.tag.trim());
      dados.set("instrucoes", JSON.stringify(linhasParaLista(formulario.instrucoes)));
      dados.set("funcionamento", JSON.stringify(linhasParaLista(formulario.funcionamento)));
      dados.set("ordem", String(editando?.ordem ?? downloads.length));
      dados.set("ativo", String(formulario.ativo));
      if (arquivo[0]) dados.set("arquivo", arquivo[0]);

      const resultado = editandoId
        ? await atualizarDownloadAdmin(editandoId, dados)
        : await criarDownloadAdmin(dados);

      if (resultado.ok && resultado.data) {
        if (editandoId) {
          onDownloadAtualizado(resultado.data);
          onFeedback("success", "Download atualizado", `"${resultado.data.nome}" foi salvo.`);
        } else {
          onDownloadCriado(resultado.data);
          onFeedback("success", "Download criado", `"${resultado.data.nome}" já está disponível.`);
        }
        setDrawerAberto(false);
      } else {
        setErro(resultado.message ?? "Não foi possível salvar o download.");
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleAlternarAtivo(download: DownloadAdmin, ativo: boolean) {
    setAlterandoAtivoId(download.id);

    try {
      const resultado = await atualizarDownloadAdmin(
        download.id,
        montarFormData({ ...download, ativo })
      );

      if (resultado.ok && resultado.data) {
        onDownloadAtualizado(resultado.data);
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

  async function handleReordenar(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const indiceAntigo = downloadsOrdenados.findIndex((item) => item.id === active.id);
    const indiceNovo = downloadsOrdenados.findIndex((item) => item.id === over.id);
    if (indiceAntigo === -1 || indiceNovo === -1) return;

    const reordenados = arrayMove(downloadsOrdenados, indiceAntigo, indiceNovo);
    const comNovaOrdem = reordenados.map((item, indice) => ({ ...item, ordem: indice }));
    const alterados = comNovaOrdem.filter(
      (item, indice) => item.ordem !== downloadsOrdenados[indice]?.ordem
    );

    comNovaOrdem.forEach((item) => onDownloadAtualizado(item));

    try {
      const resultados = await Promise.all(
        alterados.map((item) => atualizarDownloadAdmin(item.id, montarFormData(item)))
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

      onDownloadsRecarregados(await listarDownloadsAdmin());
    }
  }

  async function handleConfirmarExclusao() {
    if (!excluindo) return;

    setConfirmandoExclusao(true);

    try {
      const resultado = await excluirDownloadAdmin(excluindo.id);

      if (resultado.ok) {
        onDownloadExcluido(excluindo.id);
        onFeedback("success", "Download excluído", `"${excluindo.nome}" foi removido.`);
        setExcluindo(null);
      } else {
        onFeedback(
          "danger",
          "Não foi possível excluir o download",
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
        title="Downloads"
        description="Instaladores, documentos e utilitários oferecidos na Central de Downloads pública."
        actions={
          <Button onClick={abrirNovo}>
            <Plus size={16} />
            Novo download
          </Button>
        }
      >
        {downloadsOrdenados.length === 0 ? (
          <EmptyState
            icon={<Download size={28} />}
            title="Nenhum download cadastrado"
            description='Clique em "Novo download" para publicar o primeiro arquivo.'
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleReordenar}
          >
            <SortableContext
              items={downloadsOrdenados.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <Table minWidth={720}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell align="center">Ordem</TableHeaderCell>
                    <TableHeaderCell>Nome</TableHeaderCell>
                    <TableHeaderCell>Tag</TableHeaderCell>
                    <TableHeaderCell>Arquivo</TableHeaderCell>
                    <TableHeaderCell align="center">Ativo</TableHeaderCell>
                    <TableHeaderCell align="center">Ações</TableHeaderCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {downloadsOrdenados.map((download) => (
                    <DownloadTableRow
                      key={download.id}
                      download={download}
                      alterandoAtivo={alterandoAtivoId === download.id}
                      onAlternarAtivo={(ativo) => handleAlternarAtivo(download, ativo)}
                      onEditar={() => abrirEdicao(download)}
                      onExcluir={() => setExcluindo(download)}
                    />
                  ))}
                </TableBody>
              </Table>
            </SortableContext>
          </DndContext>
        )}
      </Card>

      <Drawer
        open={drawerAberto}
        onClose={() => setDrawerAberto(false)}
        title={editandoId ? "Editar download" : "Novo download"}
        description="Preencha os dados do arquivo disponibilizado na Central de Downloads."
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
          <FormGrid columns={2}>
            <Field label="Nome" required>
              <Input
                value={formulario.nome}
                onChange={(event) =>
                  setFormulario((atual) => ({ ...atual, nome: event.target.value }))
                }
              />
            </Field>

            <Field label="Tag" hint='ex: "Instalador", "Documento"'>
              <Input
                value={formulario.tag}
                onChange={(event) =>
                  setFormulario((atual) => ({ ...atual, tag: event.target.value }))
                }
              />
            </Field>
          </FormGrid>

          <Field label="Descrição" required>
            <Textarea
              rows={3}
              value={formulario.descricao}
              onChange={(event) =>
                setFormulario((atual) => ({ ...atual, descricao: event.target.value }))
              }
            />
          </Field>

          <Field
            label="Arquivo"
            required={!editandoId}
            hint={
              editandoId
                ? "deixe em branco para manter o arquivo já cadastrado"
                : "até 200 MB"
            }
          >
            <FileUpload maxSizeMB={200} files={arquivo} onFilesChange={setArquivo} />
          </Field>

          <Field
            label="Instruções de instalação"
            hint="uma instrução por linha — aparecem na ordem digitada"
          >
            <Textarea
              rows={4}
              value={formulario.instrucoes}
              onChange={(event) =>
                setFormulario((atual) => ({ ...atual, instrucoes: event.target.value }))
              }
            />
          </Field>

          <Field label="Funcionamento" hint="uma linha por item">
            <Textarea
              rows={4}
              value={formulario.funcionamento}
              onChange={(event) =>
                setFormulario((atual) => ({ ...atual, funcionamento: event.target.value }))
              }
            />
          </Field>

          {editandoId && (
            <Switch
              label={formulario.ativo ? "Visível na Central de Downloads" : "Oculto"}
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
        title="Excluir download"
        variant="danger"
        message={`Tem certeza que deseja excluir "${excluindo?.nome}"? O arquivo deixa de ficar disponível imediatamente.`}
        confirmLabel="Excluir"
        loading={confirmandoExclusao}
        onClose={() => setExcluindo(null)}
        onConfirm={handleConfirmarExclusao}
      />
    </Stack>
  );
}
