"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";

import styles from "./ValidationModal.module.css";
import type {
  ApiIntegracaoItem,
  StepInfo,
} from "@/modules/integra-tubest/types/integraTubest.types";

/*
 * Conferência antes de exportar: filtra, ordena e remove linhas que não
 * devem ir para a planilha do TuBest.
 *
 * A altura da linha é constante (ver o CSS) porque a lista é
 * virtualizada -- um lote passa de 80 itens com facilidade, e o cálculo
 * do deslocamento é altura × índice.
 */

type Props = {
  open: boolean;
  items: ApiIntegracaoItem[];
  stepMap: Record<string, StepInfo>;
  onClose: () => void;
  onConfirm: (items: ApiIntegracaoItem[]) => void | Promise<void>;
};

type LinhaModal = {
  original: ApiIntegracaoItem;
  lote: string;
  ordem: string;
  codigo: string;
  descricao: string;
  qtde: number | "";
  codigoMp: string;
  descricaoMp: string;
  qtdeMp: number | "";
  unidadeMp: string;
  existe: boolean | null;
  duplicado: boolean;
  formato: string;
  arquivo: string;
  caminhos: string[];
  repetido: boolean;
  indice: number;
};

type SortKey = "lote" | "ordem" | "codigo" | "descricao" | "qtde" | "codigoMp" | "descricaoMp" | "qtdeMp";
type SortDir = "asc" | "desc";

const ALTURA_LINHA = 38;
const OVERSCAN = 8;

function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/* Mesma leitura do Lantek: quantidade de MP é fracionada e anda junto da unidade. */
function formatarQtdeMp(valor: number | "", unidade: string): string {
  if (valor === "" || valor === null || valor === undefined) return "—";

  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "—";

  const formatado = numero.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  return unidade ? `${formatado} ${unidade}` : formatado;
}

function comparar(a: unknown, b: unknown): number {
  const numeroA = Number(a);
  const numeroB = Number(b);

  if (a !== "" && b !== "" && !Number.isNaN(numeroA) && !Number.isNaN(numeroB)) {
    return numeroA - numeroB;
  }

  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", { numeric: true });
}

