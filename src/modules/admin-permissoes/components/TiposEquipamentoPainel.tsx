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
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Pencil, Plus, Trash2, Warehouse } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
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
import { Textarea } from "@/components/ui/Textarea";

import {
  atualizarBlocoTipoEquipamento,
  atualizarCampoTipoEquipamento,
  atualizarTipoEquipamento,
  criarBlocoTipoEquipamento,
  criarCampoTipoEquipamento,
  criarTipoEquipamento,
  excluirBlocoTipoEquipamento,
  excluirCampoTipoEquipamento,
  listarBlocosDoTipoAdmin,
  listarCamposDoTipoAdmin,
  listarTiposEquipamentoAdmin,
  restaurarCampoSistemaEquipamento,
} from "@/modules/estoque-equipamentos-usados/services/estoque.service";
import type {
  BlocoTipoEquipamento,
  CampoTipoEquipamento,
  TipoDadoCampoEquipamento,
  TipoEquipamento,
} from "@/modules/estoque-equipamentos-usados/types/estoque.types";
import {
  CHAVE_SISTEMA_DESCRICAO,
  CHAVES_SISTEMA_SEMPRE_OBRIGATORIAS,
  ROTULO_PADRAO_CAMPO_SISTEMA,
  TODAS_CHAVES_SISTEMA,
} from "@/modules/estoque-equipamentos-usados/constants";

import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";
import { CampoTipoEquipamentoRow } from "./CampoTipoEquipamentoRow";

const TIPO_DADO_LABELS: Record<TipoDadoCampoEquipamento, string> = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
  booleano: "Sim/Não",
  unica_escolha: "Escolha única",
  multipla_escolha: "Múltipla escolha",
};

const OPCOES_TIPO_DADO = (Object.keys(TIPO_DADO_LABELS) as TipoDadoCampoEquipamento[]).map((tipo) => ({
  value: tipo,
  label: TIPO_DADO_LABELS[tipo],
}));

function formCampoInicial() {
  return {
    chave: "",
    rotulo: "",
    blocoId: "",
    tipoDado: "texto" as TipoDadoCampoEquipamento,
    opcoesTexto: "",
    unidade: "",
    obrigatorio: false,
    ordem: "0",
    geraPendencia: false,
    vemDeIntegracao: false,
  };
}

interface TiposEquipamentoPainelProps {
  onFeedback: FeedbackHandler;
}

