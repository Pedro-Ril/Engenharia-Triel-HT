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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ArrowLeft, FileImage, Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Pagination } from "@/components/ui/Pagination";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableCell,
} from "@/components/ui/Table";
import {
  atualizarModeloAssinaturaAdmin,
  excluirModeloAssinaturaAdmin,
  listarLogAssinaturasAdmin,
  listarModelosAssinaturaAdmin,
} from "@/modules/assinaturas/services/assinaturas.service";
import type { ItemLogAssinatura, ModeloAssinaturaAdmin } from "@/modules/assinaturas/types/assinaturas.types";

import { AssinaturaModeloEditor } from "./AssinaturaModeloEditor";
import { AssinaturaModeloTableRow } from "./AssinaturaModeloTableRow";
import styles from "./AssinaturasPainel.module.css";
import type { FeedbackHandler } from "../types/toast.types";

interface AssinaturasPainelProps {
  onFeedback: FeedbackHandler;
}

type Aba = "modelos" | "log";
type Edicao = { modo: "lista" } | { modo: "novo" } | { modo: "editar"; modelo: ModeloAssinaturaAdmin };

const POR_PAGINA_LOG = 20;

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function ModelosTab({ onFeedback }: { onFeedback: FeedbackHandler }) {
  const [carregando, setCarregando] = useState(true);
  const [modelos, setModelos] = useState<ModeloAssinaturaAdmin[]>([]);
  const [edicao, setEdicao] = useState<Edicao>({ modo: "lista" });
  const [alterandoAtivoId, setAlterandoAtivoId] = useState<string | null>(null);
  const [modeloParaExcluir, setModeloParaExcluir] = useState<ModeloAssinaturaAdmin | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const modelosOrdenados = [...modelos].sort((a, b) => a.ordem - b.ordem);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function carregar() {
    setModelos(await listarModelosAssinaturaAdmin());
  }

  useEffect(() => {
    let cancelado = false;

    async function inicial() {
      setCarregando(true);
      await carregar();
      if (!cancelado) setCarregando(false);
    }

    inicial();

    return () => {
      cancelado = true;
    };
  }, []);

  async function handleAlternarAtivo(modelo: ModeloAssinaturaAdmin, ativo: boolean) {
    setAlterandoAtivoId(modelo.id);

    try {
      const resultado = await atualizarModeloAssinaturaAdmin(modelo.id, { ativo });

      if (resultado.ok) {
        await carregar();
      } else {
        onFeedback("danger", "Não foi possível atualizar", resultado.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setAlterandoAtivoId(null);
    }
  }

  async function handleReordenar(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const indiceAntigo = modelosOrdenados.findIndex((item) => item.id === active.id);
    const indiceNovo = modelosOrdenados.findIndex((item) => item.id === over.id);
    if (indiceAntigo === -1 || indiceNovo === -1) return;

    const reordenados = arrayMove(modelosOrdenados, indiceAntigo, indiceNovo);
    const comNovaOrdem = reordenados.map((item, indice) => ({ ...item, ordem: indice }));
    const alterados = comNovaOrdem.filter((item, indice) => item.ordem !== modelosOrdenados[indice]?.ordem);

    setModelos(comNovaOrdem);

    try {
      const resultados = await Promise.all(
        alterados.map((item) => atualizarModeloAssinaturaAdmin(item.id, { ordem: item.ordem }))
      );

      if (resultados.some((resultado) => !resultado.ok)) {
        throw new Error("Falha ao salvar parte da nova ordem.");
      }
    } catch {
      onFeedback(
        "danger",
        "Não foi possível salvar a nova ordem",
        "A lista foi restaurada com os dados reais do servidor -- tente reordenar novamente."
      );
      setModelos(await listarModelosAssinaturaAdmin());
    }
  }

  async function handleConfirmarExclusao() {
    if (!modeloParaExcluir) return;
    setExcluindo(true);

    try {
      const resultado = await excluirModeloAssinaturaAdmin(modeloParaExcluir.id);

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Modelo excluído" : "Não foi possível excluir",
        resultado.message ?? "Tente novamente em instantes."
      );

      if (resultado.ok) await carregar();
    } finally {
      setExcluindo(false);
      setModeloParaExcluir(null);
    }
  }

  if (edicao.modo !== "lista") {
    return (
      <Card
        title={edicao.modo === "novo" ? "Novo modelo de assinatura" : `Editar modelo -- ${edicao.modelo.nome}`}
        actions={
          <Button variant="secondary" onClick={() => setEdicao({ modo: "lista" })}>
            <ArrowLeft size={15} />
            Voltar
          </Button>
        }
      >
        <AssinaturaModeloEditor
          modelo={edicao.modo === "editar" ? edicao.modelo : null}
          onCancelar={() => setEdicao({ modo: "lista" })}
          onFeedback={onFeedback}
          onSalvo={async () => {
            setEdicao({ modo: "lista" });
            await carregar();
          }}
        />
      </Card>
    );
  }

  return (
    <Card
      title="Modelos de assinatura"
      description="Imagem de fundo + posição/fonte/cor de cada campo. Arraste pra mudar a ordem de exibição pros usuários."
      actions={
        <Button onClick={() => setEdicao({ modo: "novo" })}>
          <Plus size={16} />
          Novo modelo
        </Button>
      }
    >
      {carregando ? (
        <Loader label="Carregando modelos..." />
      ) : modelosOrdenados.length === 0 ? (
        <EmptyState
          icon={<FileImage size={26} />}
          title="Nenhum modelo cadastrado"
          description='Clique em "Novo modelo" pra cadastrar o primeiro.'
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReordenar}>
          <SortableContext
            items={modelosOrdenados.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <Table minWidth={560}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell align="center">Ordem</TableHeaderCell>
                  <TableHeaderCell>Imagem</TableHeaderCell>
                  <TableHeaderCell>Nome</TableHeaderCell>
                  <TableHeaderCell align="center">Ativo</TableHeaderCell>
                  <TableHeaderCell align="center">Ações</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {modelosOrdenados.map((modelo) => (
                  <AssinaturaModeloTableRow
                    key={modelo.id}
                    modelo={modelo}
                    alterandoAtivo={alterandoAtivoId === modelo.id}
                    onAlternarAtivo={(ativo) => handleAlternarAtivo(modelo, ativo)}
                    onEditar={() => setEdicao({ modo: "editar", modelo })}
                    onExcluir={() => setModeloParaExcluir(modelo)}
                  />
                ))}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      )}

      <ConfirmDialog
        open={modeloParaExcluir !== null}
        title="Excluir modelo?"
        message={`"${modeloParaExcluir?.nome}" deixa de aparecer pra seleção. Assinaturas já geradas com ele continuam existindo normalmente.`}
        confirmLabel="Excluir"
        variant="danger"
        loading={excluindo}
        onClose={() => setModeloParaExcluir(null)}
        onConfirm={handleConfirmarExclusao}
      />
    </Card>
  );
}

const LABEL_EVENTO: Record<ItemLogAssinatura["evento"], string> = {
  criacao: "Criação",
  edicao: "Edição",
  download: "Download",
  exclusao: "Exclusão",
};

function LogTab({ modelos }: { modelos: ModeloAssinaturaAdmin[] }) {
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [modeloNome, setModeloNome] = useState("");
  const [pagina, setPagina] = useState(1);

  const [itens, setItens] = useState<ItemLogAssinatura[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const temporizador = setTimeout(() => {
      setBusca(buscaDigitada);
      setPagina(1);
    }, 400);
    return () => clearTimeout(temporizador);
  }, [buscaDigitada]);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCarregando(true);

      const resultado = await listarLogAssinaturasAdmin({
        pagina,
        porPagina: POR_PAGINA_LOG,
        busca: busca || undefined,
        modeloNome: modeloNome || undefined,
      });

      if (cancelado) return;

      if (resultado) {
        setItens(resultado.itens);
        setTotal(resultado.total);
      }

      setCarregando(false);
    }

    carregar();

    return () => {
      cancelado = true;
    };
  }, [busca, modeloNome, pagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA_LOG));

  const opcoesModelo = [
    { value: "", label: "Todos os modelos" },
    ...[...new Set(modelos.map((modelo) => modelo.nome))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((nome) => ({ value: nome, label: nome })),
  ];

  return (
    <Card title="Log de criações e downloads" description="Toda vez que alguém gera ou baixa uma assinatura.">
      <Stack gap={16}>
        <div className={styles.filtrosLogs}>
          <div className={styles.filtroCampo} style={{ flex: 1 }}>
            <Field label="Buscar">
              <Input
                value={buscaDigitada}
                placeholder="Nome do usuário ou da assinatura"
                onChange={(event) => setBuscaDigitada(event.target.value)}
              />
            </Field>
          </div>

          <div className={styles.filtroCampo}>
            <Field label="Modelo">
              <Dropdown
                value={modeloNome}
                options={opcoesModelo}
                onValueChange={(valor) => {
                  setModeloNome(valor);
                  setPagina(1);
                }}
              />
            </Field>
          </div>
        </div>

        {carregando ? (
          <Loader label="Carregando log..." />
        ) : itens.length === 0 ? (
          <EmptyState
            icon={<FileImage size={26} />}
            title="Nenhum evento encontrado"
            description="Sem criações/downloads registrados para os filtros selecionados."
          />
        ) : (
          <>
            <Table minWidth={700}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Usuário</TableHeaderCell>
                  <TableHeaderCell>Evento</TableHeaderCell>
                  <TableHeaderCell>Modelo</TableHeaderCell>
                  <TableHeaderCell>Assinatura</TableHeaderCell>
                  <TableHeaderCell>Quando</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {itens.map((item) => (
                  <TableRow key={`${item.evento}-${item.id}`}>
                    <TableCell>{item.usuarioNome}</TableCell>
                    <TableCell>{LABEL_EVENTO[item.evento]}</TableCell>
                    <TableCell>{item.modeloNome ?? "—"}</TableCell>
                    <TableCell>{item.assinaturaNome}</TableCell>
                    <TableCell>{formatarDataHora(item.quando)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
          </>
        )}
      </Stack>
    </Card>
  );
}

export function AssinaturasPainel({ onFeedback }: AssinaturasPainelProps) {
  const [aba, setAba] = useState<Aba>("modelos");
  const [modelos, setModelos] = useState<ModeloAssinaturaAdmin[]>([]);

  useEffect(() => {
    listarModelosAssinaturaAdmin().then(setModelos);
  }, [aba]);

  return (
    <Stack gap={20}>
      <SegmentedTabs
        itens={[
          { valor: "modelos", label: "Modelos" },
          { valor: "log", label: "Log" },
        ]}
        ativo={aba}
        onSelecionar={(valor) => setAba(valor as Aba)}
      />

      {aba === "modelos" && <ModelosTab onFeedback={onFeedback} />}
      {aba === "log" && <LogTab modelos={modelos} />}
    </Stack>
  );
}
