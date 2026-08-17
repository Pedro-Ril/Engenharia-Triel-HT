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

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconPicker } from "@/components/ui/IconPicker";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";

import {
  atualizarModulo,
  atualizarSetor,
  criarSetor,
  excluirModulo,
  excluirSetor,
} from "../services/adminPermissoes.service";
import type {
  PortalModulo,
  PortalSetor,
} from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import { SetorCard } from "./SetorCard";

interface SetoresModulosPainelProps {
  setores: PortalSetor[];
  modulos: PortalModulo[];
  onSetorCriado: (setor: PortalSetor) => void;
  onSetorAtualizado: (setor: PortalSetor) => void;
  onSetorExcluido: (setorId: string) => void;
  onModuloCriado: (modulo: PortalModulo) => void;
  onModuloAtualizado: (modulo: PortalModulo) => void;
  onModuloExcluido: (moduloId: string) => void;
  onFeedback: FeedbackHandler;
}

const novoSetorInicial = { chave: "", nome: "", icone: "", ordem: "0" };

function alternarIdEmLista(lista: string[], id: string): string[] {
  return lista.includes(id)
    ? lista.filter((item) => item !== id)
    : [...lista, id];
}

export function SetoresModulosPainel({
  setores,
  modulos,
  onSetorCriado,
  onSetorAtualizado,
  onSetorExcluido,
  onModuloCriado,
  onModuloAtualizado,
  onModuloExcluido,
  onFeedback,
}: SetoresModulosPainelProps) {
  const [novoSetor, setNovoSetor] = useState(novoSetorInicial);
  const [criandoSetor, setCriandoSetor] = useState(false);
  const [erroSetor, setErroSetor] = useState<string | null>(null);

  const [setorEditando, setSetorEditando] = useState<PortalSetor | null>(null);
  const [formSetorEdicao, setFormSetorEdicao] = useState({
    nome: "",
    icone: "",
    ordem: "0",
  });
  const [salvandoSetorEdicao, setSalvandoSetorEdicao] = useState(false);
  const [erroSetorEdicao, setErroSetorEdicao] = useState<string | null>(null);
  const [setorExcluindo, setSetorExcluindo] = useState<PortalSetor | null>(
    null
  );
  const [confirmandoExclusaoSetor, setConfirmandoExclusaoSetor] =
    useState(false);

  const [moduloEditando, setModuloEditando] = useState<PortalModulo | null>(
    null
  );
  const [formModuloEdicao, setFormModuloEdicao] = useState({
    nome: "",
    path: "",
    icone: "",
    ordem: "0",
    emDesenvolvimento: false,
    setorIds: [] as string[],
  });
  const [salvandoModuloEdicao, setSalvandoModuloEdicao] = useState(false);
  const [erroModuloEdicao, setErroModuloEdicao] = useState<string | null>(
    null
  );
  const [moduloExcluindo, setModuloExcluindo] = useState<PortalModulo | null>(
    null
  );
  const [confirmandoExclusaoModulo, setConfirmandoExclusaoModulo] =
    useState(false);

  const sensoresSetores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const setoresOrdenados = [...setores].sort((a, b) => a.ordem - b.ordem);

  async function handleCriarSetor() {
    setErroSetor(null);
    setCriandoSetor(true);

    try {
      const resultado = await criarSetor({
        chave: novoSetor.chave,
        nome: novoSetor.nome,
        icone: novoSetor.icone.trim() || null,
        ordem: Number(novoSetor.ordem) || 0,
      });

      if (resultado.ok && resultado.data) {
        onSetorCriado(resultado.data);
        setNovoSetor(novoSetorInicial);
        onFeedback(
          "success",
          "Setor criado",
          `O setor "${resultado.data.nome}" já aparece no menu lateral.`
        );
      } else {
        setErroSetor(resultado.message ?? "Não foi possível criar o setor.");
      }
    } finally {
      setCriandoSetor(false);
    }
  }

  async function handleAtualizarSetor(
    setor: PortalSetor,
    campos: Partial<Pick<PortalSetor, "ativo" | "ordem">>
  ) {
    const resultado = await atualizarSetor(setor.id, {
      nome: setor.nome,
      icone: setor.icone,
      ordem: campos.ordem ?? setor.ordem,
      ativo: campos.ativo ?? setor.ativo,
    });

    if (resultado.ok && resultado.data) {
      onSetorAtualizado(resultado.data);
    } else {
      onFeedback(
        "danger",
        "Não foi possível atualizar o setor",
        resultado.message ?? "Tente novamente em instantes."
      );
    }
  }

  async function handleReordenarSetores(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const indiceAntigo = setoresOrdenados.findIndex((s) => s.id === active.id);
    const indiceNovo = setoresOrdenados.findIndex((s) => s.id === over.id);
    if (indiceAntigo === -1 || indiceNovo === -1) return;

    const reordenados = arrayMove(setoresOrdenados, indiceAntigo, indiceNovo);
    const alterados = reordenados
      .map((setor, indice) => ({ setor, indice }))
      .filter(({ setor, indice }) => setor.ordem !== indice);

    alterados.forEach(({ setor, indice }) =>
      onSetorAtualizado({ ...setor, ordem: indice })
    );

    try {
      await Promise.all(
        alterados.map(({ setor, indice }) =>
          atualizarSetor(setor.id, {
            nome: setor.nome,
            icone: setor.icone,
            ordem: indice,
            ativo: setor.ativo,
          })
        )
      );
    } catch {
      onFeedback(
        "danger",
        "Não foi possível salvar a nova ordem dos setores",
        "Tente novamente em instantes."
      );
    }
  }

  function abrirEdicaoSetor(setor: PortalSetor) {
    setSetorEditando(setor);
    setErroSetorEdicao(null);
    setFormSetorEdicao({
      nome: setor.nome,
      icone: setor.icone ?? "",
      ordem: String(setor.ordem),
    });
  }

  async function handleSalvarEdicaoSetor() {
    if (!setorEditando) return;

    setErroSetorEdicao(null);
    setSalvandoSetorEdicao(true);

    try {
      const resultado = await atualizarSetor(setorEditando.id, {
        nome: formSetorEdicao.nome,
        icone: formSetorEdicao.icone.trim() || null,
        ordem: Number(formSetorEdicao.ordem) || 0,
        ativo: setorEditando.ativo,
      });

      if (resultado.ok && resultado.data) {
        onSetorAtualizado(resultado.data);
        onFeedback(
          "success",
          "Setor atualizado",
          `"${resultado.data.nome}" foi atualizado.`
        );
        setSetorEditando(null);
      } else {
        setErroSetorEdicao(
          resultado.message ?? "Não foi possível salvar as alterações."
        );
      }
    } finally {
      setSalvandoSetorEdicao(false);
    }
  }

  async function handleConfirmarExclusaoSetor() {
    if (!setorExcluindo) return;

    setConfirmandoExclusaoSetor(true);

    try {
      const resultado = await excluirSetor(setorExcluindo.id);

      if (resultado.ok) {
        onSetorExcluido(setorExcluindo.id);
        onFeedback(
          "success",
          "Setor excluído",
          `"${setorExcluindo.nome}" foi removido do portal.`
        );
        setSetorExcluindo(null);
      } else {
        onFeedback(
          "danger",
          "Não foi possível excluir o setor",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setConfirmandoExclusaoSetor(false);
    }
  }

  async function handleAtualizarModulo(
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
  ) {
    const resultado = await atualizarModulo(modulo.id, {
      nome: modulo.nome,
      path: modulo.path,
      icone: modulo.icone,
      publicoSemLogin: campos.publicoSemLogin ?? modulo.publicoSemLogin,
      publicoAutenticado:
        campos.publicoAutenticado ?? modulo.publicoAutenticado,
      emDesenvolvimento:
        campos.emDesenvolvimento ?? modulo.emDesenvolvimento,
      ativo: campos.ativo ?? modulo.ativo,
      ordem: campos.ordem ?? modulo.ordem,
      setorIds: modulo.setorIds,
    });

    if (resultado.ok && resultado.data) {
      onModuloAtualizado(resultado.data);
    } else {
      onFeedback(
        "danger",
        "Não foi possível atualizar o módulo",
        resultado.message ?? "Tente novamente em instantes."
      );
    }
  }

  async function handleReordenarModulos(modulosReordenados: PortalModulo[]) {
    const alterados = modulosReordenados
      .map((modulo, indice) => ({ modulo, indice }))
      .filter(({ modulo, indice }) => modulo.ordem !== indice);

    alterados.forEach(({ modulo, indice }) =>
      onModuloAtualizado({ ...modulo, ordem: indice })
    );

    try {
      await Promise.all(
        alterados.map(({ modulo, indice }) =>
          atualizarModulo(modulo.id, {
            nome: modulo.nome,
            path: modulo.path,
            icone: modulo.icone,
            publicoSemLogin: modulo.publicoSemLogin,
            publicoAutenticado: modulo.publicoAutenticado,
            emDesenvolvimento: modulo.emDesenvolvimento,
            ativo: modulo.ativo,
            ordem: indice,
            setorIds: modulo.setorIds,
          })
        )
      );
    } catch {
      onFeedback(
        "danger",
        "Não foi possível salvar a nova ordem dos módulos",
        "Tente novamente em instantes."
      );
    }
  }

  function abrirEdicaoModulo(modulo: PortalModulo) {
    setModuloEditando(modulo);
    setErroModuloEdicao(null);
    setFormModuloEdicao({
      nome: modulo.nome,
      path: modulo.path,
      icone: modulo.icone ?? "",
      ordem: String(modulo.ordem),
      emDesenvolvimento: modulo.emDesenvolvimento,
      setorIds: modulo.setorIds,
    });
  }

  async function handleSalvarEdicaoModulo() {
    if (!moduloEditando) return;

    if (!formModuloEdicao.path.startsWith("/")) {
      setErroModuloEdicao('O campo caminho deve começar com "/".');
      return;
    }

    if (formModuloEdicao.setorIds.length === 0) {
      setErroModuloEdicao("Selecione ao menos um setor para o módulo.");
      return;
    }

    setErroModuloEdicao(null);
    setSalvandoModuloEdicao(true);

    try {
      const resultado = await atualizarModulo(moduloEditando.id, {
        nome: formModuloEdicao.nome,
        path: formModuloEdicao.path,
        icone: formModuloEdicao.icone.trim() || null,
        publicoSemLogin: moduloEditando.publicoSemLogin,
        publicoAutenticado: moduloEditando.publicoAutenticado,
        emDesenvolvimento: formModuloEdicao.emDesenvolvimento,
        ativo: moduloEditando.ativo,
        ordem: Number(formModuloEdicao.ordem) || 0,
        setorIds: formModuloEdicao.setorIds,
      });

      if (resultado.ok && resultado.data) {
        onModuloAtualizado(resultado.data);
        onFeedback(
          "success",
          "Módulo atualizado",
          `"${resultado.data.nome}" foi atualizado.`
        );
        setModuloEditando(null);
      } else {
        setErroModuloEdicao(
          resultado.message ?? "Não foi possível salvar as alterações."
        );
      }
    } finally {
      setSalvandoModuloEdicao(false);
    }
  }

  async function handleConfirmarExclusaoModulo() {
    if (!moduloExcluindo) return;

    setConfirmandoExclusaoModulo(true);

    try {
      const resultado = await excluirModulo(moduloExcluindo.id);

      if (resultado.ok) {
        onModuloExcluido(moduloExcluindo.id);
        onFeedback(
          "success",
          "Módulo excluído",
          `"${moduloExcluindo.nome}" foi removido do portal.`
        );
        setModuloExcluindo(null);
      } else {
        onFeedback(
          "danger",
          "Não foi possível excluir o módulo",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setConfirmandoExclusaoModulo(false);
    }
  }

  return (
    <Stack gap={20}>
      <Card
        title="Novo setor"
        description='Vira uma "pasta" nova no menu lateral.'
      >
        <Stack gap={16}>
          <FormGrid columns={4}>
            <Field label="Chave" hint='minúsculo, com hífen (ex: "financeiro")'>
              <Input
                value={novoSetor.chave}
                onChange={(event) =>
                  setNovoSetor((atual) => ({ ...atual, chave: event.target.value }))
                }
              />
            </Field>

            <Field label="Nome">
              <Input
                value={novoSetor.nome}
                onChange={(event) =>
                  setNovoSetor((atual) => ({ ...atual, nome: event.target.value }))
                }
              />
            </Field>

            <Field label="Ícone">
              <IconPicker
                value={novoSetor.icone || null}
                onChange={(icone) =>
                  setNovoSetor((atual) => ({ ...atual, icone }))
                }
              />
            </Field>

            <Field label="Ordem">
              <NumberInput
                value={novoSetor.ordem}
                onChange={(event) =>
                  setNovoSetor((atual) => ({ ...atual, ordem: event.target.value }))
                }
              />
            </Field>
          </FormGrid>

          {erroSetor && <Alert variant="danger">{erroSetor}</Alert>}

          <Stack direction="row" justify="end" gap={10}>
            <Button
              onClick={handleCriarSetor}
              loading={criandoSetor}
              disabled={!novoSetor.chave || !novoSetor.nome}
            >
              Criar setor
            </Button>
          </Stack>
        </Stack>
      </Card>

      <DndContext
        sensors={sensoresSetores}
        collisionDetection={closestCenter}
        onDragEnd={handleReordenarSetores}
      >
        <SortableContext
          items={setoresOrdenados.map((setor) => setor.id)}
          strategy={verticalListSortingStrategy}
        >
          <Stack gap={20}>
            {setoresOrdenados.map((setor) => {
              const modulosDoSetor = modulos
                .filter((modulo) => modulo.setorIds.includes(setor.id))
                .sort((a, b) => a.ordem - b.ordem);

              return (
                <SetorCard
                  key={setor.id}
                  setor={setor}
                  setoresDisponiveis={setoresOrdenados}
                  modulosDoSetor={modulosDoSetor}
                  onToggleAtivoSetor={(setorAlvo, ativo) =>
                    handleAtualizarSetor(setorAlvo, { ativo })
                  }
                  onEditarSetor={abrirEdicaoSetor}
                  onExcluirSetor={setSetorExcluindo}
                  onAtualizarModulo={handleAtualizarModulo}
                  onEditarModulo={abrirEdicaoModulo}
                  onExcluirModulo={setModuloExcluindo}
                  onModuloCriado={onModuloCriado}
                  onReordenarModulos={handleReordenarModulos}
                  onFeedback={onFeedback}
                />
              );
            })}
          </Stack>
        </SortableContext>
      </DndContext>

      <Modal
        open={setorEditando !== null}
        onClose={() => setSetorEditando(null)}
        title="Editar setor"
        size="medium"
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={() => setSetorEditando(null)}>
              Cancelar
            </Button>

            <Button
              onClick={handleSalvarEdicaoSetor}
              loading={salvandoSetorEdicao}
              disabled={!formSetorEdicao.nome}
            >
              Salvar
            </Button>
          </Stack>
        }
      >
        {setorEditando && (
          <Stack gap={16}>
            <Field label="Chave" hint="não pode ser alterada depois de criada">
              <Input value={setorEditando.chave} disabled />
            </Field>

            <FormGrid columns={2}>
              <Field label="Nome">
                <Input
                  value={formSetorEdicao.nome}
                  onChange={(event) =>
                    setFormSetorEdicao((atual) => ({
                      ...atual,
                      nome: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field label="Ordem">
                <NumberInput
                  value={formSetorEdicao.ordem}
                  onChange={(event) =>
                    setFormSetorEdicao((atual) => ({
                      ...atual,
                      ordem: event.target.value,
                    }))
                  }
                />
              </Field>
            </FormGrid>

            <Field label="Ícone">
              <IconPicker
                value={formSetorEdicao.icone || null}
                onChange={(icone) =>
                  setFormSetorEdicao((atual) => ({ ...atual, icone }))
                }
              />
            </Field>

            {erroSetorEdicao && (
              <Alert variant="danger">{erroSetorEdicao}</Alert>
            )}
          </Stack>
        )}
      </Modal>

      <Modal
        open={moduloEditando !== null}
        onClose={() => setModuloEditando(null)}
        title="Editar módulo"
        size="medium"
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={() => setModuloEditando(null)}>
              Cancelar
            </Button>

            <Button
              onClick={handleSalvarEdicaoModulo}
              loading={salvandoModuloEdicao}
              disabled={
                !formModuloEdicao.nome ||
                !formModuloEdicao.path ||
                formModuloEdicao.setorIds.length === 0
              }
            >
              Salvar
            </Button>
          </Stack>
        }
      >
        {moduloEditando && (
          <Stack gap={16}>
            <Field label="Chave" hint="não pode ser alterada depois de criada">
              <Input value={moduloEditando.chave} disabled />
            </Field>

            <FormGrid columns={2}>
              <Field label="Nome">
                <Input
                  value={formModuloEdicao.nome}
                  onChange={(event) =>
                    setFormModuloEdicao((atual) => ({
                      ...atual,
                      nome: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field
                label="Caminho (path)"
                hint="precisa corresponder a uma rota real do app"
              >
                <Input
                  value={formModuloEdicao.path}
                  onChange={(event) =>
                    setFormModuloEdicao((atual) => ({
                      ...atual,
                      path: event.target.value,
                    }))
                  }
                />
              </Field>
            </FormGrid>

            <FormGrid columns={2}>
              <Field label="Ícone">
                <IconPicker
                  value={formModuloEdicao.icone || null}
                  onChange={(icone) =>
                    setFormModuloEdicao((atual) => ({ ...atual, icone }))
                  }
                />
              </Field>

              <Field label="Ordem">
                <NumberInput
                  value={formModuloEdicao.ordem}
                  onChange={(event) =>
                    setFormModuloEdicao((atual) => ({
                      ...atual,
                      ordem: event.target.value,
                    }))
                  }
                />
              </Field>
            </FormGrid>

            <Field label="Setores" hint="o módulo aparece em cada setor marcado">
              <Stack direction="row" gap={16} wrap>
                {setoresOrdenados.map((setorDisponivel) => (
                  <Checkbox
                    key={setorDisponivel.id}
                    label={setorDisponivel.nome}
                    checked={formModuloEdicao.setorIds.includes(setorDisponivel.id)}
                    onChange={() =>
                      setFormModuloEdicao((atual) => ({
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

            <Checkbox
              label="Em desenvolvimento"
              hint="só administradores enxergam, mesmo que liberado acima"
              checked={formModuloEdicao.emDesenvolvimento}
              onChange={(event) =>
                setFormModuloEdicao((atual) => ({
                  ...atual,
                  emDesenvolvimento: event.target.checked,
                }))
              }
            />

            {erroModuloEdicao && (
              <Alert variant="danger">{erroModuloEdicao}</Alert>
            )}
          </Stack>
        )}
      </Modal>

      <ConfirmDialog
        open={setorExcluindo !== null}
        title="Excluir setor"
        message={
          <>
            Tem certeza que deseja excluir o setor{" "}
            <strong>{setorExcluindo?.nome}</strong>? Só é possível excluir
            setores sem módulos cadastrados.
          </>
        }
        confirmLabel="Excluir"
        variant="danger"
        loading={confirmandoExclusaoSetor}
        onClose={() => setSetorExcluindo(null)}
        onConfirm={handleConfirmarExclusaoSetor}
      />

      <ConfirmDialog
        open={moduloExcluindo !== null}
        title="Excluir módulo"
        message={
          <>
            Tem certeza que deseja excluir o módulo{" "}
            <strong>{moduloExcluindo?.nome}</strong>? Só é possível excluir
            módulos sem permissões concedidas.
          </>
        }
        confirmLabel="Excluir"
        variant="danger"
        loading={confirmandoExclusaoModulo}
        onClose={() => setModuloExcluindo(null)}
        onConfirm={handleConfirmarExclusaoModulo}
      />
    </Stack>
  );
}
