"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, ShoppingCart, Undo2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { EMPRESAS_PEDIDO_COMPRA, nomeEmpresaPedidoCompra } from "@/lib/aprovacoes/empresas-pedido-compra";

import { statusAprovacaoConfig } from "../constants/approval-status";
import {
  buscarDirecionamentoPedidosCompra,
  decidirPedidosCompra,
  listarPedidosCompraPainel,
} from "../services/aprovacoes.service";
import type { DirecionamentoDaVez, PedidoCompraPainel, StatusAprovacao } from "../types/aprovacoes.types";
import {
  agruparPorDestino,
  formatarCentroCusto,
  formatarDataCurta,
  formatarValor,
  motivosAtencao,
  ordenarPedidos,
  resumirCentrosCusto,
  resumirTotais,
  somarPedidos,
  type GrupoDestino,
  type OrdemPedidos,
} from "../utils/pedidos-compra-formato";
import { PedidoCompraDetalheModal } from "./PedidoCompraDetalheModal";
import styles from "./PainelPedidosCompra.module.css";

type FiltroStatus = StatusAprovacao | "todos";

const OPCOES_STATUS: { value: FiltroStatus; label: string }[] = [
  { value: "pendente", label: "Na minha vez" },
  { value: "aprovado", label: "Aprovados" },
  { value: "devolvido", label: "Devolvidos" },
  { value: "todos", label: "Todos" },
];

type AcaoDecisao = "aprovar" | "devolver";

/* Linha compacta: cabe bem mais por página sem rolar demais. */
const POR_PAGINA = 50;

const OPCOES_ORDEM: { value: OrdemPedidos; label: string }[] = [
  { value: "fila", label: "Ordem da fila" },
  { value: "valor", label: "Maior valor primeiro" },
  { value: "emissao", label: "Emissão mais antiga primeiro" },
  { value: "empresa", label: "Empresa e número" },
];

/* Só para o histórico: a fila "Na minha vez" nunca é cortada por data. */
const OPCOES_PERIODO = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Último ano" },
  { value: "", label: "Tudo" },
];

/*
 * Os filtros de cada pessoa ficam no navegador dela: abrindo o painel de
 * novo, volta como deixou. A busca por texto não fica (é pontual).
 */
const CHAVE_FILTROS = "painel-pedidos-compra-filtros";

interface FiltrosSalvos {
  status: FiltroStatus;
  empresa: string;
  centroCusto: string;
  dias: string;
  ordem: OrdemPedidos;
}

const FILTROS_PADRAO: FiltrosSalvos = { status: "pendente", empresa: "", centroCusto: "", dias: "30", ordem: "fila" };

/* A aba só monta no navegador (depois de carregar os tipos), então dá para ler o localStorage na criação do estado. */
function lerFiltrosSalvos(): FiltrosSalvos {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_FILTROS) ?? "null") as Partial<FiltrosSalvos> | null;
    if (!salvo || typeof salvo !== "object") return FILTROS_PADRAO;
    return {
      status: OPCOES_STATUS.some((o) => o.value === salvo.status) ? salvo.status! : FILTROS_PADRAO.status,
      empresa: typeof salvo.empresa === "string" ? salvo.empresa : "",
      centroCusto: typeof salvo.centroCusto === "string" ? salvo.centroCusto : "",
      dias: OPCOES_PERIODO.some((o) => o.value === salvo.dias) ? salvo.dias! : FILTROS_PADRAO.dias,
      ordem: OPCOES_ORDEM.some((o) => o.value === salvo.ordem) ? salvo.ordem! : "fila",
    };
  } catch {
    /* localStorage indisponível ou valor estragado: começa do padrão. */
    return FILTROS_PADRAO;
  }
}

/* Valores do campo "Direcionar para" além do id de uma pessoa. */
const TODOS_DO_NIVEL = "todos";
const SUGESTAO_DE_CADA = "sugestao";

/*
 * Opções de direcionamento para os pedidos marcados: um pedido só, as
 * pessoas do próximo nível dele; vários, "a sugestão de cada um" e as
 * pessoas que estão no próximo nível de TODOS (escolher alguém de fora
 * faria parte deles falhar).
 */
