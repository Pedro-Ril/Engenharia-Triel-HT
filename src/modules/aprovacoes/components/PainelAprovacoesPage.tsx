"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Home,
  Layers,
  PencilLine,
  ShieldOff,
  User,
  XCircle,
} from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { rotuloTipoAprovacao, type TipoAprovacao } from "@/lib/aprovacoes/tipos-aprovacao";

import { statusAprovacaoConfig } from "../constants/approval-status";
import {
  aprovarItemAprovacao,
  buscarItemAprovacao,
  buscarLoteAprovacao,
  decidirItensEmLote,
  listarItensPainel,
  reprovarItemAprovacao,
  type AjusteValoresDecisao,
  type ModoPainel,
  type OrdemPainel,
  type SolicitacaoResumoPainel,
} from "../services/aprovacoes.service";
import type { AprovacaoLote, ItemAumentoSalarial, StatusAprovacao } from "../types/aprovacoes.types";
import { AbasTipoAprovacao } from "./AbasTipoAprovacao";

type FiltroStatus = StatusAprovacao | "todos";

const OPCOES_STATUS: { value: FiltroStatus; label: string }[] = [
  { value: "pendente", label: "Pendentes" },
  { value: "aprovado", label: "Aprovados" },
  { value: "reprovado", label: "Reprovados" },
  { value: "todos", label: "Todos" },
];

const OPCOES_ORDEM: { value: OrdemPainel; label: string }[] = [
  { value: "fila", label: "Fila (pendentes primeiro)" },
  { value: "colaborador", label: "Colaborador (A-Z)" },
  { value: "recentes", label: "Mais recentes" },
];

