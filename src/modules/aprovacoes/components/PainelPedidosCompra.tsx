"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, ShoppingCart, XCircle } from "lucide-react";

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
import { decidirPedidosCompra, listarPedidosCompraPainel } from "../services/aprovacoes.service";
import type { PedidoCompraPainel, StatusAprovacao } from "../types/aprovacoes.types";
import { formatarDataCurta, formatarValor, resumirTotais, somarPedidos } from "../utils/pedidos-compra-formato";
import { PedidoCompraDetalheModal } from "./PedidoCompraDetalheModal";
import styles from "./PainelPedidosCompra.module.css";

type FiltroStatus = StatusAprovacao | "todos";

const OPCOES_STATUS: { value: FiltroStatus; label: string }[] = [
  { value: "pendente", label: "Pendentes" },
  { value: "aprovado", label: "Aprovados" },
  { value: "reprovado", label: "Reprovados" },
  { value: "todos", label: "Todos" },
];

const POR_PAGINA = 20;

const SITUACAO_ERP: Record<string, string> = {
  pendente: "Pendente no Focco",
  parcial: "Parcial no Focco",
  atendido: "Atendido no Focco",
  cancelado: "Cancelado no Focco",
};

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
 * A fila já vem filtrada pelo servidor: empresas marcadas para o
 * diretor, e pedidos direcionados a ele ou a ninguém.
 */