export function TiposEquipamentoPainel({ onFeedback }: TiposEquipamentoPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [tipos, setTipos] = useState<TipoEquipamento[]>([]);
  const [tipoSelecionadoId, setTipoSelecionadoId] = useState<string | null>(null);

  const [blocosDoTipo, setBlocosDoTipo] = useState<BlocoTipoEquipamento[]>([]);
  const [carregandoBlocos, setCarregandoBlocos] = useState(false);

  const [campos, setCampos] = useState<CampoTipoEquipamento[]>([]);
  const [carregandoCampos, setCarregandoCampos] = useState(false);

  const [novoTipoNome, setNovoTipoNome] = useState("");
  const [criandoTipo, setCriandoTipo] = useState(false);
  const [erroTipo, setErroTipo] = useState<string | null>(null);

  const [novoBlocoNome, setNovoBlocoNome] = useState("");
  const [criandoBloco, setCriandoBloco] = useState(false);
  const [erroBloco, setErroBloco] = useState<string | null>(null);

  const [modalBlocoAberto, setModalBlocoAberto] = useState(false);
  const [blocoEditando, setBlocoEditando] = useState<BlocoTipoEquipamento | null>(null);
  const [formBloco, setFormBloco] = useState({ nome: "", ordem: "0" });
  const [salvandoBloco, setSalvandoBloco] = useState(false);
  const [erroBlocoModal, setErroBlocoModal] = useState<string | null>(null);

  const [blocoExcluindo, setBlocoExcluindo] = useState<BlocoTipoEquipamento | null>(null);
  const [confirmandoExclusaoBloco, setConfirmandoExclusaoBloco] = useState(false);
  const [erroExclusaoBloco, setErroExclusaoBloco] = useState<string | null>(null);

  const [modalCampoAberto, setModalCampoAberto] = useState(false);
  const [campoEditando, setCampoEditando] = useState<CampoTipoEquipamento | null>(null);
  const [formCampo, setFormCampo] = useState(formCampoInicial());
  const [salvandoCampo, setSalvandoCampo] = useState(false);
  const [erroCampo, setErroCampo] = useState<string | null>(null);

  const [campoExcluindo, setCampoExcluindo] = useState<CampoTipoEquipamento | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  const [restaurandoChave, setRestaurandoChave] = useState<string | null>(null);

  useEffect(() => {
    listarTiposEquipamentoAdmin().then((dados) => {
      setTipos(dados);
      setTipoSelecionadoId(dados[0]?.id ?? null);
      setCarregando(false);
    });
  }, []);

  useEffect(() => {
    if (!tipoSelecionadoId) {
      setBlocosDoTipo([]);
      setCampos([]);
      return;
    }

    setCarregandoBlocos(true);
    setCarregandoCampos(true);
    Promise.all([
      listarBlocosDoTipoAdmin(tipoSelecionadoId),
      listarCamposDoTipoAdmin(tipoSelecionadoId),
    ]).then(([blocosResultado, camposResultado]) => {
      setBlocosDoTipo(blocosResultado);
      setCampos(camposResultado);
      setCarregandoBlocos(false);
      setCarregandoCampos(false);
    });
  }, [tipoSelecionadoId]);

  const tipoSelecionado = tipos.find((tipo) => tipo.id === tipoSelecionadoId) ?? null;

  async function handleCriarTipo() {
    setErroTipo(null);
    setCriandoTipo(true);

    try {
      const resultado = await criarTipoEquipamento(novoTipoNome);

      if (resultado.ok && resultado.data) {
        setTipos((atual) => [...atual, resultado.data as TipoEquipamento]);
        setTipoSelecionadoId(resultado.data.id);
        setNovoTipoNome("");
        onFeedback("success", "Tipo criado", `"${resultado.data.nome}" foi cadastrado.`);
      } else {
        setErroTipo(resultado.message ?? "Não foi possível criar o tipo de equipamento.");
      }
    } finally {
      setCriandoTipo(false);
    }
  }

  async function alternarAtivoTipo(tipo: TipoEquipamento, ativo: boolean) {
    const resultado = await atualizarTipoEquipamento(tipo.id, { ativo });

    if (resultado.ok && resultado.data) {
      setTipos((atual) => atual.map((item) => (item.id === tipo.id ? (resultado.data as TipoEquipamento) : item)));
    } else {
      onFeedback("danger", "Não foi possível atualizar", resultado.message ?? "Tente novamente em instantes.");
    }
  }

  async function handleCriarBloco() {
    if (!tipoSelecionadoId) return;

    setErroBloco(null);
    setCriandoBloco(true);

    try {
      const resultado = await criarBlocoTipoEquipamento(tipoSelecionadoId, novoBlocoNome);

      if (resultado.ok && resultado.data) {
        setBlocosDoTipo((atual) => [...atual, resultado.data as BlocoTipoEquipamento]);
        setNovoBlocoNome("");
        onFeedback("success", "Bloco criado", `"${resultado.data.nome}" foi adicionado.`);
      } else {
        setErroBloco(resultado.message ?? "Não foi possível criar o bloco.");
      }
    } finally {
      setCriandoBloco(false);
    }
  }

  function abrirEdicaoBloco(bloco: BlocoTipoEquipamento) {
    setBlocoEditando(bloco);
    setFormBloco({ nome: bloco.nome, ordem: String(bloco.ordem) });
    setErroBlocoModal(null);
    setModalBlocoAberto(true);
  }

  function fecharModalBloco() {
    setModalBlocoAberto(false);
    setBlocoEditando(null);
  }

  async function handleSalvarBloco() {
    if (!tipoSelecionadoId || !blocoEditando) return;

    setErroBlocoModal(null);
    setSalvandoBloco(true);

    try {
      const novoNome = formBloco.nome;
      const novaOrdem = Number(formBloco.ordem) || 0;
      const resultado = await atualizarBlocoTipoEquipamento(tipoSelecionadoId, blocoEditando.id, {
        nome: novoNome,
        ordem: novaOrdem,
      });

      if (resultado.ok) {
        setBlocosDoTipo((atual) =>
          atual.map((item) =>
            item.id === blocoEditando.id ? { ...item, nome: novoNome, ordem: novaOrdem } : item
          )
        );
        fecharModalBloco();
        onFeedback("success", "Bloco atualizado", `"${novoNome}" foi salvo.`);
      } else {
        setErroBlocoModal(resultado.message ?? "Não foi possível salvar o bloco.");
      }
    } finally {
      setSalvandoBloco(false);
    }
  }

  async function alternarAtivoBloco(bloco: BlocoTipoEquipamento, ativo: boolean) {
    if (!tipoSelecionadoId) return;

    const resultado = await atualizarBlocoTipoEquipamento(tipoSelecionadoId, bloco.id, { ativo });

    if (resultado.ok) {
      setBlocosDoTipo((atual) => atual.map((item) => (item.id === bloco.id ? { ...item, ativo } : item)));
    } else {
      onFeedback("danger", "Não foi possível atualizar", resultado.message ?? "Tente novamente em instantes.");
    }
  }

  async function handleConfirmarExclusaoBloco() {
    if (!blocoExcluindo || !tipoSelecionadoId) return;

    setErroExclusaoBloco(null);

    const resultado = await excluirBlocoTipoEquipamento(tipoSelecionadoId, blocoExcluindo.id);

    if (resultado.ok) {
      setBlocosDoTipo((atual) => atual.filter((item) => item.id !== blocoExcluindo.id));
      onFeedback("success", "Bloco excluído", `"${blocoExcluindo.nome}" foi removido.`);
      setBlocoExcluindo(null);
    } else {
      setErroExclusaoBloco(resultado.message ?? "Não foi possível excluir o bloco.");
    }

    setConfirmandoExclusaoBloco(false);
  }

  /* Sempre a próxima livre dentro do bloco escolhido (0 se ainda não há nenhum campo lá). */
  function proximaOrdemCampo(blocoId: string): number {
    const maiorOrdemAtual = campos
      .filter((campo) => campo.blocoId === blocoId)
      .reduce((maior, campo) => Math.max(maior, campo.ordem), -1);

    return maiorOrdemAtual + 1;
  }

  function abrirNovoCampo() {
    const blocoPadrao = blocosDoTipo[0]?.id ?? "";
    setCampoEditando(null);
    setFormCampo({
      ...formCampoInicial(),
      blocoId: blocoPadrao,
      ordem: String(proximaOrdemCampo(blocoPadrao)),
    });
    setErroCampo(null);
    setModalCampoAberto(true);
  }

  function abrirEdicaoCampo(campo: CampoTipoEquipamento) {
    setCampoEditando(campo);
    setFormCampo({
      chave: campo.chave,
      rotulo: campo.rotulo,
      blocoId: campo.blocoId,
      tipoDado: campo.tipoDado,
      opcoesTexto: campo.opcoes?.join("\n") ?? "",
      unidade: campo.unidade ?? "",
      obrigatorio: campo.obrigatorio,
      ordem: String(campo.ordem),
      geraPendencia: campo.geraPendencia,
      vemDeIntegracao: campo.vemDeIntegracao,
    });
    setErroCampo(null);
    setModalCampoAberto(true);
  }

  function fecharModalCampo() {
    setModalCampoAberto(false);
    setCampoEditando(null);
  }

  async function handleSalvarCampo() {
    if (!tipoSelecionadoId) return;

    setErroCampo(null);
    setSalvandoCampo(true);

    try {
      const ehEscolha = formCampo.tipoDado === "unica_escolha" || formCampo.tipoDado === "multipla_escolha";
      const opcoes = ehEscolha
        ? formCampo.opcoesTexto
            .split("\n")
            .map((linha) => linha.trim())
            .filter(Boolean)
        : null;

      if (campoEditando) {
        const resultado = await atualizarCampoTipoEquipamento(tipoSelecionadoId, campoEditando.id, {
          rotulo: formCampo.rotulo,
          unidade: formCampo.unidade || null,
          obrigatorio: formCampo.obrigatorio,
          ordem: Number(formCampo.ordem) || 0,
          vemDeIntegracao: formCampo.vemDeIntegracao,
          /*
           * tipoDado/opcoes nunca podem ser enviados pra um campo de
           * sistema — o backend recusa a requisição inteira só de ver
           * esses campos presentes no corpo, mesmo com o mesmo valor de
           * antes (não compara, só checa presença). Bug real: antes
           * disso, editar QUALQUER coisa (rótulo, ordem...) num campo de
           * sistema pelo modal falhava, porque esses dois campos eram
           * sempre enviados juntos independente do tipo do campo.
           */
          ...(campoEditando.ehSistema
            ? { geraPendencia: formCampo.geraPendencia }
            : { tipoDado: formCampo.tipoDado, opcoes }),
        });

        if (resultado.ok) {
          setCampos((atual) =>
            atual.map((item) =>
              item.id === campoEditando.id
                ? {
                    ...item,
                    rotulo: formCampo.rotulo,
                    tipoDado: formCampo.tipoDado,
                    opcoes,
                    unidade: formCampo.unidade || null,
                    obrigatorio: formCampo.obrigatorio,
                    ordem: Number(formCampo.ordem) || 0,
                    geraPendencia: campoEditando.ehSistema ? formCampo.geraPendencia : item.geraPendencia,
                    vemDeIntegracao: formCampo.vemDeIntegracao,
                  }
                : item
            )
          );
          fecharModalCampo();
          onFeedback("success", "Campo atualizado", `"${formCampo.rotulo}" foi salvo.`);
        } else {
          setErroCampo(resultado.message ?? "Não foi possível salvar o campo.");
        }

        return;
      }

      const resultado = await criarCampoTipoEquipamento(tipoSelecionadoId, {
        blocoId: formCampo.blocoId,
        chave: formCampo.chave,
        rotulo: formCampo.rotulo,
        tipoDado: formCampo.tipoDado,
        opcoes,
        unidade: formCampo.unidade || null,
        obrigatorio: formCampo.obrigatorio,
        ordem: Number(formCampo.ordem) || 0,
        vemDeIntegracao: formCampo.vemDeIntegracao,
      });

      if (resultado.ok && resultado.data) {
        setCampos((atual) => [...atual, resultado.data as CampoTipoEquipamento]);
        fecharModalCampo();
        onFeedback("success", "Campo criado", `"${resultado.data.rotulo}" foi adicionado.`);
      } else {
        setErroCampo(resultado.message ?? "Não foi possível criar o campo.");
      }
    } finally {
      setSalvandoCampo(false);
    }
  }

  async function alternarAtivoCampo(campo: CampoTipoEquipamento, ativo: boolean) {
    if (!tipoSelecionadoId) return;

    const resultado = await atualizarCampoTipoEquipamento(tipoSelecionadoId, campo.id, { ativo });

    if (resultado.ok) {
      setCampos((atual) => atual.map((item) => (item.id === campo.id ? { ...item, ativo } : item)));
    } else {
      onFeedback("danger", "Não foi possível atualizar", resultado.message ?? "Tente novamente em instantes.");
    }
  }

  /*
   * Reordenação por arrasto (mesmo padrão de SetoresModulosPainel/
   * SetorCard): aplica a ordem otimista na UI, salva em paralelo só os
   * campos cuja ordem realmente mudou e, se alguma chamada falhar, busca
   * a lista real do servidor de novo em vez de deixar o estado local
   * mentir. Vale pra campo de sistema também — só ordem, sem outra
   * restrição.
   */
  async function handleReordenarCampos(camposReordenadosDoBloco: CampoTipoEquipamento[]) {
    if (!tipoSelecionadoId) return;

    const ordemAnteriorPorId = new Map(campos.map((campo) => [campo.id, campo.ordem]));
    const comNovaOrdem = camposReordenadosDoBloco.map((campo, indice) => ({ ...campo, ordem: indice }));
    const alterados = comNovaOrdem.filter((campo) => campo.ordem !== ordemAnteriorPorId.get(campo.id));

    if (alterados.length === 0) return;

    setCampos((atual) => {
      const porId = new Map(comNovaOrdem.map((campo) => [campo.id, campo]));
      return atual.map((campo) => porId.get(campo.id) ?? campo);
    });

    try {
      const resultados = await Promise.all(
        alterados.map((campo) => atualizarCampoTipoEquipamento(tipoSelecionadoId, campo.id, { ordem: campo.ordem }))
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

      const camposAtuais = await listarCamposDoTipoAdmin(tipoSelecionadoId);
      setCampos(camposAtuais);
    }
  }

  async function handleConfirmarExclusaoCampo() {
    if (!campoExcluindo || !tipoSelecionadoId) return;

    setErroExclusao(null);

    const resultado = await excluirCampoTipoEquipamento(tipoSelecionadoId, campoExcluindo.id);

    if (resultado.ok) {
      setCampos((atual) => atual.filter((item) => item.id !== campoExcluindo.id));
      onFeedback("success", "Campo excluído", `"${campoExcluindo.rotulo}" foi removido.`);
      setCampoExcluindo(null);
    } else {
      setErroExclusao(resultado.message ?? "Não foi possível excluir o campo.");
    }

    setConfirmandoExclusao(false);
  }

  async function handleRestaurarCampoSistema(chave: string) {
    if (!tipoSelecionadoId) return;

    setRestaurandoChave(chave);

    try {
      const resultado = await restaurarCampoSistemaEquipamento(tipoSelecionadoId, chave);

      if (resultado.ok && resultado.data) {
        setCampos((atual) => [...atual, resultado.data as CampoTipoEquipamento]);
        onFeedback("success", "Campo restaurado", `"${resultado.data.rotulo}" voltou a existir.`);
      } else {
        onFeedback("danger", "Não foi possível restaurar", resultado.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setRestaurandoChave(null);
    }
  }

  if (carregando) {
    return <Loader label="Carregando tipos de equipamento..." />;
  }

  const opcoesBloco = blocosDoTipo.map((bloco) => ({
    value: bloco.id,
    label: bloco.ehFixo ? `${bloco.nome} (fixo)` : bloco.nome,
  }));

  const chavesSistemaFaltantes = TODAS_CHAVES_SISTEMA.filter(
    (chave) => !campos.some((campo) => campo.chave === chave)
  );

  const camposPorBlocoId = new Map<string, CampoTipoEquipamento[]>();
  for (const campo of campos) {
    if (!camposPorBlocoId.has(campo.blocoId)) camposPorBlocoId.set(campo.blocoId, []);
    camposPorBlocoId.get(campo.blocoId)?.push(campo);
  }
  for (const lista of camposPorBlocoId.values()) {
    lista.sort((a, b) => a.ordem - b.ordem);
  }

  return (
    <Stack gap={20}>
      <Card
        title="Tipos de equipamento"
        description="Cada tipo define os blocos e campos técnicos que aparecem na entrada de um equipamento usado desse tipo (ex: Silo Graneleiro)."
      >
        <Stack gap={16}>
          <Stack direction="row" gap={12} align="end">
            <div style={{ flex: 1, maxWidth: 360 }}>
              <Field label="Novo tipo">
                <Input value={novoTipoNome} onChange={(event) => setNovoTipoNome(event.target.value)} />
              </Field>
            </div>
            <Button onClick={handleCriarTipo} loading={criandoTipo} disabled={!novoTipoNome.trim()}>
              <Plus size={16} />
              Criar tipo
            </Button>
          </Stack>

          {erroTipo && <Alert variant="danger">{erroTipo}</Alert>}

          {tipos.length === 0 ? (
            <EmptyState icon={<Warehouse size={28} />} title="Nenhum tipo de equipamento cadastrado" />
          ) : (
            <Table minWidth={500}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Nome</TableHeaderCell>
                  <TableHeaderCell align="center">Ativo</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tipos.map((tipo) => (
                  <TableRow
                    key={tipo.id}
                    style={{
                      cursor: "pointer",
                      background: tipo.id === tipoSelecionadoId ? "var(--bg-hover-neutral)" : undefined,
                    }}
                    onClick={() => setTipoSelecionadoId(tipo.id)}
                  >
                    <TableCell>{tipo.nome}</TableCell>
                    <TableCell align="center">
                      <div className={styles.checkboxCentro}>
                        <Switch
                          label=""
                          compact
                          checked={tipo.ativo}
                          onChange={(event) => {
                            event.stopPropagation();
                            alternarAtivoTipo(tipo, event.target.checked);
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Card>

      {tipoSelecionado && (
        <Card
          title={`Blocos de "${tipoSelecionado.nome}"`}
          description='Seções em que os campos técnicos são agrupados na entrada. "Recebimento" é criado automaticamente e não pode ser excluído.'
        >
          <Stack gap={16}>
            <Stack direction="row" gap={12} align="end">
              <div style={{ flex: 1, maxWidth: 360 }}>
                <Field label="Novo bloco">
                  <Input value={novoBlocoNome} onChange={(event) => setNovoBlocoNome(event.target.value)} />
                </Field>
              </div>
              <Button onClick={handleCriarBloco} loading={criandoBloco} disabled={!novoBlocoNome.trim()}>
                <Plus size={16} />
                Adicionar bloco
              </Button>
            </Stack>

            {erroBloco && <Alert variant="danger">{erroBloco}</Alert>}

            {carregandoBlocos ? (
              <Loader label="Carregando blocos..." />
            ) : (
              <Table minWidth={560}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Nome</TableHeaderCell>
                    <TableHeaderCell align="center">Ordem</TableHeaderCell>
                    <TableHeaderCell align="center">Ativo</TableHeaderCell>
                    <TableHeaderCell align="center"> </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {blocosDoTipo.map((bloco) => (
                    <TableRow key={bloco.id}>
                      <TableCell>
                        <Stack direction="row" gap={8} align="center">
                          {bloco.nome}
                          {bloco.ehFixo && <Badge variant="info">Fixo</Badge>}
                        </Stack>
                      </TableCell>
                      <TableCell align="center">{bloco.ordem}</TableCell>
                      <TableCell align="center">
                        <div className={styles.checkboxCentro}>
                          <Switch
                            label=""
                            compact
                            checked={bloco.ativo}
                            onChange={(event) => alternarAtivoBloco(bloco, event.target.checked)}
                          />
                        </div>
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" gap={6} justify="center">
                          <IconButton
                            size="small"
                            variant="neutral"
                            icon={<Pencil size={13} />}
                            label="Editar bloco"
                            onClick={() => abrirEdicaoBloco(bloco)}
                          />
                          {!bloco.ehFixo && (
                            <IconButton
                              size="small"
                              variant="danger"
                              icon={<Trash2 size={13} />}
                              label="Excluir bloco"
                              onClick={() => {
                                setBlocoExcluindo(bloco);
                                setConfirmandoExclusaoBloco(true);
                              }}
                            />
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Stack>
        </Card>
      )}

      {tipoSelecionado && (
        <Card
          title={`Campos de "${tipoSelecionado.nome}"`}
          description="Agrupados por bloco — cada campo vira um input no formulário de entrada e na edição posterior."
          actions={
            <Button onClick={abrirNovoCampo} disabled={blocosDoTipo.length === 0}>
              <Plus size={16} />
              Adicionar campo
            </Button>
          }
        >
          <Stack gap={16}>
            {chavesSistemaFaltantes.length > 0 && (
              <Stack gap={8}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-soft)" }}>
                  Campos do sistema removidos deste tipo
                </span>
                <Stack direction="row" gap={8} wrap>
                  {chavesSistemaFaltantes.map((chave) => (
                    <Button
                      key={chave}
                      variant="secondary"
                      loading={restaurandoChave === chave}
                      onClick={() => handleRestaurarCampoSistema(chave)}
                    >
                      <Plus size={14} />
                      {ROTULO_PADRAO_CAMPO_SISTEMA[chave]}
                    </Button>
                  ))}
                </Stack>
              </Stack>
            )}

            {carregandoCampos ? (
              <Loader label="Carregando campos..." />
            ) : campos.length === 0 ? (
              <EmptyState
                icon={<Warehouse size={28} />}
                title="Nenhum campo cadastrado"
                description="Adicione o primeiro campo técnico desse tipo de equipamento."
              />
            ) : (
              blocosDoTipo.map((bloco) => (
                <BlocoCamposTabela
                  key={bloco.id}
                  bloco={bloco}
                  campos={camposPorBlocoId.get(bloco.id) ?? []}
                  onReordenar={handleReordenarCampos}
                  onAlternarAtivo={alternarAtivoCampo}
                  onEditar={abrirEdicaoCampo}
                  onExcluirClick={(campo) => {
                    setCampoExcluindo(campo);
                    setConfirmandoExclusao(true);
                  }}
                />
              ))
            )}
          </Stack>
        </Card>
      )}

      <Modal
        open={modalBlocoAberto}
        title={blocoEditando ? `Editar bloco "${blocoEditando.nome}"` : "Adicionar bloco"}
        onClose={fecharModalBloco}
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={fecharModalBloco}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarBloco} loading={salvandoBloco} disabled={!formBloco.nome.trim()}>
              Salvar
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          <FormGrid columns={2}>
            <Field label="Nome">
              <Input
                value={formBloco.nome}
                onChange={(event) => setFormBloco((atual) => ({ ...atual, nome: event.target.value }))}
              />
            </Field>
            <Field label="Ordem">
              <NumberInput
                value={formBloco.ordem}
                onChange={(event) => setFormBloco((atual) => ({ ...atual, ordem: event.target.value }))}
              />
            </Field>
          </FormGrid>

          {erroBlocoModal && <Alert variant="danger">{erroBlocoModal}</Alert>}
        </Stack>
      </Modal>

      <ConfirmDialog
        open={confirmandoExclusaoBloco}
        title="Excluir bloco?"
        variant="danger"
        message={
          blocoExcluindo
            ? erroExclusaoBloco ??
              `"${blocoExcluindo.nome}" será removido. Se já houver campos ou evidências cadastrados nesse bloco, a exclusão não será possível — desative-o nesse caso.`
            : ""
        }
        confirmLabel="Excluir"
        onConfirm={handleConfirmarExclusaoBloco}
        onClose={() => {
          setBlocoExcluindo(null);
          setErroExclusaoBloco(null);
        }}
      />

      <Modal
        open={modalCampoAberto}
        title={campoEditando ? `Editar campo "${campoEditando.rotulo}"` : "Adicionar campo"}
        onClose={fecharModalCampo}
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={fecharModalCampo}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarCampo}
              loading={salvandoCampo}
              disabled={!formCampo.chave.trim() || !formCampo.rotulo.trim() || !formCampo.blocoId}
            >
              Salvar
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          <FormGrid columns={2}>
            <Field
              label="Chave"
              hint={
                campoEditando
                  ? "Não é possível alterar depois de criado — identifica o campo nos dados já salvos."
                  : 'Ex: "capacidadeM3" — sem espaços/acentos'
              }
            >
              <Input
                value={formCampo.chave}
                disabled={campoEditando !== null}
                onChange={(event) => setFormCampo((atual) => ({ ...atual, chave: event.target.value }))}
              />
            </Field>
            <Field label="Rótulo">
              <Input
                value={formCampo.rotulo}
                onChange={(event) => setFormCampo((atual) => ({ ...atual, rotulo: event.target.value }))}
              />
            </Field>
          </FormGrid>

          <FormGrid columns={2}>
            <Field label="Bloco" hint={campoEditando ? "Não é possível mover o campo de bloco depois de criado." : undefined}>
              <Dropdown
                value={formCampo.blocoId}
                options={opcoesBloco}
                disabled={campoEditando !== null}
                onValueChange={(valor) => {
                  setFormCampo((atual) => ({ ...atual, blocoId: valor, ordem: String(proximaOrdemCampo(valor)) }));
                }}
              />
            </Field>
            <Field
              label="Tipo de dado"
              hint={campoEditando?.ehSistema ? "Campo do sistema — tipo de dado fixo." : undefined}
            >
              <Dropdown
                value={formCampo.tipoDado}
                options={OPCOES_TIPO_DADO}
                disabled={campoEditando?.ehSistema}
                onValueChange={(valor) =>
                  setFormCampo((atual) => ({ ...atual, tipoDado: valor as TipoDadoCampoEquipamento }))
                }
              />
            </Field>
          </FormGrid>

          {(formCampo.tipoDado === "unica_escolha" || formCampo.tipoDado === "multipla_escolha") && (
            <Field label="Opções" hint="Uma por linha">
              <Textarea
                rows={4}
                value={formCampo.opcoesTexto}
                onChange={(event) =>
                  setFormCampo((atual) => ({ ...atual, opcoesTexto: event.target.value }))
                }
              />
            </Field>
          )}

          <FormGrid columns={2}>
            <Field label="Unidade" hint="Opcional — ex: mm, m³, t">
              <Input
                value={formCampo.unidade}
                onChange={(event) => setFormCampo((atual) => ({ ...atual, unidade: event.target.value }))}
              />
            </Field>
            <Field label="Ordem">
              <NumberInput
                value={formCampo.ordem}
                onChange={(event) => setFormCampo((atual) => ({ ...atual, ordem: event.target.value }))}
              />
            </Field>
          </FormGrid>

          <Checkbox
            label="Vem de integração (preenchido automaticamente por uma integração externa)"
            checked={formCampo.vemDeIntegracao}
            onChange={(event) =>
              setFormCampo((atual) => ({
                ...atual,
                vemDeIntegracao: event.target.checked,
                obrigatorio: event.target.checked ? false : atual.obrigatorio,
              }))
            }
          />

          <Checkbox
            label="Obrigatório"
            checked={formCampo.obrigatorio}
            disabled={
              formCampo.vemDeIntegracao ||
              (campoEditando !== null &&
                campoEditando.ehSistema &&
                CHAVES_SISTEMA_SEMPRE_OBRIGATORIAS.includes(campoEditando.chave))
            }
            onChange={(event) =>
              setFormCampo((atual) => ({
                ...atual,
                obrigatorio: event.target.checked,
                geraPendencia: event.target.checked ? false : atual.geraPendencia,
              }))
            }
          />

          {formCampo.vemDeIntegracao && (
            <Alert variant="info">
              Este campo é preenchido por uma integração externa — por isso não pode ser obrigatório
              no cadastro nem digitado pelo usuário.
            </Alert>
          )}

          {campoEditando?.ehSistema && (
            <Checkbox
              label='Vira status quando em branco ("pendência")'
              checked={formCampo.geraPendencia}
              disabled={formCampo.obrigatorio}
              onChange={(event) =>
                setFormCampo((atual) => ({ ...atual, geraPendencia: event.target.checked }))
              }
            />
          )}

          {erroCampo && <Alert variant="danger">{erroCampo}</Alert>}
        </Stack>
      </Modal>

      <ConfirmDialog
        open={confirmandoExclusao}
        title="Excluir campo?"
        variant="danger"
        message={
          campoExcluindo
            ? erroExclusao ??
              `"${campoExcluindo.rotulo}" será removido. Se já houver equipamentos com valor preenchido para este campo, a exclusão não será possível — desative-o nesse caso.`
            : ""
        }
        confirmLabel="Excluir"
        onConfirm={handleConfirmarExclusaoCampo}
        onClose={() => {
          setCampoExcluindo(null);
          setErroExclusao(null);
        }}
      />
    </Stack>
  );
}

interface BlocoCamposTabelaProps {
  bloco: BlocoTipoEquipamento;
  campos: CampoTipoEquipamento[];
  onReordenar: (camposReordenadosDoBloco: CampoTipoEquipamento[]) => void;
  onAlternarAtivo: (campo: CampoTipoEquipamento, ativo: boolean) => void;
  onEditar: (campo: CampoTipoEquipamento) => void;
  onExcluirClick: (campo: CampoTipoEquipamento) => void;
}

/*
 * Uma tabela por bloco, cada uma com seu próprio DndContext — arrastar só
 * reordena dentro do mesmo bloco (mesmo padrão de SetorCard/GrupoWikiCard:
 * grupo com sub-lista independentemente arrastável).
 */
function BlocoCamposTabela({
  bloco,
  campos,
  onReordenar,
  onAlternarAtivo,
  onEditar,
  onExcluirClick,
}: BlocoCamposTabelaProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const indiceAntigo = campos.findIndex((campo) => campo.id === active.id);
    const indiceNovo = campos.findIndex((campo) => campo.id === over.id);
    if (indiceAntigo === -1 || indiceNovo === -1) return;

    onReordenar(arrayMove(campos, indiceAntigo, indiceNovo));
  }

  return (
    <Stack gap={8}>
      <Stack direction="row" gap={8} align="center">
        <strong>{bloco.nome}</strong>
        {bloco.ehFixo && <Badge variant="info">Fixo</Badge>}
      </Stack>

      {campos.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Nenhum campo neste bloco.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={campos.map((campo) => campo.id)} strategy={verticalListSortingStrategy}>
            <Table minWidth={720}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell align="center"> </TableHeaderCell>
                  <TableHeaderCell>Rótulo</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Unidade</TableHeaderCell>
                  <TableHeaderCell align="center">Obrigatório</TableHeaderCell>
                  <TableHeaderCell align="center">Ativo</TableHeaderCell>
                  <TableHeaderCell align="center"> </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {campos.map((campo) => (
                  <CampoTipoEquipamentoRow
                    key={campo.id}
                    campo={campo}
                    travaAtivo={campo.ehSistema && CHAVES_SISTEMA_SEMPRE_OBRIGATORIAS.includes(campo.chave)}
                    podeExcluir={campo.chave !== CHAVE_SISTEMA_DESCRICAO}
                    onAlternarAtivo={(ativo) => onAlternarAtivo(campo, ativo)}
                    onEditar={() => onEditar(campo)}
                    onExcluirClick={() => onExcluirClick(campo)}
                  />
                ))}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      )}
    </Stack>
  );
}