const TODOS = "";
const POR_PAGINA = 20;

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarDataAdmissao(valorIso: string | null): string {
  if (!valorIso) return "-";
  const [ano, mes, dia] = valorIso.slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : "-";
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarReajuste(valor: number, percentual: number): string {
  return `${formatarMoeda(valor)} (${Number(percentual).toFixed(2)}%)`;
}

export function PainelAprovacoesPage() {
  const [itens, setItens] = useState<ItemAumentoSalarial[]>([]);
  const [tiposAtendidos, setTiposAtendidos] = useState<TipoAprovacao[]>([]);
  const [pendentesPorTipo, setPendentesPorTipo] = useState<Record<string, number>>({});
  const [departamentos, setDepartamentos] = useState<string[]>([]);
  const [setores, setSetores] = useState<string[]>([]);
  /* Resumo por solicitação vem do servidor: as contagens são do lote inteiro, não só do que passou pelo filtro. */
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoResumoPainel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [avisoLote, setAvisoLote] = useState<string | null>(null);

  /*
   * O modo padrão vem da configuração do admin, mas só manda na PRIMEIRA
   * carga -- depois disso quem manda é a escolha de quem está usando a
   * tela, senão cada recarga desfaria a troca.
   */
  const [modo, setModo] = useState<ModoPainel>("colaborador");
  const modoInicializado = useRef(false);

  const [status, setStatus] = useState<FiltroStatus>("pendente");
  const [tipo, setTipo] = useState<string>(TODOS);
  const [departamento, setDepartamento] = useState(TODOS);
  const [setor, setSetor] = useState(TODOS);
  const [ordem, setOrdem] = useState<OrdemPainel>("fila");
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");

  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [acaoLote, setAcaoLote] = useState<"aprovar" | "reprovar" | null>(null);
  const [comentarioLote, setComentarioLote] = useState("");
  const [erroComentarioLote, setErroComentarioLote] = useState(false);
  const [processandoLote, setProcessandoLote] = useState(false);

  const [itemIdSelecionado, setItemIdSelecionado] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ItemAumentoSalarial | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [comentarioAprovar, setComentarioAprovar] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);

  /* Modal do modo agrupado: a solicitação inteira, decidida colaborador a colaborador. */
  const [numeroAberto, setNumeroAberto] = useState<number | null>(null);
  const [loteDetalhe, setLoteDetalhe] = useState<AprovacaoLote | null>(null);
  const [carregandoLote, setCarregandoLote] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [itemProcessando, setItemProcessando] = useState<string | null>(null);
  const [itemReprovando, setItemReprovando] = useState<ItemAumentoSalarial | null>(null);
  const [comentarioItemLote, setComentarioItemLote] = useState("");
  const [erroComentarioItemLote, setErroComentarioItemLote] = useState(false);
  /* Valor/percentual editáveis de cada colaborador dentro do modal da solicitação, na mesma regra do modal individual. */
  const [valoresPorItem, setValoresPorItem] = useState<
    Record<string, { valor: string; percentual: string; editado: boolean }>
  >({});

  /* Valores editáveis do modal por colaborador -- `valoresEditados` evita mandar um "ajuste" só porque o campo foi renderizado arredondado. */
  const [valorEditado, setValorEditado] = useState("");
  const [percentualEditado, setPercentualEditado] = useState("");
  const [valoresEditados, setValoresEditados] = useState(false);

  /* Aprovar também confirma: é decisão de impacto e, ao contrário de reprovar, não tinha nenhuma barreira. */
  const [confirmandoAprovar, setConfirmandoAprovar] = useState(false);
  const [itemAprovando, setItemAprovando] = useState<ItemAumentoSalarial | null>(null);
  const [pagina, setPagina] = useState(1);
  const [confirmandoReprovar, setConfirmandoReprovar] = useState(false);
  const [comentarioReprovar, setComentarioReprovar] = useState("");
  const [erroComentarioReprovar, setErroComentarioReprovar] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setBusca(buscaDigitada.trim()), 400);
    return () => clearTimeout(timer);
  }, [buscaDigitada]);

  function carregarLista() {
    setCarregando(true);
    /* O aviso descreve a decisão anterior; manter na tela depois de trocar filtro confundiria com a lista nova. */
    setAvisoLote(null);
    listarItensPainel({ status, busca, tipo, departamento, setor, ordem }).then((resultado) => {
      if (resultado.ok && resultado.data) {
        setItens(resultado.data.itens);
        setSolicitacoes(resultado.data.solicitacoes);
        setTiposAtendidos(resultado.data.tiposAtendidos);
        setPendentesPorTipo(resultado.data.pendentesPorTipo);

        /* A fila é sempre a de UM tipo -- são módulos diferentes, com colunas diferentes. */
        if (resultado.data.tiposAtendidos.length > 0 && !tipo) {
          setTipo(resultado.data.tiposAtendidos[0]);
        }
        setDepartamentos(resultado.data.departamentos);
        setSetores(resultado.data.setores);
        setErroLista(null);

        if (!modoInicializado.current) {
          modoInicializado.current = true;
          setModo(resultado.data.modoPadrao);
        }
      } else {
        setErroLista(resultado.message ?? "Não foi possível carregar as pendências.");
      }
      /* A seleção não sobrevive a uma troca de filtro: o que estava marcado pode nem estar mais na tela. */
      setSelecionados([]);
      setPagina(1);
      setCarregando(false);
    });
  }

  useEffect(carregarLista, [status, busca, tipo, departamento, setor, ordem]);

  const agrupado = modo === "solicitacao";

  const pendentesVisiveis = useMemo(
    () => itens.filter((item) => item.status === "pendente"),
    [itens]
  );

  /*
   * Paginação no cliente: a consulta já devolve tudo (volume baixo por
   * natureza), o que incomoda é a lista sem fim na tela.
   */
  const totalPaginas = Math.max(
    1,
    Math.ceil((agrupado ? solicitacoes.length : itens.length) / POR_PAGINA)
  );
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;

  const itensPagina = useMemo(
    () => itens.slice(inicio, inicio + POR_PAGINA),
    [itens, inicio]
  );
  const solicitacoesPagina = useMemo(
    () => solicitacoes.slice(inicio, inicio + POR_PAGINA),
    [solicitacoes, inicio]
  );

  const todosSelecionados =
    pendentesVisiveis.length > 0 && selecionados.length === pendentesVisiveis.length;

  function alternarSelecao(itemId: string) {
    setSelecionados((atual) =>
      atual.includes(itemId) ? atual.filter((id) => id !== itemId) : [...atual, itemId]
    );
  }

  function alternarTodos() {
    setSelecionados(todosSelecionados ? [] : pendentesVisiveis.map((item) => item.id));
  }

  function abrirDetalhe(itemId: string) {
    setItemIdSelecionado(itemId);
    setDetalhe(null);
    setErroModal(null);
    setComentarioAprovar("");
    setComentarioReprovar("");
    setValoresEditados(false);
    setCarregandoDetalhe(true);

    buscarItemAprovacao(itemId).then((resultado) => {
      if (resultado.ok && resultado.data) {
        setDetalhe(resultado.data);
        setValorEditado(resultado.data.valorReajuste.toFixed(2));
        setPercentualEditado(Number(resultado.data.percentualReajuste).toFixed(2));
      } else {
        setErroModal(resultado.message ?? "Não foi possível carregar o colaborador.");
      }
      setCarregandoDetalhe(false);
    });
  }

  function carregarLote(numero: number) {
    setCarregandoLote(true);
    return buscarLoteAprovacao(numero).then((resultado) => {
      if (resultado.ok && resultado.data) {
        setLoteDetalhe(resultado.data);
        setErroLote(null);

        const iniciais: Record<string, { valor: string; percentual: string; editado: boolean }> = {};
        for (const item of resultado.data.itens) {
          iniciais[item.id] = {
            valor: item.valorReajuste.toFixed(2),
            percentual: Number(item.percentualReajuste).toFixed(2),
            editado: false,
          };
        }
        setValoresPorItem(iniciais);
      } else {
        setErroLote(resultado.message ?? "Não foi possível carregar a solicitação.");
      }
      setCarregandoLote(false);
    });
  }

  function abrirSolicitacao(numero: number) {
    setNumeroAberto(numero);
    setLoteDetalhe(null);
    setErroLote(null);
    carregarLote(numero);
  }

  function fecharModal() {
    if (processando) return;
    setItemIdSelecionado(null);
    setDetalhe(null);
  }

  function handleValorChange(texto: string) {
    setValorEditado(texto);
    setValoresEditados(true);

    if (detalhe && texto) {
      setPercentualEditado(((Number(texto) / detalhe.salarioAtual) * 100).toFixed(2));
    }
  }

  function handlePercentualChange(texto: string) {
    setPercentualEditado(texto);
    setValoresEditados(true);

    const percentual = Number(texto);
    if (detalhe && texto && Number.isFinite(percentual)) {
      setValorEditado(((detalhe.salarioAtual * percentual) / 100).toFixed(2));
    }
  }

  const valorNumerico = Number(valorEditado);
  const percentualNumerico = Number(percentualEditado);
  const valoresValidos = valorNumerico > 0 && percentualNumerico > 0;

  function montarAjuste(): AjusteValoresDecisao | null {
    if (!valoresEditados || !valoresValidos) return null;
    return { valorReajuste: valorNumerico, percentualReajuste: percentualNumerico };
  }

  async function handleAprovar() {
    if (!itemIdSelecionado) return;

    setProcessando(true);
    setErroModal(null);

    try {
      const resultado = await aprovarItemAprovacao(
        itemIdSelecionado,
        comentarioAprovar.trim() || null,
        montarAjuste()
      );

      if (resultado.ok) {
        setItemIdSelecionado(null);
        setDetalhe(null);
        carregarLista();
      } else {
        setErroModal(resultado.message ?? "Não foi possível aprovar o colaborador.");
      }
    } finally {
      setProcessando(false);
    }
  }

  async function handleConfirmarReprovar() {
    if (!itemIdSelecionado) return;

    if (!comentarioReprovar.trim()) {
      setErroComentarioReprovar(true);
      return;
    }

    setProcessando(true);

    try {
      const resultado = await reprovarItemAprovacao(
        itemIdSelecionado,
        comentarioReprovar.trim(),
        montarAjuste()
      );

      if (resultado.ok) {
        setConfirmandoReprovar(false);
        setItemIdSelecionado(null);
        setDetalhe(null);
        carregarLista();
      } else {
        setErroModal(resultado.message ?? "Não foi possível reprovar o colaborador.");
        setConfirmandoReprovar(false);
      }
    } finally {
      setProcessando(false);
    }
  }

  function handleValorItemLote(item: ItemAumentoSalarial, texto: string) {
    setValoresPorItem((atual) => ({
      ...atual,
      [item.id]: {
        valor: texto,
        percentual: texto
          ? ((Number(texto) / item.salarioAtual) * 100).toFixed(2)
          : (atual[item.id]?.percentual ?? ""),
        editado: true,
      },
    }));
  }

  function handlePercentualItemLote(item: ItemAumentoSalarial, texto: string) {
    const percentual = Number(texto);

    setValoresPorItem((atual) => ({
      ...atual,
      [item.id]: {
        valor:
          texto && Number.isFinite(percentual)
            ? ((item.salarioAtual * percentual) / 100).toFixed(2)
            : (atual[item.id]?.valor ?? ""),
        percentual: texto,
        editado: true,
      },
    }));
  }

  function itemLoteValido(itemId: string): boolean {
    const valores = valoresPorItem[itemId];
    if (!valores) return true;
    return Number(valores.valor) > 0 && Number(valores.percentual) > 0;
  }

  function montarAjusteItemLote(itemId: string): AjusteValoresDecisao | null {
    const valores = valoresPorItem[itemId];
    if (!valores?.editado || !itemLoteValido(itemId)) return null;
    return {
      valorReajuste: Number(valores.valor),
      percentualReajuste: Number(valores.percentual),
    };
  }

  /* Decisão individual DENTRO do modal da solicitação: recarrega o lote e a fila. */
  async function aprovarItemDoLote(item: ItemAumentoSalarial) {
    setItemProcessando(item.id);
    setErroLote(null);

    try {
      const resultado = await aprovarItemAprovacao(item.id, null, montarAjusteItemLote(item.id));

      if (resultado.ok && numeroAberto) {
        await carregarLote(numeroAberto);
        carregarLista();
      } else if (!resultado.ok) {
        setErroLote(resultado.message ?? "Não foi possível aprovar o colaborador.");
      }
    } finally {
      setItemProcessando(null);
    }
  }

  async function confirmarReprovarItemDoLote() {
    if (!itemReprovando) return;

    if (!comentarioItemLote.trim()) {
      setErroComentarioItemLote(true);
      return;
    }

    setItemProcessando(itemReprovando.id);

    try {
      const resultado = await reprovarItemAprovacao(
        itemReprovando.id,
        comentarioItemLote.trim(),
        montarAjusteItemLote(itemReprovando.id)
      );

      if (resultado.ok && numeroAberto) {
        setItemReprovando(null);
        setComentarioItemLote("");
        await carregarLote(numeroAberto);
        carregarLista();
      } else if (!resultado.ok) {
        setErroLote(resultado.message ?? "Não foi possível reprovar o colaborador.");
        setItemReprovando(null);
      }
    } finally {
      setItemProcessando(null);
    }
  }

  async function handleConfirmarLote() {
    if (!acaoLote) return;

    if (acaoLote === "reprovar" && !comentarioLote.trim()) {
      setErroComentarioLote(true);
      return;
    }

    setProcessandoLote(true);
    setAvisoLote(null);

    try {
      const resultado = await decidirItensEmLote(
        selecionados,
        acaoLote,
        comentarioLote.trim() || null
      );

      if (resultado.ok) {
        setAvisoLote(resultado.message ?? null);
        setAcaoLote(null);
        setComentarioLote("");
        carregarLista();
      } else {
        setErroLista(resultado.message ?? "Não foi possível concluir a decisão em lote.");
        setAcaoLote(null);
      }
    } finally {
      setProcessandoLote(false);
    }
  }

  const naoEhAprovador = !carregando && tiposAtendidos.length === 0;
  const pendente = detalhe?.status === "pendente";
  const novoSalarioPrevisto =
    detalhe && valorNumerico > 0 ? detalhe.salarioAtual + valorNumerico : (detalhe?.novoSalario ?? 0);

  return (
    <PageContainer>
      <PageHeader
        title="Painel de Aprovações"
        description="Solicitações de reajuste enviadas à direção — cada colaborador é decidido separadamente."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Painel de Aprovações", current: true, icon: <ClipboardCheck size={14} /> },
        ]}
      />

      <Card>
        <Stack gap={16}>
          {/*
            * Uma aba por tipo de aprovação que a pessoa atende. Cada tipo é um
            * módulo com colunas próprias, então a fila é sempre de um tipo --
            * assim um módulo novo entra ao lado sem mexer nos existentes.
            * Aparece mesmo com um tipo só: deixa visível que a fila é sempre
            * de um módulo, e o lugar onde os próximos vão entrar.
            */}
          <AbasTipoAprovacao
            tipos={tiposAtendidos}
            ativo={tipo}
            contagem={pendentesPorTipo}
            onSelecionar={(valor) => {
              setTipo(valor);
              setSelecionados([]);
            }}
          />

          <SegmentedTabs
            itens={[
              { valor: "colaborador", label: "Por colaborador", icon: <User size={15} /> },
              { valor: "solicitacao", label: "Por solicitação", icon: <Layers size={15} /> },
            ]}
            ativo={modo}
            onSelecionar={(valor) => {
              setModo(valor as ModoPainel);
              setSelecionados([]);
            }}
          />

          <FormGrid columns={3}>
            <Field label="Situação">
              <Dropdown
                value={status}
                options={OPCOES_STATUS}
                onValueChange={(valor) => setStatus(valor as FiltroStatus)}
              />
            </Field>

            <Field label="Departamento">
              <Dropdown
                value={departamento}
                options={[
                  { value: TODOS, label: "Todos os departamentos" },
                  ...departamentos.map((nome) => ({ value: nome, label: nome })),
                ]}
                onValueChange={setDepartamento}
              />
            </Field>

            <Field label="Setor">
              <Dropdown
                value={setor}
                options={[
                  { value: TODOS, label: "Todos os setores" },
                  ...setores.map((nome) => ({ value: nome, label: nome })),
                ]}
                onValueChange={setSetor}
              />
            </Field>

            <Field label="Colaborador ou solicitante">
              <Input
                value={buscaDigitada}
                placeholder="Buscar por nome..."
                onChange={(event) => setBuscaDigitada(event.target.value)}
              />
            </Field>

            {!agrupado && (
              <Field label="Ordenar por">
                <Dropdown
                  value={ordem}
                  options={OPCOES_ORDEM}
                  onValueChange={(valor) => setOrdem(valor as OrdemPainel)}
                />
              </Field>
            )}
          </FormGrid>

          {erroLista && <Alert variant="danger">{erroLista}</Alert>}
          {avisoLote && <Alert variant="success">{avisoLote}</Alert>}

          {!agrupado && selecionados.length > 0 && (
            <Stack direction="row" gap={12} align="center" justify="between" wrap>
              <strong>{selecionados.length} colaborador(es) selecionado(s)</strong>

              <Stack direction="row" gap={8} wrap>
                <Button variant="secondary" onClick={() => setSelecionados([])}>
                  Limpar seleção
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setComentarioLote("");
                    setErroComentarioLote(false);
                    setAcaoLote("reprovar");
                  }}
                >
                  <XCircle size={16} />
                  Reprovar selecionados
                </Button>
                <Button
                  onClick={() => {
                    setComentarioLote("");
                    setErroComentarioLote(false);
                    setAcaoLote("aprovar");
                  }}
                >
                  <CheckCircle2 size={16} />
                  Aprovar selecionados
                </Button>
              </Stack>
            </Stack>
          )}

          {carregando ? (
            <Loader label="Carregando solicitações..." />
          ) : naoEhAprovador ? (
            <EmptyState
              icon={<ShieldOff size={28} />}
              title="Você ainda não é aprovador de nenhum tipo de solicitação"
              description="Um administrador precisa cadastrar você em Administração → Diretoria → Aprovadores para que a fila apareça aqui."
            />
          ) : (agrupado ? solicitacoes.length === 0 : itens.length === 0) ? (
            <EmptyState
              icon={<ClipboardCheck size={28} />}
              title={busca ? "Nenhum resultado para essa busca" : "Nenhuma solicitação nesta situação"}
            />
          ) : agrupado ? (
            <Table minWidth={950}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Nº</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Colaboradores</TableHeaderCell>
                  <TableHeaderCell>Solicitante</TableHeaderCell>
                  <TableHeaderCell>Enviada em</TableHeaderCell>
                  <TableHeaderCell align="right">Reajuste</TableHeaderCell>
                  <TableHeaderCell align="center">Situação</TableHeaderCell>
                  <TableHeaderCell align="center">Ações</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {solicitacoesPagina.map((solicitacao) => {
                  return (
                    <TableRow
                      key={solicitacao.numero}
                      style={{ cursor: "pointer" }}
                      onClick={() => abrirSolicitacao(solicitacao.numero)}
                    >
                      <TableCell>#{solicitacao.numero}</TableCell>
                      <TableCell>{rotuloTipoAprovacao(solicitacao.tipo)}</TableCell>
                      <TableCell>
                        {solicitacao.totalItens === 1
                          ? "1 colaborador"
                          : `${solicitacao.totalItens} colaboradores`}
                      </TableCell>
                      <TableCell>{solicitacao.criadoPorNome}</TableCell>
                      <TableCell>{formatarData(solicitacao.criadoEm)}</TableCell>
                      <TableCell align="right">{formatarMoeda(solicitacao.totalReajuste)}</TableCell>
                      <TableCell align="center">
                        <Badge variant={solicitacao.pendentes > 0 ? "warning" : "success"}>
                          {solicitacao.pendentes > 0
                            ? `${solicitacao.pendentes} de ${solicitacao.totalItens} aguardando`
                            : "Tudo decidido"}
                        </Badge>
                      </TableCell>
                      <TableCell align="center">
                        <div onClick={(event) => event.stopPropagation()}>
                          <IconButton
                            icon={<Eye size={15} />}
                            label={`Abrir solicitação #${solicitacao.numero}`}
                            size="small"
                            onClick={() => abrirSolicitacao(solicitacao.numero)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Table minWidth={1550}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell align="center">
                    <Checkbox
                      label=""
                      aria-label="Selecionar todos os pendentes"
                      checked={todosSelecionados}
                      disabled={pendentesVisiveis.length === 0}
                      onChange={alternarTodos}
                    />
                  </TableHeaderCell>
                  <TableHeaderCell>Nº</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Colaborador</TableHeaderCell>
                  <TableHeaderCell>Departamento / Setor</TableHeaderCell>
                  <TableHeaderCell>Admissão</TableHeaderCell>
                  <TableHeaderCell align="right">Salário atual</TableHeaderCell>
                  <TableHeaderCell align="right">Reajuste</TableHeaderCell>
                  <TableHeaderCell align="right">Novo salário</TableHeaderCell>
                  <TableHeaderCell>Solicitante</TableHeaderCell>
                  <TableHeaderCell>Enviada em</TableHeaderCell>
                  <TableHeaderCell align="center">Status</TableHeaderCell>
                  <TableHeaderCell align="center">Ações</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {itensPagina.map((item) => (
                  <TableRow key={item.id} style={{ cursor: "pointer" }} onClick={() => abrirDetalhe(item.id)}>
                    <TableCell align="center">
                      <div onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          label=""
                          aria-label={`Selecionar ${item.funcionarioNome}`}
                          checked={selecionados.includes(item.id)}
                          disabled={item.status !== "pendente"}
                          onChange={() => alternarSelecao(item.id)}
                        />
                      </div>
                    </TableCell>
                    <TableCell>#{item.aprovacaoNumero}</TableCell>
                    <TableCell>{rotuloTipoAprovacao(item.tipo)}</TableCell>
                    <TableCell>{item.funcionarioNome}</TableCell>
                    <TableCell>
                      {item.departamento ?? "-"}
                      {item.setor ? ` / ${item.setor}` : ""}
                    </TableCell>
                    <TableCell>{formatarDataAdmissao(item.dataAdmissao)}</TableCell>
                    <TableCell align="right">{formatarMoeda(item.salarioAtual)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" gap={8} align="center" justify="end" wrap>
                        <span>{formatarReajuste(item.valorReajuste, item.percentualReajuste)}</span>
                        {item.valorReajusteOriginal !== null && (
                          <Badge variant="warning">
                            <PencilLine size={12} />
                            Alterado pela direção
                          </Badge>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{formatarMoeda(item.novoSalario)}</TableCell>
                    <TableCell>{item.criadoPorNome}</TableCell>
                    <TableCell>{formatarData(item.criadoEm)}</TableCell>
                    <TableCell align="center">
                      <Badge variant={statusAprovacaoConfig[item.status].badgeVariant}>
                        {statusAprovacaoConfig[item.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell align="center">
                      <div onClick={(event) => event.stopPropagation()}>
                        <IconButton
                          icon={<Eye size={15} />}
                          label={
                            item.status === "pendente"
                              ? `Analisar ${item.funcionarioNome}`
                              : `Ver ${item.funcionarioNome}`
                          }
                          size="small"
                          onClick={() => abrirDetalhe(item.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!carregando && !naoEhAprovador && totalPaginas > 1 && (
            <Stack direction="row" justify="center">
              <Pagination page={paginaAtual} totalPages={totalPaginas} onPageChange={setPagina} />
            </Stack>
          )}
        </Stack>
      </Card>

      {/* Modal do modo agrupado: a solicitação inteira, com decisão individual por colaborador. */}
      <Modal
        open={numeroAberto !== null}
        size="xlarge"
        title={numeroAberto ? `Solicitação #${numeroAberto}` : ""}
        onClose={() => {
          if (itemProcessando) return;
          setNumeroAberto(null);
          setLoteDetalhe(null);
        }}
        footer={
          <Stack direction="row" justify="end">
            <Button
              variant="secondary"
              disabled={itemProcessando !== null}
              onClick={() => {
                setNumeroAberto(null);
                setLoteDetalhe(null);
              }}
            >
              Fechar
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          {carregandoLote && !loteDetalhe && <Loader label="Carregando solicitação..." />}
          {erroLote && <Alert variant="danger">{erroLote}</Alert>}

          {loteDetalhe && (
            <>
              <FormGrid columns={3}>
                <Field label="Tipo de solicitação">
                  <span>{rotuloTipoAprovacao(loteDetalhe.tipo)}</span>
                </Field>
                <Field label="Solicitante">
                  <span>{loteDetalhe.criadoPorNome}</span>
                </Field>
                <Field label="Enviada em">
                  <span>{formatarData(loteDetalhe.criadoEm)}</span>
                </Field>
              </FormGrid>

              {loteDetalhe.observacao && (
                <Field label="Observação geral da solicitação">
                  <p>{loteDetalhe.observacao}</p>
                </Field>
              )}

              <Table minWidth={1200}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Colaborador</TableHeaderCell>
                    <TableHeaderCell>Depto / Setor</TableHeaderCell>
                    <TableHeaderCell>Admissão</TableHeaderCell>
                    <TableHeaderCell align="right">Salário atual</TableHeaderCell>
                    {/* Uma coluna por campo: o cabeçalho diz o que cada caixa espera. */}
                    <TableHeaderCell align="center">Reajuste (Valor)</TableHeaderCell>
                    <TableHeaderCell align="center">Reajuste (%)</TableHeaderCell>
                    <TableHeaderCell align="right">Novo salário</TableHeaderCell>
                    <TableHeaderCell align="center">Status</TableHeaderCell>
                    <TableHeaderCell align="center">Ações</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loteDetalhe.itens.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Stack gap={4}>
                          <span>{item.funcionarioNome}</span>
                          {item.observacao && (
                            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                              {item.observacao}
                            </span>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {item.departamento ?? "-"}
                        {item.setor ? ` / ${item.setor}` : ""}
                      </TableCell>
                      <TableCell>{formatarDataAdmissao(item.dataAdmissao)}</TableCell>
                      <TableCell align="right">{formatarMoeda(item.salarioAtual)}</TableCell>
                      <TableCell align="center">
                        {item.status === "pendente" ? (
                          <Stack gap={6} align="center">
                            {/* Largura fixa: o campo é width:100% por padrão e esticaria a coluna, jogando a tabela para fora do modal. */}
                            <div style={{ width: 150 }}>
                              <CurrencyInput
                                value={valoresPorItem[item.id]?.valor ?? ""}
                                onValueChange={(valor) => handleValorItemLote(item, valor)}
                                disabled={itemProcessando !== null}
                                hasError={!itemLoteValido(item.id)}
                              />
                            </div>
                            {valoresPorItem[item.id]?.editado && (
                              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                pedido: {formatarMoeda(item.valorReajuste)}
                              </span>
                            )}
                          </Stack>
                        ) : (
                          <Stack direction="row" gap={8} align="center" justify="center" wrap>
                            <span>{formatarMoeda(item.valorReajuste)}</span>
                            {item.valorReajusteOriginal !== null && (
                              <Badge variant="warning">
                                <PencilLine size={12} />
                                Alterado
                              </Badge>
                            )}
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {item.status === "pendente" ? (
                          <Stack gap={6} align="center">
                            <div style={{ width: 118 }}>
                              <NumberInput
                                suffix="%"
                                step="0.01"
                                min={0}
                                value={valoresPorItem[item.id]?.percentual ?? ""}
                                onChange={(evento) => handlePercentualItemLote(item, evento.target.value)}
                                disabled={itemProcessando !== null}
                                hasError={!itemLoteValido(item.id)}
                              />
                            </div>
                            {valoresPorItem[item.id]?.editado && (
                              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                pedido: {Number(item.percentualReajuste).toFixed(2)}%
                              </span>
                            )}
                          </Stack>
                        ) : (
                          <span>{Number(item.percentualReajuste).toFixed(2)}%</span>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {formatarMoeda(
                          item.status === "pendente" && Number(valoresPorItem[item.id]?.valor) > 0
                            ? item.salarioAtual + Number(valoresPorItem[item.id].valor)
                            : item.novoSalario
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Stack gap={4} align="center">
                          <Badge variant={statusAprovacaoConfig[item.status].badgeVariant}>
                            {statusAprovacaoConfig[item.status].label}
                          </Badge>
                          {item.decididoPorNome && (
                            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                              {item.decididoPorNome}
                            </span>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="center">
                        {item.status === "pendente" ? (
                          <Stack direction="row" gap={6} justify="center">
                            <IconButton
                              icon={<XCircle size={15} />}
                              label={`Reprovar ${item.funcionarioNome}`}
                              size="small"
                              variant="danger"
                              disabled={itemProcessando !== null || !itemLoteValido(item.id)}
                              onClick={() => {
                                setComentarioItemLote("");
                                setErroComentarioItemLote(false);
                                setItemReprovando(item);
                              }}
                            />
                            <IconButton
                              icon={<CheckCircle2 size={15} />}
                              label={`Aprovar ${item.funcionarioNome}`}
                              size="small"
                              disabled={itemProcessando !== null || !itemLoteValido(item.id)}
                              onClick={() => setItemAprovando(item)}
                            />
                          </Stack>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Decidido</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </Stack>
      </Modal>

      <Modal
        open={itemIdSelecionado !== null}
        title={detalhe ? `Solicitação #${detalhe.aprovacaoNumero}` : ""}
        onClose={fecharModal}
        footer={
          detalhe &&
          pendente && (
            <Stack direction="row" gap={8} justify="end">
              <Button
                variant="danger"
                onClick={() => setConfirmandoReprovar(true)}
                disabled={processando || (valoresEditados && !valoresValidos)}
              >
                <XCircle size={16} />
                Reprovar
              </Button>
              <Button
                onClick={() => setConfirmandoAprovar(true)}
                loading={processando}
                disabled={valoresEditados && !valoresValidos}
              >
                <CheckCircle2 size={16} />
                Aprovar
              </Button>
            </Stack>
          )
        }
      >
        <Stack gap={16}>
          {carregandoDetalhe && <Loader label="Carregando..." />}
          {erroModal && <Alert variant="danger">{erroModal}</Alert>}

          {detalhe && (
            <>
              {detalhe.valorReajusteOriginal !== null && (
                <Alert variant="warning" title="Valores alterados pela direção">
                  O solicitante pediu{" "}
                  {formatarReajuste(detalhe.valorReajusteOriginal, detalhe.percentualReajusteOriginal ?? 0)}
                  {detalhe.novoSalarioOriginal !== null &&
                    ` (novo salário ${formatarMoeda(detalhe.novoSalarioOriginal)})`}
                  . O que está registrado hoje é{" "}
                  {formatarReajuste(detalhe.valorReajuste, detalhe.percentualReajuste)}.
                </Alert>
              )}

              <FormGrid columns={2}>
                <Field label="Tipo de solicitação">
                  <span>{rotuloTipoAprovacao(detalhe.tipo)}</span>
                </Field>
                <Field label="Colaborador">
                  <span>{detalhe.funcionarioNome}</span>
                </Field>
                <Field label="Solicitante">
                  <span>{detalhe.criadoPorNome}</span>
                </Field>
                <Field label="Departamento">
                  <span>{detalhe.departamento ?? "-"}</span>
                </Field>
                <Field label="Setor">
                  <span>{detalhe.setor ?? "-"}</span>
                </Field>
                <Field label="Admissão">
                  <span>{formatarDataAdmissao(detalhe.dataAdmissao)}</span>
                </Field>
                <Field label="Salário atual">
                  <span>{formatarMoeda(detalhe.salarioAtual)}</span>
                </Field>
                <Field label="Novo salário">
                  <span>{formatarMoeda(pendente ? novoSalarioPrevisto : detalhe.novoSalario)}</span>
                </Field>

                {pendente ? (
                  <>
                    <Field
                      label="Valor do reajuste"
                      htmlFor="valorReajuste"
                      hint="Pode ser ajustado antes de decidir — o percentual acompanha."
                    >
                      <CurrencyInput
                        id="valorReajuste"
                        value={valorEditado}
                        onValueChange={handleValorChange}
                        disabled={processando}
                        hasError={valoresEditados && !valoresValidos}
                      />
                    </Field>
                    <Field label="Percentual" htmlFor="percentualReajuste">
                      <NumberInput
                        id="percentualReajuste"
                        suffix="%"
                        step="0.01"
                        min={0}
                        value={percentualEditado}
                        onChange={(event) => handlePercentualChange(event.target.value)}
                        disabled={processando}
                        hasError={valoresEditados && !valoresValidos}
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="Reajuste">
                    <span>{formatarReajuste(detalhe.valorReajuste, detalhe.percentualReajuste)}</span>
                  </Field>
                )}
              </FormGrid>

              {pendente && valoresEditados && (
                <Alert variant="info">
                  {valoresValidos
                    ? `Você alterou o reajuste pedido (${formatarReajuste(detalhe.valorReajuste, detalhe.percentualReajuste)} → ${formatarReajuste(valorNumerico, percentualNumerico)}). A alteração fica registrada junto da decisão e o solicitante enxerga os dois valores.`
                    : "Informe um valor e um percentual maiores que zero para decidir."}
                </Alert>
              )}

              {detalhe.observacaoGeral && (
                <Field label="Observação geral da solicitação">
                  <p>{detalhe.observacaoGeral}</p>
                </Field>
              )}

              {detalhe.observacao && (
                <Field label="Observação deste colaborador">
                  <p>{detalhe.observacao}</p>
                </Field>
              )}

              {pendente ? (
                <Field label="Comentário (opcional para aprovar)" htmlFor="comentarioAprovar">
                  <Textarea
                    id="comentarioAprovar"
                    rows={3}
                    value={comentarioAprovar}
                    onChange={(event) => setComentarioAprovar(event.target.value)}
                    disabled={processando}
                  />
                </Field>
              ) : (
                <FormGrid columns={2}>
                  <Field label="Decidido por">
                    <span>{detalhe.decididoPorNome ?? "-"}</span>
                  </Field>
                  <Field label="Decidido em">
                    <span>{detalhe.decididoEm ? formatarData(detalhe.decididoEm) : "-"}</span>
                  </Field>
                  {detalhe.comentarioDecisao && (
                    <Field label="Comentário da decisão">
                      <p>{detalhe.comentarioDecisao}</p>
                    </Field>
                  )}
                </FormGrid>
              )}
            </>
          )}
        </Stack>
      </Modal>

      <ConfirmDialog
        open={confirmandoAprovar}
        title="Aprovar este colaborador?"
        variant="warning"
        confirmLabel="Aprovar"
        loading={processando}
        message={
          detalhe
            ? `${detalhe.funcionarioNome} passa de ${formatarMoeda(detalhe.salarioAtual)} para ${formatarMoeda(pendente ? novoSalarioPrevisto : detalhe.novoSalario)}.`
            : ""
        }
        onConfirm={async () => {
          setConfirmandoAprovar(false);
          await handleAprovar();
        }}
        onClose={() => {
          if (processando) return;
          setConfirmandoAprovar(false);
        }}
      />

      <ConfirmDialog
        open={itemAprovando !== null}
        title="Aprovar este colaborador?"
        variant="warning"
        confirmLabel="Aprovar"
        loading={itemProcessando !== null}
        message={
          itemAprovando
            ? `${itemAprovando.funcionarioNome} passa de ${formatarMoeda(itemAprovando.salarioAtual)} para ${formatarMoeda(
                Number(valoresPorItem[itemAprovando.id]?.valor) > 0
                  ? itemAprovando.salarioAtual + Number(valoresPorItem[itemAprovando.id].valor)
                  : itemAprovando.novoSalario
              )}.`
            : ""
        }
        onConfirm={async () => {
          if (!itemAprovando) return;
          const alvo = itemAprovando;
          setItemAprovando(null);
          await aprovarItemDoLote(alvo);
        }}
        onClose={() => {
          if (itemProcessando) return;
          setItemAprovando(null);
        }}
      />

      <ConfirmDialog
        open={confirmandoReprovar}
        title="Reprovar este colaborador?"
        variant="danger"
        confirmLabel="Reprovar"
        loading={processando}
        message={
          <Stack gap={12}>
            <span>Explique o motivo da reprovação — o solicitante verá esse comentário no portal.</span>
            <Textarea
              rows={3}
              value={comentarioReprovar}
              onChange={(event) => {
                setComentarioReprovar(event.target.value);
                if (erroComentarioReprovar) setErroComentarioReprovar(false);
              }}
              placeholder="Motivo da reprovação (obrigatório)"
              disabled={processando}
              hasError={erroComentarioReprovar}
            />
            {erroComentarioReprovar && <span style={{ color: "var(--danger-text)" }}>Informe o motivo da reprovação.</span>}
          </Stack>
        }
        onConfirm={handleConfirmarReprovar}
        onClose={() => {
          if (processando) return;
          setConfirmandoReprovar(false);
          setErroComentarioReprovar(false);
        }}
      />

      <ConfirmDialog
        open={itemReprovando !== null}
        title={itemReprovando ? `Reprovar ${itemReprovando.funcionarioNome}?` : ""}
        variant="danger"
        confirmLabel="Reprovar"
        loading={itemProcessando !== null}
        message={
          <Stack gap={12}>
            <span>Explique o motivo da reprovação — o solicitante verá esse comentário no portal.</span>
            <Textarea
              rows={3}
              value={comentarioItemLote}
              onChange={(event) => {
                setComentarioItemLote(event.target.value);
                if (erroComentarioItemLote) setErroComentarioItemLote(false);
              }}
              placeholder="Motivo da reprovação (obrigatório)"
              disabled={itemProcessando !== null}
              hasError={erroComentarioItemLote}
            />
            {erroComentarioItemLote && (
              <span style={{ color: "var(--danger-text)" }}>Informe o motivo da reprovação.</span>
            )}
          </Stack>
        }
        onConfirm={confirmarReprovarItemDoLote}
        onClose={() => {
          if (itemProcessando) return;
          setItemReprovando(null);
          setErroComentarioItemLote(false);
        }}
      />

      <ConfirmDialog
        open={acaoLote !== null}
        title={
          acaoLote === "reprovar"
            ? `Reprovar ${selecionados.length} colaborador(es)?`
            : `Aprovar ${selecionados.length} colaborador(es)?`
        }
        variant={acaoLote === "reprovar" ? "danger" : "warning"}
        confirmLabel={acaoLote === "reprovar" ? "Reprovar todos" : "Aprovar todos"}
        loading={processandoLote}
        message={
          <Stack gap={12}>
            <span>
              {acaoLote === "reprovar"
                ? "O motivo abaixo será registrado em todos os colaboradores selecionados."
                : "A decisão vale para todos os selecionados, com os valores como estão hoje — para ajustar valor ou percentual, decida o colaborador individualmente."}
            </span>
            <Textarea
              rows={3}
              value={comentarioLote}
              onChange={(event) => {
                setComentarioLote(event.target.value);
                if (erroComentarioLote) setErroComentarioLote(false);
              }}
              placeholder={
                acaoLote === "reprovar" ? "Motivo da reprovação (obrigatório)" : "Comentário (opcional)"
              }
              disabled={processandoLote}
              hasError={erroComentarioLote}
            />
            {erroComentarioLote && (
              <span style={{ color: "var(--danger-text)" }}>Informe o motivo da reprovação.</span>
            )}
          </Stack>
        }
        onConfirm={handleConfirmarLote}
        onClose={() => {
          if (processandoLote) return;
          setAcaoLote(null);
          setErroComentarioLote(false);
        }}
      />
    </PageContainer>
  );
}