function opcoesDirecionamento(direcionamentos: DirecionamentoDaVez[]): { value: string; label: string }[] {
  if (direcionamentos.length === 1) {
    const [unico] = direcionamentos;
    return [
      { value: TODOS_DO_NIVEL, label: `Todos do nível ${unico.proximoNivel}` },
      ...unico.opcoes.map((pessoa) => ({
        value: pessoa.id,
        label: pessoa.id === unico.sugestao?.id ? `${pessoa.nome} (sugestão)` : pessoa.nome,
      })),
    ];
  }

  const [primeiro, ...demais] = direcionamentos;
  const comuns = primeiro.opcoes.filter((pessoa) => demais.every((d) => d.opcoes.some((o) => o.id === pessoa.id)));

  return [
    { value: SUGESTAO_DE_CADA, label: "A sugestão de cada pedido" },
    { value: TODOS_DO_NIVEL, label: "Todos do próximo nível" },
    ...comuns.map((pessoa) => ({ value: pessoa.id, label: pessoa.nome })),
  ];
}

/* "Darlan: 3 · todos do nível: 1" -- o que a sugestão de cada pedido vai fazer. */
function resumirSugestoes(direcionamentos: DirecionamentoDaVez[]): string {
  const contagem = new Map<string, number>();
  for (const d of direcionamentos) {
    const nome = d.sugestao?.nome ?? "todos do nível";
    contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
  }
  return [...contagem.entries()].map(([nome, total]) => `${nome}: ${total}`).join(" · ");
}

interface PainelPedidosCompraProps {
  /* Depois de decidir: o painel recarrega o contador da aba. */
  onDecidido: () => void;
}

/*
 * Aba "Pedidos de Compra" do Painel de Aprovações. Os pedidos chegam do
 * SupriConnect só com a chave (empresa + número); fornecedor, itens e
 * valores entram aqui quando a consulta ao ERP for ligada
 * (Administração → Diretoria → Configurações → Pedidos de Compra).
 *
 * Quem decide é a alçada da empresa (Diretoria → Alçadas): "Na minha
 * vez" traz só o que está no nível do usuário agora; os demais filtros,
 * o que já passou por ele. Ninguém vê o pedido antes do nível chegar.
 */
