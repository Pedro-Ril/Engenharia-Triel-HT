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
import { Plus, Wifi } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import {
  atualizarRedeWifi,
  criarRedeWifi,
  excluirRedeWifi,
  listarRedesWifi,
} from "../services/tvCorporativa.service";
import type { RedeWifiTv } from "../types/tvCorporativa.types";
import { RedeWifiTableRow } from "./RedeWifiTableRow";

interface RedesWifiCardProps {
  onFeedback: FeedbackHandler;
}

export function RedesWifiCard({ onFeedback }: RedesWifiCardProps) {
  const [carregando, setCarregando] = useState(true);
  const [redes, setRedes] = useState<RedeWifiTv[]>([]);

  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [ssid, setSsid] = useState("");
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [alterandoAtivaId, setAlterandoAtivaId] = useState<string | null>(null);
  const [redeParaExcluir, setRedeParaExcluir] = useState<RedeWifiTv | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const redesOrdenadas = [...redes].sort((a, b) => a.prioridade - b.prioridade);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function carregar() {
    setRedes(await listarRedesWifi());
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

  function abrirNovo() {
    setEditandoId(null);
    setSsid("");
    setSenha("");
    setModalAberto(true);
  }

  function abrirEdicao(rede: RedeWifiTv) {
    setEditandoId(rede.id);
    setSsid(rede.ssid);
    setSenha("");
    setModalAberto(true);
  }

  async function handleSalvar() {
    setSalvando(true);

    try {
      const resultado = editandoId
        ? await atualizarRedeWifi(editandoId, {
            ssid: ssid.trim(),
            ...(senha.trim() ? { senha: senha.trim() } : {}),
          })
        : await criarRedeWifi(ssid.trim(), senha.trim());

      if (resultado.ok) {
        onFeedback(
          "success",
          editandoId ? "Rede Wi-Fi atualizada" : "Rede Wi-Fi adicionada",
          resultado.message ?? "Salvo."
        );
        setModalAberto(false);
        await carregar();
      } else {
        onFeedback(
          "danger",
          "Não foi possível salvar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleAlternarAtiva(rede: RedeWifiTv, ativa: boolean) {
    setAlterandoAtivaId(rede.id);

    try {
      const resultado = await atualizarRedeWifi(rede.id, { ativa });

      if (resultado.ok) {
        await carregar();
      } else {
        onFeedback(
          "danger",
          "Não foi possível atualizar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setAlterandoAtivaId(null);
    }
  }

  async function handleReordenar(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const indiceAntigo = redesOrdenadas.findIndex((item) => item.id === active.id);
    const indiceNovo = redesOrdenadas.findIndex((item) => item.id === over.id);
    if (indiceAntigo === -1 || indiceNovo === -1) return;

    const reordenadas = arrayMove(redesOrdenadas, indiceAntigo, indiceNovo);
    const comNovaPrioridade = reordenadas.map((item, indice) => ({ ...item, prioridade: indice }));
    const alteradas = comNovaPrioridade.filter(
      (item, indice) => item.prioridade !== redesOrdenadas[indice]?.prioridade
    );

    setRedes(comNovaPrioridade);

    try {
      const resultados = await Promise.all(
        alteradas.map((item) => atualizarRedeWifi(item.id, { prioridade: item.prioridade }))
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

      setRedes(await listarRedesWifi());
    }
  }

  async function handleConfirmarExclusao() {
    if (!redeParaExcluir) return;
    setExcluindo(true);

    try {
      const resultado = await excluirRedeWifi(redeParaExcluir.id);

      onFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Rede Wi-Fi excluída" : "Não foi possível excluir",
        resultado.message ?? "Tente novamente em instantes."
      );

      if (resultado.ok) await carregar();
    } finally {
      setExcluindo(false);
      setRedeParaExcluir(null);
    }
  }

  if (carregando) {
    return <Loader label="Carregando redes Wi-Fi..." />;
  }

  return (
    <Card
      title="Redes Wi-Fi"
      description='Lista única, compartilhada por todos os terminais Linux — cada um tenta conectar em ordem de prioridade (arraste pra reordenar) até uma funcionar. Não afeta terminais Windows ou já conectados por cabo.'
      actions={
        <Button onClick={abrirNovo}>
          <Plus size={16} />
          Nova rede
        </Button>
      }
    >
      {redesOrdenadas.length === 0 ? (
        <EmptyState
          icon={<Wifi size={26} />}
          title="Nenhuma rede Wi-Fi cadastrada"
          description='Clique em "Nova rede" pra cadastrar a primeira.'
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReordenar}>
          <SortableContext
            items={redesOrdenadas.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <Table minWidth={480}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell align="center">Ordem</TableHeaderCell>
                  <TableHeaderCell>SSID</TableHeaderCell>
                  <TableHeaderCell align="center">Ativa</TableHeaderCell>
                  <TableHeaderCell align="center">Ações</TableHeaderCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {redesOrdenadas.map((rede) => (
                  <RedeWifiTableRow
                    key={rede.id}
                    rede={rede}
                    alterandoAtiva={alterandoAtivaId === rede.id}
                    onAlternarAtiva={(ativa) => handleAlternarAtiva(rede, ativa)}
                    onEditar={() => abrirEdicao(rede)}
                    onExcluir={() => setRedeParaExcluir(rede)}
                  />
                ))}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      )}

      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={editandoId ? "Editar rede Wi-Fi" : "Nova rede Wi-Fi"}
        size="small"
      >
        <Stack gap={16}>
          <Field label="SSID" htmlFor="tv-wifi-ssid" required>
            <Input
              id="tv-wifi-ssid"
              value={ssid}
              onChange={(event) => setSsid(event.target.value)}
              placeholder="Nome da rede"
            />
          </Field>

          <Field
            label="Senha"
            htmlFor="tv-wifi-senha"
            required={!editandoId}
            hint={editandoId ? "deixe em branco para manter a senha já cadastrada" : undefined}
          >
            <Input
              id="tv-wifi-senha"
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
            />
          </Field>

          <Stack direction="row" justify="end">
            <Button
              onClick={handleSalvar}
              loading={salvando}
              disabled={!ssid.trim() || (!editandoId && !senha.trim())}
            >
              Salvar
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={redeParaExcluir !== null}
        title="Excluir rede Wi-Fi?"
        message={`Os terminais Linux param de tentar conectar em "${redeParaExcluir?.ssid}". Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="danger"
        loading={excluindo}
        onClose={() => setRedeParaExcluir(null)}
        onConfirm={handleConfirmarExclusao}
      />
    </Card>
  );
}