export function PainelPedidosCompra({ onDecidido }: PainelPedidosCompraProps) {
  const [pedidos, setPedidos] = useState<PedidoCompraPainel[]>([]);
  const [empresasDoDiretor, setEmpresasDoDiretor] = useState<number[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [status, setStatus] = useState<FiltroStatus>("pendente");
  const [empresa, setEmpresa] = useState("");
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [recarga, setRecarga] = useState(0);

  const [selecionados, setSelecionados] = useState<string[]>([]);
  /* Decisão em andamento: os ids e a ação (um pedido só, pelo botão da linha, ou a seleção). */
  const [decisao, setDecisao] = useState<{ ids: string[]; acao: "aprovar" | "reprovar" } | null>(null);
  const [comentario, setComentario] = useState("");
  const [erroComentario, setErroComentario] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [abrindoPdf, setAbrindoPdf] = useState<string | null>(null);
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setBusca(buscaDigitada.trim()), 400);
    return () => clearTimeout(timer);
  }, [buscaDigitada]);

  useEffect(() => {
    let ativo = true;

    listarPedidosCompraPainel({ status, empresa, busca }).then((resultado) => {
      if (!ativo) return;

      if (resultado.ok && resultado.data) {
        setPedidos(resultado.data.pedidos);
        setEmpresasDoDiretor(resultado.data.empresas);
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
  }, [status, empresa, busca, recarga]);

  function recarregar() {
    setCarregando(true);
    setRecarga((atual) => atual + 1);
  }

  const pendentesVisiveis = useMemo(() => pedidos.filter((pedido) => pedido.status === "pendente"), [pedidos]);
  const todosSelecionados = pendentesVisiveis.length > 0 && selecionados.length === pendentesVisiveis.length;

  /* Totais de TODA a lista filtrada (não só da página), e da seleção. */
  const totais = useMemo(() => somarPedidos(pedidos), [pedidos]);
  const totaisSelecionados = useMemo(
    () => somarPedidos(pedidos.filter((pedido) => selecionados.includes(pedido.id))),
    [pedidos, selecionados]
  );

  const totalPaginas = Math.max(1, Math.ceil(pedidos.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pedidosPagina = pedidos.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  function alternarSelecao(id: string) {
    setSelecionados((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
  }

  function abrirDecisao(ids: string[], acao: "aprovar" | "reprovar") {
    setComentario("");
    setErroComentario(false);
    setDecisao({ ids, acao });
  }

  async function confirmarDecisao() {
    if (!decisao) return;

    if (decisao.acao === "reprovar" && !comentario.trim()) {
      setErroComentario(true);
      return;
    }

    setProcessando(true);

    try {
      const resultado = await decidirPedidosCompra({
        ids: decisao.ids,
        acao: decisao.acao,
        comentario: comentario.trim() || undefined,
      });

      if (resultado.ok && resultado.data) {
        const total = resultado.data.decididos.length;
        const verbo = decisao.acao === "aprovar" ? "aprovado(s)" : "reprovado(s)";

        setAviso(
          resultado.data.ignorados > 0
            ? `${total} pedido(s) ${verbo}. ${resultado.data.ignorados} já tinha(m) sido decidido(s) e ficou(aram) como estava(m).`
            : `${total} pedido(s) ${verbo}.`
        );
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

  const semEmpresa = !carregando && !erro && empresasDoDiretor.length === 0;
  const quantidade = decisao?.ids.length ?? 0;
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
              { value: "", label: "Todas as minhas empresas" },
              ...EMPRESAS_PEDIDO_COMPRA.filter((item) => empresasDoDiretor.includes(item.codigo)).map((item) => ({
                value: String(item.codigo),
                label: item.nome,
              })),
            ]}
            onValueChange={setEmpresa}
          />
        </Field>

        <Field label="Pedido, fornecedor ou comprador">
          <Input
            value={buscaDigitada}
            placeholder="Número do pedido ou nome..."
            onChange={(evento) => setBuscaDigitada(evento.target.value)}
          />
        </Field>
      </FormGrid>

      {erro && <Alert variant="danger">{erro}</Alert>}
      {aviso && <Alert variant="success">{aviso}</Alert>}

      {semEmpresa && (
        <Alert variant="warning" title="Nenhuma empresa liberada para você">
          Você é aprovador de pedidos de compra, mas ainda não tem nenhuma empresa marcada. Peça a um
          administrador em Administração → Diretoria → Pedidos de Compra.
        </Alert>
      )}

      {selecionados.length > 0 && (
        <Stack direction="row" gap={12} align="center" justify="between" wrap>
          <strong>{selecionados.length} pedido(s) selecionado(s)</strong>

          <Stack direction="row" gap={8} wrap>
            <Button variant="secondary" onClick={() => setSelecionados([])}>
              Limpar seleção
            </Button>
            <Button variant="danger" onClick={() => abrirDecisao(selecionados, "reprovar")}>
              <XCircle size={16} />
              Reprovar selecionados
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
      ) : pedidos.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart size={28} />}
          title={busca ? "Nenhum resultado para essa busca" : "Nenhum pedido de compra nesta situação"}
        />
      ) : (
        <Table minWidth={1100}>
          <TableHead>
            <TableRow>
              <TableHeaderCell align="center">
                <Checkbox
                  label=""
                  aria-label="Selecionar todos os pendentes"
                  checked={todosSelecionados}
                  disabled={pendentesVisiveis.length === 0}
                  onChange={() =>
                    setSelecionados(todosSelecionados ? [] : pendentesVisiveis.map((pedido) => pedido.id))
                  }
                />
              </TableHeaderCell>
              <TableHeaderCell>Pedido</TableHeaderCell>
              <TableHeaderCell>Fornecedor</TableHeaderCell>
              <TableHeaderCell>Emissão</TableHeaderCell>
              <TableHeaderCell align="center">Itens</TableHeaderCell>
              <TableHeaderCell>Pagamento</TableHeaderCell>
              <TableHeaderCell align="right">Valor</TableHeaderCell>
              <TableHeaderCell align="center">Situação</TableHeaderCell>
              <TableHeaderCell align="center">Ações</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pedidosPagina.map((pedido) => {
              const pendente = pedido.status === "pendente";
              const situacaoErp = pedido.situacaoErp ? SITUACAO_ERP[pedido.situacaoErp] : null;

              return (
                <TableRow key={pedido.id} style={{ cursor: "pointer" }} onClick={() => setPedidoAbertoId(pedido.id)}>
                  <TableCell align="center">
                    <div onClick={(evento) => evento.stopPropagation()}>
                      <Checkbox
                        label=""
                        aria-label={`Selecionar pedido ${pedido.numero}`}
                        checked={selecionados.includes(pedido.id)}
                        disabled={!pendente}
                        onChange={() => alternarSelecao(pedido.id)}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Stack gap={2}>
                      <strong>{pedido.numero}</strong>
                      <span className={styles.secundario}>
                        {pedido.empresaNome} · aprovação #{pedido.numeroAprovacao}
                      </span>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {pedido.fornecedorNome ? (
                      <Stack gap={2}>
                        <span className={styles.fornecedor}>{pedido.fornecedorNome}</span>
                        {pedido.compradorNome && (
                          <span className={styles.secundario}>Comprador: {pedido.compradorNome}</span>
                        )}
                      </Stack>
                    ) : (
                      <span className={styles.secundario}>Sem dados do ERP</span>
                    )}
                  </TableCell>
                  <TableCell>{formatarDataCurta(pedido.dataEmissao)}</TableCell>
                  <TableCell align="center">{pedido.quantidadeItens ?? "-"}</TableCell>
                  <TableCell>{pedido.condicaoPagamento ?? "-"}</TableCell>
                  <TableCell align="right">
                    <strong>{formatarValor(pedido.valorTotal, pedido.moeda)}</strong>
                  </TableCell>
                  <TableCell align="center">
                    <Stack gap={4} align="center">
                      <Badge variant={statusAprovacaoConfig[pedido.status].badgeVariant}>
                        {statusAprovacaoConfig[pedido.status].label}
                      </Badge>
                      {pedido.decididoPor && (
                        <span className={styles.secundario} title={pedido.comentario ?? undefined}>
                          {pedido.decididoPor}
                        </span>
                      )}
                      {pendente && situacaoErp && pedido.situacaoErp !== "pendente" && (
                        <span className={styles.secundario}>{situacaoErp}</span>
                      )}
                    </Stack>
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
                      {pendente && (
                        <>
                          <IconButton
                            icon={<CheckCircle2 size={15} />}
                            label={`Aprovar pedido ${pedido.numero}`}
                            size="small"
                            onClick={() => abrirDecisao([pedido.id], "aprovar")}
                          />
                          <IconButton
                            icon={<XCircle size={15} />}
                            label={`Reprovar pedido ${pedido.numero}`}
                            size="small"
                            onClick={() => abrirDecisao([pedido.id], "reprovar")}
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

      {!carregando && pedidos.length > 0 && (
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
            ? `${decisao?.acao === "reprovar" ? "Reprovar" : "Aprovar"} o pedido ${pedidoUnico.numero} (${nomeEmpresaPedidoCompra(pedidoUnico.empresa)})?`
            : `${decisao?.acao === "reprovar" ? "Reprovar" : "Aprovar"} ${quantidade} pedido(s)?`
        }
        variant={decisao?.acao === "reprovar" ? "danger" : "warning"}
        confirmLabel={decisao?.acao === "reprovar" ? "Reprovar" : "Aprovar"}
        loading={processando}
        message={
          <Stack gap={12}>
            <span>
              {decisao?.acao === "reprovar"
                ? "O motivo abaixo é registrado no pedido e volta para o comprador no SupriConnect."
                : "A decisão volta para o comprador no SupriConnect."}
            </span>
            <Textarea
              rows={3}
              value={comentario}
              onChange={(evento) => {
                setComentario(evento.target.value);
                if (erroComentario) setErroComentario(false);
              }}
              placeholder={
                decisao?.acao === "reprovar" ? "Motivo da reprovação (obrigatório)" : "Comentário (opcional)"
              }
              disabled={processando}
              hasError={erroComentario}
            />
            {erroComentario && (
              <span style={{ color: "var(--danger-text)" }}>Informe o motivo da reprovação.</span>
            )}
          </Stack>
        }
        onConfirm={confirmarDecisao}
        onClose={() => setDecisao(null)}
      />
    </Stack>
  );
}