export function PainelPedidosCompra({ onDecidido }: PainelPedidosCompraProps) {
  const [pedidos, setPedidos] = useState<PedidoCompraPainel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [salvos] = useState(lerFiltrosSalvos);
  const [status, setStatus] = useState<FiltroStatus>(salvos.status);
  const [empresa, setEmpresa] = useState(salvos.empresa);
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  /* "90.02, 90.90": o pedido entra se tiver algum item num desses centros de custo. */
  const [centroCustoDigitado, setCentroCustoDigitado] = useState(salvos.centroCusto);
  const [centroCusto, setCentroCusto] = useState(salvos.centroCusto);
  const [dias, setDias] = useState(salvos.dias);
  const [ordem, setOrdem] = useState<OrdemPedidos>(salvos.ordem);
  /* Mostrar só os pedidos que fogem do normal (cancelado/atendido no Focco, sem dados do ERP). */
  const [soAtencao, setSoAtencao] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [recarga, setRecarga] = useState(0);

  const [selecionados, setSelecionados] = useState<string[]>([]);
  /* Decisão em andamento: os ids e a ação (um pedido só, pelo botão da linha, ou a seleção). */
  const [decisao, setDecisao] = useState<{ ids: string[]; acao: AcaoDecisao } | null>(null);
  const [comentario, setComentario] = useState("");
  const [erroComentario, setErroComentario] = useState(false);
  const [processando, setProcessando] = useState(false);
  /* Aprovando: o próximo nível de cada pedido marcado (null = carregando; vazio = nenhum tem próximo nível). */
  const [direcionamentos, setDirecionamentos] = useState<DirecionamentoDaVez[] | null>([]);
  const [direcionar, setDirecionar] = useState(TODOS_DO_NIVEL);
  const [erroDirecionamento, setErroDirecionamento] = useState<string | null>(null);
  /* Só a resposta da última abertura do diálogo vale (fechar e reabrir rápido não mistura). */
  const consultaDirecionamento = useRef(0);
  const [abrindoPdf, setAbrindoPdf] = useState<string | null>(null);
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setBusca(buscaDigitada.trim()), 400);
    return () => clearTimeout(timer);
  }, [buscaDigitada]);

  useEffect(() => {
    const timer = setTimeout(() => setCentroCusto(centroCustoDigitado.trim()), 400);
    return () => clearTimeout(timer);
  }, [centroCustoDigitado]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_FILTROS, JSON.stringify({ status, empresa, centroCusto, dias, ordem } satisfies FiltrosSalvos));
    } catch {
      /* Sem localStorage: só não lembra os filtros na próxima vez. */
    }
  }, [status, empresa, centroCusto, dias, ordem]);

  useEffect(() => {
    let ativo = true;

    listarPedidosCompraPainel({ status, empresa, busca, centroCusto, dias }).then((resultado) => {
      if (!ativo) return;

      if (resultado.ok && resultado.data) {
        setPedidos(resultado.data.pedidos);
        setErro(null);
      } else {
        setErro(resultado.message ?? "Não foi possível carregar os pedidos de compra.");
      }

      /* A seleção não sobrevive a uma troca de filtro: o que estava marcado pode nem estar mais na tela. */
      setSelecionados([]);
      setPagina(1);
      setCarregando(false);
    });

    return () => {
      ativo = false;
    };
  }, [status, empresa, busca, centroCusto, dias, recarga]);

  function recarregar() {
    setCarregando(true);
    setRecarga((atual) => atual + 1);
  }

  /* Quantos pedem atenção na lista que veio do servidor (antes do filtro "só com atenção"). */
  const comAtencao = useMemo(() => pedidos.filter((pedido) => motivosAtencao(pedido).length > 0).length, [pedidos]);

  /* O que a tabela mostra: a lista do servidor, talvez só os com atenção, na ordem escolhida. */
  const visiveis = useMemo(
    () => ordenarPedidos(soAtencao ? pedidos.filter((pedido) => motivosAtencao(pedido).length > 0) : pedidos, ordem),
    [pedidos, soAtencao, ordem]
  );

  /* Só dá para selecionar o que está na vez do usuário. */
  const pendentesVisiveis = useMemo(() => visiveis.filter((pedido) => pedido.naMinhaVez), [visiveis]);
  const todosSelecionados = pendentesVisiveis.length > 0 && selecionados.length === pendentesVisiveis.length;

  /* Na fila da vez: para onde os pedidos vão ao aprovar, agrupados -- um clique decide o grupo inteiro. */
  const grupos = useMemo(() => (status === "pendente" ? agruparPorDestino(visiveis) : []), [status, visiveis]);

  /* Totais de TODA a lista filtrada (não só da página), e da seleção. */
  const totais = useMemo(() => somarPedidos(visiveis), [visiveis]);
  const totaisSelecionados = useMemo(
    () => somarPedidos(visiveis.filter((pedido) => selecionados.includes(pedido.id))),
    [visiveis, selecionados]
  );

  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pedidosPagina = visiveis.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const grupoSelecionado = (grupo: GrupoDestino) =>
    selecionados.length === grupo.ids.length && grupo.ids.every((id) => selecionados.includes(id));

  function alternarSelecao(id: string) {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
  }

  function abrirDecisao(ids: string[], acao: AcaoDecisao) {
    setComentario("");
    setErroComentario(false);
    setDecisao({ ids, acao });
    setDirecionar(TODOS_DO_NIVEL);
    setErroDirecionamento(null);

    const consulta = ++consultaDirecionamento.current;

    if (acao !== "aprovar") {
      setDirecionamentos([]);
      return;
    }

    setDirecionamentos(null);
    void buscarDirecionamentoPedidosCompra(ids).then((resultado) => {
      if (consulta !== consultaDirecionamento.current) return;

      const lista = resultado.ok && resultado.data ? resultado.data : [];
      setDirecionamentos(lista);
      if (!resultado.ok) {
        setErroDirecionamento(resultado.message ?? "Não foi possível buscar a sugestão; o pedido vai para todos do próximo nível.");
      }

      /* Já vem escolhida a sugestão da regra; quem aprova pode trocar. */
      if (lista.length === 1) setDirecionar(lista[0].sugestao?.id ?? TODOS_DO_NIVEL);
      else if (lista.length > 1) setDirecionar(SUGESTAO_DE_CADA);
    });
  }

  async function confirmarDecisao() {
    if (!decisao) return;

    if (decisao.acao === "devolver" && !comentario.trim()) {
      setErroComentario(true);
      return;
    }

    setProcessando(true);

    try {
      const resultado = await decidirPedidosCompra({
        ids: decisao.ids,
        acao: decisao.acao,
        comentario: comentario.trim() || undefined,
        direcionarPara: decisao.acao === "aprovar" && direcionamentos?.length ? direcionar : undefined,
      });

      if (resultado.ok && resultado.data) {
        const { decididos, falhas } = resultado.data;
        const subiram = decididos.filter((d) => d.resultado === "avancou");
        const aprovados = decididos.filter((d) => d.resultado === "aprovado").length;
        const devolvidos = decididos.filter((d) => d.resultado === "devolvido").length;

        /* Diz o que aconteceu de verdade: aprovar no seu nível nem sempre aprova o pedido. */
        const destinos = subiram.map((d) => (d.direcionadoPara ? `${d.proximoNivel} → ${d.direcionadoPara}` : d.proximoNivel));
        const partes = [
          subiram.length > 0 ? `${subiram.length} subiu(ram) para o próximo nível (${[...new Set(destinos)].join(", ")})` : null,
          aprovados > 0 ? `${aprovados} aprovado(s) em definitivo` : null,
          devolvidos > 0 ? `${devolvidos} devolvido(s) ao comprador` : null,
          falhas.length > 0 ? `${falhas.length} não decidido(s): ${falhas[0].motivo}` : null,
        ].filter(Boolean);

        setAviso(partes.join(" · ") || "Nada foi decidido.");
        setDecisao(null);
        recarregar();
        onDecidido();
      } else {
        setErro(resultado.message ?? "Não foi possível registrar a decisão.");
        setDecisao(null);
      }
    } finally {
      setProcessando(false);
    }
  }

  /*
   * A aba abre já no clique (senão o navegador trata como pop-up, por
   * vir depois de um await) e recebe o PDF quando ele chega. Sem PDF na
   * pasta, fecha a aba e explica aqui.
   */
  async function abrirPdf(pedido: PedidoCompraPainel) {
    const janela = window.open("", "_blank");
    setAbrindoPdf(pedido.id);
    setErro(null);

    try {
      const resposta = await fetch(`/api/aprovacoes/pedidos-compra/${pedido.id}/pdf`, { cache: "no-store" });

      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => null)) as { message?: string } | null;
        janela?.close();
        setErro(corpo?.message ?? `Não foi possível abrir o PDF do pedido ${pedido.numero}.`);
        return;
      }

      const url = URL.createObjectURL(await resposta.blob());

      if (janela) {
        janela.location.href = url;
        /*
         * A aba já carregou o PDF: libera o arquivo da memória deste
         * navegador. Antes, cada clique deixava o PDF preso até fechar o
         * portal.
         */
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        window.location.href = url;
      }
    } catch {
      janela?.close();
      setErro(`Não foi possível abrir o PDF do pedido ${pedido.numero}.`);
    } finally {
      setAbrindoPdf(null);
    }
  }

  const quantidade = decisao?.ids.length ?? 0;
  const carregandoDirecionamento = decisao?.acao === "aprovar" && direcionamentos === null;
  const pedidoUnico = decisao && quantidade === 1 ? pedidos.find((pedido) => pedido.id === decisao.ids[0]) : null;

  return (
    <Stack gap={16}>
      <FormGrid columns={3}>
        <Field label="Situação">
          <Dropdown value={status} options={OPCOES_STATUS} onValueChange={(valor) => setStatus(valor as FiltroStatus)} />
        </Field>

        <Field label="Empresa">
          <Dropdown
            value={empresa}
            options={[
              { value: "", label: "Todas as empresas" },
              ...EMPRESAS_PEDIDO_COMPRA.map((item) => ({ value: String(item.codigo), label: item.nome })),
            ]}
            onValueChange={setEmpresa}
          />
        </Field>

        <Field label="Centro de custo (algum item)">
          <Input
            value={centroCustoDigitado}
            placeholder="Ex.: 90.02, 90.90"
            onChange={(evento) => setCentroCustoDigitado(evento.target.value)}
          />
        </Field>
      </FormGrid>

      <FormGrid columns={3}>
        <Field label="Pedido, fornecedor ou comprador">
          <Input
            value={buscaDigitada}
            placeholder="Número do pedido ou nome..."
            onChange={(evento) => setBuscaDigitada(evento.target.value)}
          />
        </Field>

        <Field label="Ordenar por">
          <Dropdown value={ordem} options={OPCOES_ORDEM} onValueChange={(valor) => setOrdem(valor as OrdemPedidos)} />
        </Field>

        {status === "pendente" ? (
          <Field label="Pedem atenção">
            <Checkbox
              label={`Só os que pedem atenção (${comAtencao})`}
              checked={soAtencao}
              disabled={comAtencao === 0 && !soAtencao}
              onChange={() => setSoAtencao((atual) => !atual)}
            />
          </Field>
        ) : (
          <Field label="Período">
            <Dropdown value={dias} options={OPCOES_PERIODO} onValueChange={setDias} />
          </Field>
        )}
      </FormGrid>

      {erro && <Alert variant="danger">{erro}</Alert>}
      {aviso && <Alert variant="success">{aviso}</Alert>}

      {!carregando && grupos.length > 0 && (
        <Stack gap={8}>
          <span className={styles.resumoTitulo}>Para onde vão ao aprovar (sugestão da regra)</span>
          <div className={styles.resumo}>
            {grupos.map((grupo) => (
              <div
                key={grupo.chave}
                className={`${styles.destino} ${grupoSelecionado(grupo) ? styles.destinoAtivo : ""}`}
              >
                <button
                  type="button"
                  className={styles.destinoCorpo}
                  aria-pressed={grupoSelecionado(grupo)}
                  title="Marcar os pedidos deste grupo"
                  onClick={() => setSelecionados(grupoSelecionado(grupo) ? [] : grupo.ids)}
                >
                  <span className={styles.destinoRotulo}>{grupo.rotulo}</span>
                  <span className={styles.destinoDetalhe}>{grupo.detalhe}</span>
                  <span className={styles.destinoNumeros}>
                    {grupo.ids.length} pedido(s) · {resumirTotais(grupo.totais.porMoeda)}
                  </span>
                </button>
                <Button onClick={() => abrirDecisao(grupo.ids, "aprovar")}>
                  <CheckCircle2 size={15} />
                  Aprovar {grupo.ids.length}
                </Button>
              </div>
            ))}
          </div>
        </Stack>
      )}

      {selecionados.length > 0 && (
        <Stack direction="row" gap={12} align="center" justify="between" wrap>
          <strong>{selecionados.length} pedido(s) selecionado(s)</strong>

          <Stack direction="row" gap={8} wrap>
            <Button variant="secondary" onClick={() => setSelecionados([])}>
              Limpar seleção
            </Button>
            <Button variant="danger" onClick={() => abrirDecisao(selecionados, "devolver")}>
              <Undo2 size={16} />
              Devolver selecionados
            </Button>
            <Button onClick={() => abrirDecisao(selecionados, "aprovar")}>
              <CheckCircle2 size={16} />
              Aprovar selecionados
            </Button>
          </Stack>
        </Stack>
      )}

      {carregando ? (
        <Loader label="Carregando pedidos de compra..." />
      ) : visiveis.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart size={28} />}
          title={
            busca || centroCusto || soAtencao ? "Nenhum resultado para esse filtro" : "Nenhum pedido de compra nesta situação"
          }
        />
      ) : (
        <Table minWidth={980}>
          <TableHead>
            <TableRow>
              <TableHeaderCell align="center">
                <Checkbox
                  label=""
                  aria-label="Selecionar todos os da minha vez"
                  checked={todosSelecionados}
                  disabled={pendentesVisiveis.length === 0}
                  onChange={() =>
                    setSelecionados(todosSelecionados ? [] : pendentesVisiveis.map((pedido) => pedido.id))
                  }
                />
              </TableHeaderCell>
              <TableHeaderCell>Pedido</TableHeaderCell>
              <TableHeaderCell>Fornecedor</TableHeaderCell>
              <TableHeaderCell>Centro de custo</TableHeaderCell>
              <TableHeaderCell>Emissão</TableHeaderCell>
              <TableHeaderCell align="right">Valor</TableHeaderCell>
              <TableHeaderCell>{status === "pendente" ? "Vai para" : "Situação"}</TableHeaderCell>
              <TableHeaderCell align="center">Ações</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pedidosPagina.map((pedido) => {
              const pendente = pedido.status === "pendente";
              const atencao = motivosAtencao(pedido);

              return (
                <TableRow
                  key={pedido.id}
                  className={styles.linha}
                  style={{ cursor: "pointer" }}
                  onClick={() => setPedidoAbertoId(pedido.id)}
                >
                  <TableCell align="center">
                    <div onClick={(evento) => evento.stopPropagation()}>
                      <Checkbox
                        label=""
                        aria-label={`Selecionar pedido ${pedido.numero}`}
                        checked={selecionados.includes(pedido.id)}
                        disabled={!pedido.naMinhaVez}
                        onChange={() => alternarSelecao(pedido.id)}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={styles.pedido} title={`Aprovação #${pedido.numeroAprovacao} · enviado por ${pedido.enviadoPor}`}>
                      <strong>{pedido.numero}</strong>
                      <span className={styles.secundario}>{pedido.empresaNome}</span>
                      {atencao.length > 0 && (
                        <span className={styles.atencao} title={atencao.join(" · ")} aria-label={atencao.join(" · ")}>
                          <AlertTriangle size={14} aria-hidden="true" />
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={styles.fornecedor}
                      title={pedido.compradorNome ? `Comprador: ${pedido.compradorNome}` : undefined}
                    >
                      {pedido.fornecedorNome ?? "Sem dados do ERP"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {pedido.centrosCusto && pedido.centrosCusto.length > 0 ? (
                      <span className={styles.secundario} title={pedido.centrosCusto.map(formatarCentroCusto).join(", ")}>
                        {resumirCentrosCusto(pedido.centrosCusto)}
                      </span>
                    ) : (
                      <span className={styles.secundario}>-</span>
                    )}
                  </TableCell>
                  <TableCell>{formatarDataCurta(pedido.dataEmissao)}</TableCell>
                  <TableCell align="right">
                    <strong className={styles.valor}>{formatarValor(pedido.valorTotal, pedido.moeda)}</strong>
                  </TableCell>
                  <TableCell>
                    {status === "pendente" ? (
                      <span className={styles.vaiPara}>
                        {pedido.vaiPara === null
                          ? "Aprovação final"
                          : pedido.vaiPara?.pessoa
                            ? pedido.vaiPara.pessoa.nome
                            : pedido.vaiPara
                              ? `Todos da ${pedido.vaiPara.proximoNivel}`
                              : "-"}
                      </span>
                    ) : pendente && pedido.naMinhaVez ? (
                      <Badge variant="warning">Sua vez</Badge>
                    ) : (
                      <span
                        className={styles.situacao}
                        title={pedido.comentario ? `"${pedido.comentario}"` : undefined}
                      >
                        <Badge variant={statusAprovacaoConfig[pedido.status].badgeVariant}>
                          {pendente ? "Em outro nível" : statusAprovacaoConfig[pedido.status].label}
                        </Badge>
                        <span className={styles.secundario}>
                          {pendente && pedido.nivelAtual
                            ? `Nível ${pedido.nivelAtual.ordem} de ${pedido.nivelAtual.total}${
                                pedido.nivelAtual.direcionadoPara ? ` · ${pedido.nivelAtual.direcionadoPara}` : ""
                              }`
                            : (pedido.decididoPor ?? "")}
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" gap={4} justify="center" onClick={(evento) => evento.stopPropagation()}>
                      <IconButton
                        icon={<FileText size={15} />}
                        label={`Ver PDF do pedido ${pedido.numero}`}
                        size="small"
                        disabled={abrindoPdf === pedido.id}
                        onClick={() => void abrirPdf(pedido)}
                      />
                      {pedido.naMinhaVez && (
                        <>
                          <IconButton
                            icon={<CheckCircle2 size={15} />}
                            label={`Aprovar pedido ${pedido.numero}`}
                            size="small"
                            onClick={() => abrirDecisao([pedido.id], "aprovar")}
                          />
                          <IconButton
                            icon={<Undo2 size={15} />}
                            label={`Devolver pedido ${pedido.numero}`}
                            size="small"
                            onClick={() => abrirDecisao([pedido.id], "devolver")}
                          />
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {!carregando && visiveis.length > 0 && (
        <div className={styles.totalizador}>
          <div className={styles.totalizadorBloco}>
            <span className={styles.totalizadorRotulo}>
              {totais.quantidade} pedido(s) {status === "todos" ? "" : OPCOES_STATUS.find((o) => o.value === status)?.label.toLowerCase()}
            </span>
            <strong className={styles.totalizadorValor}>{resumirTotais(totais.porMoeda)}</strong>
            {totais.semValor > 0 && (
              <span className={styles.secundario}>{totais.semValor} sem valor (sem dados do ERP)</span>
            )}
          </div>

          {selecionados.length > 0 && (
            <div className={styles.totalizadorBloco}>
              <span className={styles.totalizadorRotulo}>{totaisSelecionados.quantidade} selecionado(s)</span>
              <strong className={styles.totalizadorValor}>{resumirTotais(totaisSelecionados.porMoeda)}</strong>
            </div>
          )}

          {totalPaginas > 1 && (
            <Pagination page={paginaAtual} totalPages={totalPaginas} onPageChange={setPagina} />
          )}
        </div>
      )}

      <PedidoCompraDetalheModal
        pedidoId={pedidoAbertoId}
        abrindoPdf={abrindoPdf !== null && abrindoPdf === pedidoAbertoId}
        onAbrirPdf={(pedido) => void abrirPdf(pedido)}
        onDecidir={(pedido, acao) => {
          /* Fecha o detalhe antes: a confirmação não fica empilhada sobre outro modal. */
          setPedidoAbertoId(null);
          abrirDecisao([pedido.id], acao);
        }}
        onClose={() => setPedidoAbertoId(null)}
      />

      <ConfirmDialog
        open={decisao !== null}
        title={
          pedidoUnico
            ? `${decisao?.acao === "devolver" ? "Devolver" : "Aprovar"} o pedido ${pedidoUnico.numero} (${nomeEmpresaPedidoCompra(pedidoUnico.empresa)})?`
            : `${decisao?.acao === "devolver" ? "Devolver" : "Aprovar"} ${quantidade} pedido(s)?`
        }
        variant={decisao?.acao === "devolver" ? "danger" : "warning"}
        confirmLabel={decisao?.acao === "devolver" ? "Devolver" : "Aprovar"}
        loading={processando || carregandoDirecionamento}
        message={
          <Stack gap={12}>
            <span>
              {decisao?.acao === "devolver"
                ? "O pedido volta para o comprador ajustar e reenviar (recomeça do nível 1). O motivo abaixo vai junto para o SupriConnect."
                : "Você aprova no seu nível. Se houver próximo nível, o pedido sobe para ele; se for o último, fica aprovado e o comprador é avisado no SupriConnect."}
            </span>
            {carregandoDirecionamento && <Loader label="Buscando o próximo nível..." />}
            {erroDirecionamento && <Alert variant="warning">{erroDirecionamento}</Alert>}
            {decisao?.acao === "aprovar" && direcionamentos && direcionamentos.length > 0 && (
              <Field
                label="Direcionar o próximo nível para"
                hint={
                  direcionar === SUGESTAO_DE_CADA
                    ? `Sugestões: ${resumirSugestoes(direcionamentos)}.`
                    : direcionar === TODOS_DO_NIVEL
                      ? "Qualquer pessoa do próximo nível poderá decidir."
                      : "Só essa pessoa verá e decidirá o pedido no próximo nível."
                }
              >
                <Dropdown
                  value={direcionar}
                  options={opcoesDirecionamento(direcionamentos)}
                  onValueChange={setDirecionar}
                  disabled={processando}
                />
              </Field>
            )}
            {decisao?.acao === "aprovar" && direcionamentos && direcionamentos.length > 0 && direcionamentos.length < quantidade && (
              <span className={styles.secundario}>
                {quantidade - direcionamentos.length} pedido(s) já estão no último nível: serão aprovados em definitivo.
              </span>
            )}
            <Textarea
              rows={3}
              value={comentario}
              onChange={(evento) => {
                setComentario(evento.target.value);
                if (erroComentario) setErroComentario(false);
              }}
              placeholder={
                decisao?.acao === "devolver" ? "Motivo da devolução (obrigatório)" : "Comentário (opcional)"
              }
              disabled={processando}
              hasError={erroComentario}
            />
            {erroComentario && (
              <span style={{ color: "var(--danger-text)" }}>Informe o motivo da devolução.</span>
            )}
          </Stack>
        }
        onConfirm={confirmarDecisao}
        onClose={() => setDecisao(null)}
      />
    </Stack>
  );
}