export default function ValidationModal({ open, items, stepMap, onClose, onConfirm }: Props) {
  const [busca, setBusca] = useState("");
  const [somenteSemStep, setSomenteSemStep] = useState(false);
  const [somenteRepetidos, setSomenteRepetidos] = useState(false);
  const [removidos, setRemovidos] = useState<Set<number>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [enviando, setEnviando] = useState(false);

  const [scrollTop, setScrollTop] = useState(0);
  const [alturaViewport, setAlturaViewport] = useState(420);
  const rolagemRef = useRef<HTMLDivElement>(null);

  /* Cada abertura começa limpa: filtro e remoção da busca anterior não
     valem para itens que nem estão mais na tela. */
  useEffect(() => {
    if (!open) return;

    setBusca("");
    setSomenteSemStep(false);
    setSomenteRepetidos(false);
    setRemovidos(new Set());
    setSelecionados(new Set());
    setSortKey(null);
    setScrollTop(0);
    rolagemRef.current?.scrollTo({ top: 0 });
  }, [open, items]);

  useEffect(() => {
    const elemento = rolagemRef.current;
    if (!elemento) return;

    const observer = new ResizeObserver(() => setAlturaViewport(elemento.clientHeight));
    observer.observe(elemento);
    setAlturaViewport(elemento.clientHeight);

    return () => observer.disconnect();
  }, [open]);

  const linhas = useMemo<LinhaModal[]>(() => {
    /* "Repetido" = mesmo código na mesma ordem, que viraria duas linhas
       iguais na planilha. */
    const contagem = new Map<string, number>();

    items.forEach((item) => {
      const codigo = String(item.cod_item ?? "").trim();
      const ordem = String(item.num_ordem ?? "").trim();
      if (!codigo || !ordem) return;
      const chave = `${ordem}__${codigo}`;
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    });

    return items.map((item, indice) => {
      const codigo = String(item.cod_item ?? "").trim();
      const ordem = String(item.num_ordem ?? "").trim();
      const info = stepMap[codigo];

      return {
        original: item,
        lote: String(item.num_lote_pro ?? ""),
        ordem,
        codigo,
        descricao: item.desc_tecnica ?? "",
        qtde: item.qtde ?? "",
        codigoMp: item.cod_item_mp ?? "",
        descricaoMp: item.desc_tecnica_mp ?? "",
        qtdeMp: item.qtde_mp ?? "",
        unidadeMp: item.cod_unid_med_mp ?? "",
        existe: info ? info.existe : null,
        duplicado: info?.duplicado ?? false,
        formato: info?.formato ?? "",
        arquivo: info?.arquivo ?? "",
        caminhos: info?.caminhos ?? [],
        repetido: !!codigo && !!ordem && (contagem.get(`${ordem}__${codigo}`) ?? 0) > 1,
        indice,
      };
    });
  }, [items, stepMap]);

  const ativos = useMemo(
    () => linhas.filter((linha) => !removidos.has(linha.indice)),
    [linhas, removidos]
  );

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);

    let lista = ativos.filter((linha) => {
      if (somenteSemStep && linha.existe !== false) return false;
      if (somenteRepetidos && !linha.repetido) return false;
      if (!termo) return true;

      return [
        linha.lote,
        linha.ordem,
        linha.codigo,
        linha.descricao,
        linha.arquivo,
        linha.codigoMp,
        linha.descricaoMp,
      ].some((campo) => normalizar(campo).includes(termo));
    });

    if (sortKey) {
      lista = [...lista].sort((a, b) => {
        const resultado = comparar(a[sortKey], b[sortKey]);
        return sortDir === "asc" ? resultado : -resultado;
      });
    }

    return lista;
  }, [ativos, busca, somenteSemStep, somenteRepetidos, sortKey, sortDir]);

  const comStep = ativos.filter((linha) => linha.existe === true).length;
  const semStep = ativos.filter((linha) => linha.existe === false).length;
  const duplicados = ativos.filter((linha) => linha.duplicado).length;
  const repetidos = ativos.filter((linha) => linha.repetido).length;

  const indicesFiltrados = filtrados.map((linha) => linha.indice);
  const selecionadosVisiveis = indicesFiltrados.filter((indice) => selecionados.has(indice));
  const todosSelecionados =
    indicesFiltrados.length > 0 && indicesFiltrados.every((indice) => selecionados.has(indice));

  const inicio = Math.max(0, Math.floor(scrollTop / ALTURA_LINHA) - OVERSCAN);
  const cabem = Math.ceil(alturaViewport / ALTURA_LINHA) + OVERSCAN * 2;
  const fim = Math.min(filtrados.length, inicio + cabem);
  const janela = filtrados.slice(inicio, fim);

  function ordenarPor(chave: SortKey) {
    if (sortKey === chave) {
      setSortDir((atual) => (atual === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(chave);
    setSortDir("asc");
  }

  function alternarTodos() {
    setSelecionados((anterior) => {
      const proximo = new Set(anterior);
      if (todosSelecionados) indicesFiltrados.forEach((indice) => proximo.delete(indice));
      else indicesFiltrados.forEach((indice) => proximo.add(indice));
      return proximo;
    });
  }

  function alternar(indice: number) {
    setSelecionados((anterior) => {
      const proximo = new Set(anterior);
      if (proximo.has(indice)) proximo.delete(indice);
      else proximo.add(indice);
      return proximo;
    });
  }

  function remover(indices: number[]) {
    if (!indices.length) return;

    setRemovidos((anterior) => {
      const proximo = new Set(anterior);
      indices.forEach((indice) => proximo.add(indice));
      return proximo;
    });

    setSelecionados((anterior) => {
      const proximo = new Set(anterior);
      indices.forEach((indice) => proximo.delete(indice));
      return proximo;
    });
  }

  async function confirmar() {
    if (enviando) return;

    try {
      setEnviando(true);
      await onConfirm(ativos.map((linha) => linha.original));
    } finally {
      setEnviando(false);
    }
  }

  const filtroAtivo = busca.trim().length > 0 || somenteSemStep || somenteRepetidos;

  function Coluna({ chave, rotulo, className = "" }: { chave: SortKey; rotulo: string; className?: string }) {
    const ativa = sortKey === chave;

    return (
      <th
        className={`${styles.ordenavel} ${className}`}
        onClick={() => ordenarPor(chave)}
        aria-sort={ativa ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        {rotulo}
        <span className={`${styles.seta} ${ativa ? styles.setaAtiva : ""}`}>
          {ativa ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </th>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xlarge"
      title="Conferência dos itens"
      description="Confira o que veio do Focco, filtre as peças sem STEP e remova o que não deve ir para a planilha."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>

          <Button onClick={confirmar} loading={enviando} disabled={ativos.length === 0}>
            Usar {ativos.length} item(ns)
          </Button>
        </>
      }
    >
      <Stack gap={16}>
  <div className={styles.resumo}>
            <span className={styles.chip}>
              Total <strong className={styles.chipValor}>{linhas.length}</strong>
            </span>
            <span className={`${styles.chip} ${styles.chipSucesso}`}>
              Com STEP <strong className={styles.chipValor}>{comStep}</strong>
            </span>
            <span className={`${styles.chip} ${styles.chipPerigo}`}>
              Sem STEP <strong className={styles.chipValor}>{semStep}</strong>
            </span>
            <span className={`${styles.chip} ${styles.chipAviso}`}>
              Mais de um arquivo <strong className={styles.chipValor}>{duplicados}</strong>
            </span>
            <span className={`${styles.chip} ${styles.chipAviso}`}>
              Repetidos <strong className={styles.chipValor}>{repetidos}</strong>
            </span>
            <span className={styles.chip}>
              Removidos <strong className={styles.chipValor}>{removidos.size}</strong>
            </span>
          </div>

        <div className={styles.filtros}>
          <div className={styles.busca}>
            <Input
              value={busca}
              placeholder="Buscar por ordem, lote, código, descrição ou arquivo..."
              onChange={(event) => setBusca(event.target.value)}
            />
          </div>

          <Checkbox
            label="Somente sem STEP"
            checked={somenteSemStep}
            onChange={(event) => setSomenteSemStep(event.target.checked)}
          />

          <Checkbox
            label="Somente repetidos"
            checked={somenteRepetidos}
            onChange={(event) => setSomenteRepetidos(event.target.checked)}
          />

          {filtroAtivo && (
            <Button
              variant="secondary"
              onClick={() => {
                setBusca("");
                setSomenteSemStep(false);
                setSomenteRepetidos(false);
              }}
            >
              Limpar filtros
            </Button>
          )}

          <span className={styles.contagemFiltro}>
            Exibindo {filtrados.length} de {ativos.length}
          </span>
        </div>

        <div
          className={`${styles.barraSelecao} ${
            selecionadosVisiveis.length > 0 ? styles.barraSelecaoAtiva : ""
          }`}
        >
          <span>
            {selecionadosVisiveis.length > 0
              ? `${selecionadosVisiveis.length} item(ns) selecionado(s)`
              : "Selecione os itens que deseja remover da planilha"}
          </span>

          <Button
            variant="danger"
            onClick={() => remover(selecionadosVisiveis)}
            disabled={selecionadosVisiveis.length === 0}
          >
            <Trash2 size={15} />
            Remover selecionados
          </Button>
        </div>

        <div
          ref={rolagemRef}
          className={styles.rolagem}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <table className={styles.tabela}>
            <colgroup>
              <col style={{ width: 46 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 140 }} />
              <col />
              <col style={{ width: 76 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 230 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 70 }} />
            </colgroup>

            <thead>
              <tr>
                <th className={styles.centro}>
                  <Checkbox
                    label=""
                    aria-label="Selecionar todos os itens visíveis"
                    checked={todosSelecionados}
                    onChange={alternarTodos}
                  />
                </th>
                <Coluna chave="lote" rotulo="Lote" />
                <Coluna chave="ordem" rotulo="Ordem" />
                <Coluna chave="codigo" rotulo="Código" />
                <Coluna chave="descricao" rotulo="Descrição" />
                <Coluna chave="qtde" rotulo="Qtde" className={styles.direita} />
                <Coluna chave="codigoMp" rotulo="Cód. MP" />
                <Coluna chave="descricaoMp" rotulo="Descrição MP" />
                <Coluna chave="qtdeMp" rotulo="Qtde MP" className={styles.direita} />
                <th className={styles.centro}>STEP</th>
                <th className={styles.centro}>Ações</th>
              </tr>
            </thead>

            <tbody>
              {inicio > 0 && (
                <tr className={styles.espacador}>
                  <td colSpan={11} style={{ height: inicio * ALTURA_LINHA }} />
                </tr>
              )}

              {janela.map((linha) => (
                <tr
                  key={linha.indice}
                  className={`${styles.linha} ${
                    selecionados.has(linha.indice) ? styles.selecionada : ""
                  }`}
                  onClick={() => alternar(linha.indice)}
                >
                  <td className={styles.centro} onClick={(evento) => evento.stopPropagation()}>
                    <Checkbox
                      label=""
                      aria-label={`Selecionar ${linha.codigo}`}
                      checked={selecionados.has(linha.indice)}
                      onChange={() => alternar(linha.indice)}
                    />
                  </td>
                  <td>{linha.lote}</td>
                  <td>{linha.ordem}</td>
                  <td className={styles.codigo}>
                    {linha.codigo}
                    {linha.repetido && (
                      <span className={`${styles.marcador} ${styles.marcadorRepetido}`}>
                        repetido
                      </span>
                    )}
                  </td>
                  <td title={linha.descricao}>{linha.descricao}</td>
                  <td className={styles.direita}>{linha.qtde}</td>
                  <td>{linha.codigoMp || "—"}</td>
                  <td title={linha.descricaoMp}>{linha.descricaoMp || "—"}</td>
                  <td className={styles.direita}>{formatarQtdeMp(linha.qtdeMp, linha.unidadeMp)}</td>
                  <td className={styles.centro}>
                    {linha.existe === false ? (
                      <span className={`${styles.situacao} ${styles.situacaoFalta}`}>Sem STEP</span>
                    ) : (
                      /* Tooltip NATIVO de propósito: o do portal tem z-index
                         10000 e o Modal 11600, então dentro do modal ele
                         renderiza atrás e nunca aparece. */
                      <span
                        className={`${styles.situacao} ${
                          linha.duplicado
                            ? styles.situacaoDuplicado
                            : linha.formato === "igs"
                              ? styles.situacaoIgs
                              : styles.situacaoOk
                        }`}
                        title={linha.caminhos.join("\n")}
                      >
                        {linha.duplicado
                          ? `${linha.caminhos.length} arquivos`
                          : linha.formato === "igs"
                            ? "IGS"
                            : "OK"}
                      </span>
                    )}
                  </td>
                  <td className={styles.centro} onClick={(evento) => evento.stopPropagation()}>
                    <IconButton
                      icon={<Trash2 size={15} />}
                      label={`Remover ${linha.codigo}`}
                      variant="neutral"
                      size="small"
                      onClick={() => remover([linha.indice])}
                    />
                  </td>
                </tr>
              ))}

              {fim < filtrados.length && (
                <tr className={styles.espacador}>
                  <td colSpan={11} style={{ height: (filtrados.length - fim) * ALTURA_LINHA }} />
                </tr>
              )}

              {filtrados.length === 0 && (
                <tr>
                  <td className={styles.vazio} colSpan={11}>
                    Nenhum item corresponde aos filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Stack>
    </Modal>
  );
}
