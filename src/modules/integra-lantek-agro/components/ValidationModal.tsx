"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import type { ApiIntegracaoItem } from "@/modules/integra-lantek-agro/types/processamentoOrdens.types";
import type { DxfInfo } from "@/modules/integra-lantek-agro/ProcessamentoOrdensPage";
import DesenhoViewerModal from "@/modules/integra-lantek-agro/components/DesenhoViewerModal";
import styles from "@/modules/integra-lantek-shared/components/ValidationModal.module.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  open: boolean;
  items: ApiIntegracaoItem[];
  dxfMap: Record<string, DxfInfo>;
  onClose: () => void;
  onConfirm: (items: ApiIntegracaoItem[]) => void | Promise<void>;
};

type LinhaModal = ApiIntegracaoItem & {
  codigo: string;
  existe: boolean | null;
  duplicadoDxf: boolean;
  caminhosDxf: string[];
  repetidoOrdem: boolean;
  repetidoLote: boolean;
  repetidoGeral: boolean;
  _index: number;
};

type SortKey = keyof Pick<
  LinhaModal,
  | "num_lote_pro"
  | "num_ordem"
  | "cod_item"
  | "desc_tecnica"
  | "qtde"
  | "cod_item_mp"
  | "desc_tecnica_mp"
  | "qtde_mp"
  | "descricao_operacao"
  | "descricao_maquina"
  | "existe"
>;

type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 40;
const OVERSCAN = 5;
const REMOVE_ANIM_MS = 320;

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  sel: 44,
  lote: 110,
  ordem: 110,
  codigo: 160,
  desc: 220,
  qtde: 72,
  mp_codigo: 140,
  mp_desc: 220,
  mp_qtde: 72,
  operacao: 160,
  maquina: 140,
  dxf: 168,
  acoes: 56,
};

const FIXED_COLS = ["sel", "lote", "ordem", "codigo"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizarTexto(valor: unknown) {
  return String(valor ?? "").trim().toLowerCase();
}

function cmpVal(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className={styles.sortIdle}>⇅</span>;
  return <span className={styles.sortActive}>{dir === "asc" ? "↑" : "↓"}</span>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ValidationModal({
  open,
  items,
  dxfMap,
  onClose,
  onConfirm,
}: Props) {
  const [somenteSemDxf, setSomenteSemDxf] = useState(false);
  const [somenteRepetidos, setSomenteRepetidos] = useState(false);
  const [busca, setBusca] = useState("");

  const [removidos, setRemovidos] = useState<Set<number>>(new Set());
  const [saindo, setSaindo] = useState<Set<number>>(new Set());

  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_COL_WIDTHS);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [desenhoVisualizacao, setDesenhoVisualizacao] = useState<{
    open: boolean;
    caminhoDxf: string;
    arquivoDxf: string;
    codigo: string;
    codDesenho: string;
  }>({ open: false, caminhoDxf: "", arquivoDxf: "", codigo: "", codDesenho: "" });

  function abrirVisualizacaoDxf(item: LinhaModal) {
    const caminho = item.caminhosDxf[0];
    if (!caminho) return;

    setDesenhoVisualizacao({
      open: true,
      caminhoDxf: caminho,
      arquivoDxf: caminho.split("\\").pop() ?? item.codigo,
      codigo: item.codigo,
      codDesenho: String(item.cod_desenho ?? ""),
    });
  }

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    rowIndex: number | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    rowIndex: null,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const headScrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const resizingCol = useRef<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  function fecharMenuContexto() {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      rowIndex: null,
    });
  }

  function abrirMenuContexto(event: React.MouseEvent, rowIndex: number) {
    event.preventDefault();
    event.stopPropagation();

    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      rowIndex,
    });
  }

  function excluirLinhaMenuContexto() {
    if (contextMenu.rowIndex === null) return;
    removerLinha(contextMenu.rowIndex);
    fecharMenuContexto();
  }

  function visualizarDesenhoMenuContexto() {
    if (contextMenu.rowIndex === null) return;

    const item = itensComStatus[contextMenu.rowIndex];
    fecharMenuContexto();

    if (item?.existe === true) abrirVisualizacaoDxf(item);
  }

  // -------------------------------------------------------------------------
  // Open / close UX
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (contextMenu.visible) {
          fecharMenuContexto();
          return;
        }

        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, onClose, contextMenu.visible]);

  useEffect(() => {
    if (!contextMenu.visible) return;

    const handleGlobalClose = () => fecharMenuContexto();

    window.addEventListener("click", handleGlobalClose);
    window.addEventListener("resize", handleGlobalClose);
    window.addEventListener("scroll", handleGlobalClose, true);

    return () => {
      window.removeEventListener("click", handleGlobalClose);
      window.removeEventListener("resize", handleGlobalClose);
      window.removeEventListener("scroll", handleGlobalClose, true);
    };
  }, [contextMenu.visible]);

  // Reset visual scroll on open
  // Reset completo ao abrir o modal ou trocar os itens
  useEffect(() => {
    if (!open) return;

    setSomenteSemDxf(false);
    setSomenteRepetidos(false);
    setBusca("");

    setRemovidos(new Set());
    setSaindo(new Set());
    setSelecionados(new Set());

    setSortKey(null);
    setSortDir("asc");
    setColWidths(DEFAULT_COL_WIDTHS);

    setScrollTop(0);
    setIsSubmitting(false);

    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      rowIndex: null,
    });

    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      scrollRef.current.scrollLeft = 0;
    }

    if (headScrollRef.current) {
      headScrollRef.current.scrollLeft = 0;
    }
  }, [open, items]);

  // Viewport height via ResizeObserver
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;

    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    setViewportHeight(el.clientHeight);

    return () => ro.disconnect();
  }, [open]);

  // Column resize drag
  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent, col: string) => {
      e.preventDefault();
      resizingCol.current = col;
      resizeStartX.current = e.clientX;
      resizeStartW.current = colWidths[col] ?? DEFAULT_COL_WIDTHS[col] ?? 100;

      const onMove = (ev: MouseEvent) => {
        if (!resizingCol.current) return;
        const delta = ev.clientX - resizeStartX.current;

        setColWidths((prev) => ({
          ...prev,
          [resizingCol.current!]: Math.max(40, resizeStartW.current + delta),
        }));
      };

      const onUp = () => {
        resizingCol.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [colWidths]
  );

  // -------------------------------------------------------------------------
  // Remoção com animação
  // -------------------------------------------------------------------------
  function iniciarRemocao(indices: number[]) {
    if (indices.length === 0) return;

    fecharMenuContexto();

    setSaindo((prev) => {
      const next = new Set(prev);
      indices.forEach((i) => next.add(i));
      return next;
    });

    window.setTimeout(() => {
      setRemovidos((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => next.add(i));
        return next;
      });

      setSaindo((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => next.delete(i));
        return next;
      });

      setSelecionados((prev) => {
        const next = new Set(prev);
        indices.forEach((i) => next.delete(i));
        return next;
      });
    }, REMOVE_ANIM_MS);
  }

  function removerLinha(idx: number) {
    iniciarRemocao([idx]);
  }

  function removerSelecionados() {
    const selecionadosVisiveis = itensFiltrados
      .map((item) => item._index)
      .filter((idx) => selecionados.has(idx));

    iniciarRemocao(selecionadosVisiveis);
  }

  function limparFiltros() {
    setBusca("");
    setSomenteSemDxf(false);
    setSomenteRepetidos(false);
    fecharMenuContexto();
  }

  // -------------------------------------------------------------------------
  // Data processing
  // -------------------------------------------------------------------------
  const itensComStatus = useMemo<LinhaModal[]>(() => {
    const mapaOrdemCodigo = new Map<string, number>();
    const mapaLoteCodigo = new Map<string, number>();

    items.forEach((item) => {
      const codigo = String(item.cod_item ?? "").trim();
      const ordem = String(item.num_ordem ?? "").trim();
      const lote = String(item.num_lote_pro ?? "").trim();

      if (ordem && codigo) {
        const chave = `${ordem}__${codigo}`;
        mapaOrdemCodigo.set(chave, (mapaOrdemCodigo.get(chave) ?? 0) + 1);
      }

      if (lote && codigo) {
        const chave = `${lote}__${codigo}`;
        mapaLoteCodigo.set(chave, (mapaLoteCodigo.get(chave) ?? 0) + 1);
      }
    });

    return items.map((item, index) => {
      const codigo = String(item.cod_item ?? "").trim();
      const ordem = String(item.num_ordem ?? "").trim();
      const lote = String(item.num_lote_pro ?? "").trim();

      const infoDxf = Object.prototype.hasOwnProperty.call(dxfMap, codigo)
        ? dxfMap[codigo]
        : undefined;

      const existe = infoDxf ? infoDxf.existe : null;
      const duplicadoDxf = infoDxf?.duplicado ?? false;
      const caminhosDxf = infoDxf?.caminhos ?? [];

      const repetidoOrdem =
        !!ordem && !!codigo && (mapaOrdemCodigo.get(`${ordem}__${codigo}`) ?? 0) > 1;

      const repetidoLote =
        !!lote && !!codigo && (mapaLoteCodigo.get(`${lote}__${codigo}`) ?? 0) > 1;

      return {
        ...item,
        codigo,
        existe,
        duplicadoDxf,
        caminhosDxf,
        repetidoOrdem,
        repetidoLote,
        repetidoGeral: repetidoOrdem || repetidoLote,
        _index: index,
      };
    });
  }, [items, dxfMap]);

  const itensAtivos = useMemo(
    () => itensComStatus.filter((item) => !removidos.has(item._index)),
    [itensComStatus, removidos]
  );

  const itensFiltrados = useMemo(() => {
    const termo = normalizarTexto(busca);

    let lista = itensAtivos.filter((item) => {
      if (somenteSemDxf && item.existe !== false) return false;
      if (somenteRepetidos && !item.repetidoGeral) return false;
      if (!termo) return true;

      return [
        item.num_lote_pro,
        item.num_ordem,
        item.cod_item,
        item.desc_tecnica,
        item.cod_item_mp,
        item.desc_tecnica_mp,
        item.descricao_operacao,
        item.descricao_maquina,
      ].some((campo) => normalizarTexto(campo).includes(termo));
    });

    if (sortKey) {
      lista = [...lista].sort((a, b) => {
        const result = cmpVal(a[sortKey], b[sortKey]);
        return sortDir === "asc" ? result : -result;
      });
    }

    return lista;
  }, [itensAtivos, busca, somenteSemDxf, somenteRepetidos, sortKey, sortDir]);

  // Virtual scroll
  const totalRows = itensFiltrados.length;
  const totalHeight = totalRows * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(totalRows, startIndex + visibleCount);
  const visibleItems = itensFiltrados.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

  // Sort
  function toggleSort(key: SortKey) {
    fecharMenuContexto();

    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDir("asc");
  }

  // Selection
  const indicesFiltrados = itensFiltrados.map((item) => item._index);
  const indicesSelecionadosVisiveis = indicesFiltrados.filter((idx) => selecionados.has(idx));

  const todosFiltradosSelecionados =
    indicesFiltrados.length > 0 &&
    indicesFiltrados.every((idx) => selecionados.has(idx));

  function toggleSelecionarTodos() {
    fecharMenuContexto();

    setSelecionados((prev) => {
      const next = new Set(prev);

      if (todosFiltradosSelecionados) {
        indicesFiltrados.forEach((idx) => next.delete(idx));
      } else {
        indicesFiltrados.forEach((idx) => next.add(idx));
      }

      return next;
    });
  }

  function toggleSelecionado(idx: number) {
    fecharMenuContexto();

    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleConfirm() {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);

      const itensParaGrid = itensAtivos.map(
        ({
          _index: _i,
          codigo: _c,
          existe: _e,
          repetidoOrdem: _ro,
          repetidoLote: _rl,
          repetidoGeral: _rg,
          ...item
        }) => item as ApiIntegracaoItem
      );

      await onConfirm(itensParaGrid);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) return null;

  const total = itensComStatus.length;
  const totalComDxf = itensAtivos.filter((item) => item.existe === true).length;
  const totalSemDxf = itensAtivos.filter((item) => item.existe === false).length;
  const totalPendentes = itensAtivos.filter((item) => item.existe === null).length;
  const totalRepetidos = itensAtivos.filter((item) => item.repetidoGeral).length;
  const totalDuplicadosDxf = itensAtivos.filter((item) => item.duplicadoDxf).length;
  const totalRestantes = itensAtivos.length;
  const totalRemovidos = removidos.size;

  const existeFiltroAtivo =
    busca.trim().length > 0 || somenteSemDxf || somenteRepetidos;

  // Fixed column left offsets
  const fixedOrder = ["sel", "lote", "ordem", "codigo"] as const;

  function fixedLeft(col: string): number | undefined {
    if (!FIXED_COLS.includes(col as (typeof FIXED_COLS)[number])) return undefined;

    let acumulado = 0;
    for (const currentCol of fixedOrder) {
      if (currentCol === col) return acumulado;
      acumulado += colWidths[currentCol] ?? DEFAULT_COL_WIDTHS[currentCol];
    }

    return acumulado;
  }

  function thStyle(col: string): React.CSSProperties {
    const width = colWidths[col] ?? DEFAULT_COL_WIDTHS[col];
    const left = fixedLeft(col);

    return {
      width,
      minWidth: width,
      maxWidth: width,
      ...(left !== undefined
        ? {
          position: "sticky",
          left,
          zIndex: 4,
        }
        : {}),
    };
  }

  function tdStyle(col: string, selected?: boolean): React.CSSProperties {
    const width = colWidths[col] ?? DEFAULT_COL_WIDTHS[col];
    const left = fixedLeft(col);

    return {
      width,
      minWidth: width,
      maxWidth: width,
      ...(left !== undefined
        ? {
          position: "sticky",
          left,
          zIndex: 2,
          background: selected
            ? "var(--row-selected-bg, var(--danger-bg))"
            : "var(--td-bg, var(--bg-surface))",
        }
        : {}),
    };
  }

  function Th({
    col,
    sortK,
    label,
    center,
  }: {
    col: string;
    sortK?: SortKey;
    label: React.ReactNode;
    center?: boolean;
  }) {
    return (
      <th
        className={`${styles.th} ${sortK ? styles.thSortable : ""} ${center ? styles.thCenter : ""}`}
        style={thStyle(col)}
        onClick={sortK ? () => toggleSort(sortK) : undefined}
      >
        <div className={styles.thInner}>
          <span className={styles.thLabel}>{label}</span>
          {sortK && <SortIcon active={sortKey === sortK} dir={sortDir} />}
          {col !== "acoes" && col !== "sel" && (
            <span
              className={styles.resizeHandle}
              onMouseDown={(e) => {
                e.stopPropagation();
                onResizeMouseDown(e, col);
              }}
            />
          )}
        </div>
      </th>
    );
  }

  const colKeys = Object.keys(DEFAULT_COL_WIDTHS);
  const numSelecionados = indicesSelecionadosVisiveis.length;

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          fecharMenuContexto();
          onClose();
        }
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="validation-modal-title"
        onMouseDown={() => {
          if (contextMenu.visible) fecharMenuContexto();
        }}
      >
        <div className={styles.header}>
          <div>
            <span className={styles.badge}>Validação prévia</span>
            <h2 id="validation-modal-title" className={styles.title}>
              Conferência dos itens encontrados
            </h2>
            <p className={styles.subtitle}>
              Revise os dados retornados pela API, filtre rapidamente os itens sem DXF
              e elimine duplicidades antes de enviar para o grid.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton}
            aria-label="Fechar modal"
            title="Fechar"
          >
            ×
          </button>
        </div>

        <div className={styles.summaryRow}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Total</span>
            <strong className={styles.summaryValue}>{total}</strong>
          </div>

          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>DXF encontrado</span>
            <strong className={`${styles.summaryValue} ${styles.successText}`}>
              {totalComDxf}
            </strong>
          </div>

          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Sem DXF</span>
            <strong className={`${styles.summaryValue} ${styles.dangerText}`}>
              {totalSemDxf}
            </strong>
          </div>

          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Validando</span>
            <strong className={`${styles.summaryValue} ${styles.mutedText}`}>
              {totalPendentes}
            </strong>
          </div>

          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Repetidos</span>
            <strong className={`${styles.summaryValue} ${styles.warningText}`}>
              {totalRepetidos}
            </strong>
          </div>

          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>DXF duplicado</span>
            <strong className={`${styles.summaryValue} ${styles.warningText}`}>
              {totalDuplicadosDxf}
            </strong>
          </div>

          <div
            className={`${styles.summaryCard} ${totalRemovidos > 0
              ? styles.summaryCardRemoved
              : styles.summaryCardRemovedEmpty
              }`}
          >
            <span className={styles.summaryLabel}>Removidos</span>
            <strong
              className={`${styles.summaryValue} ${totalRemovidos > 0 ? styles.dangerText : styles.mutedText
                }`}
            >
              {totalRemovidos}
            </strong>
          </div>
        </div>

        <div className={styles.filterBar}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar por ordem, lote, código, descrição, operação..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={styles.searchInput}
          />

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={somenteSemDxf}
              onChange={(e) => setSomenteSemDxf(e.target.checked)}
            />
            Somente sem DXF
          </label>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={somenteRepetidos}
              onChange={(e) => setSomenteRepetidos(e.target.checked)}
            />
            Somente repetidos
          </label>

          <button
            type="button"
            onClick={limparFiltros}
            className={styles.secondaryButton}
            disabled={!existeFiltroAtivo}
          >
            Limpar filtros
          </button>

          <div className={styles.filteredInfo}>
            Exibindo {itensFiltrados.length} de {totalRestantes}
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <div
            className={`${styles.selectionBar} ${numSelecionados > 0 ? styles.selectionBarActive : styles.selectionBarIdle
              }`}
          >
            <div className={styles.selectionLeft}>
              <span
                className={`${styles.selectionBadge} ${numSelecionados > 0
                  ? styles.selectionBadgeActive
                  : styles.selectionBadgeIdle
                  }`}
              >
                {numSelecionados}
              </span>

              <span className={styles.selectionCount}>
                {numSelecionados > 0
                  ? numSelecionados === 1
                    ? "1 item visível selecionado"
                    : `${numSelecionados} itens visíveis selecionados`
                  : "Selecione os itens visíveis que deseja remover"}
              </span>
            </div>

            <button
              type="button"
              onClick={removerSelecionados}
              className={styles.removeSelectedButton}
              disabled={numSelecionados === 0}
            >
              <span className={styles.removeIcon}>🗑</span>
              Remover selecionados
            </button>
          </div>

          <div ref={headScrollRef} className={styles.tableHeadWrapper}>
            <table
              className={styles.table}
              style={{
                tableLayout: "fixed",
                width: "max-content",
                minWidth: "1500px",
              }}
            >
              <colgroup>
                {colKeys.map((col) => (
                  <col
                    key={col}
                    style={{ width: colWidths[col] ?? DEFAULT_COL_WIDTHS[col] }}
                  />
                ))}
              </colgroup>

              <thead>
                <tr>
                  <th className={styles.th} style={thStyle("sel")}>
                    <div className={styles.thInner}>
                      <input
                        type="checkbox"
                        checked={todosFiltradosSelecionados}
                        onChange={toggleSelecionarTodos}
                        title="Selecionar todos os itens visíveis"
                      />
                    </div>
                  </th>

                  <Th col="lote" sortK="num_lote_pro" label="Lote" />
                  <Th col="ordem" sortK="num_ordem" label="Ordem" />
                  <Th col="codigo" sortK="cod_item" label="Código Item" />
                  <Th col="desc" sortK="desc_tecnica" label="Descrição Item" />
                  <Th col="qtde" sortK="qtde" label="Qtde" center />
                  <Th col="mp_codigo" sortK="cod_item_mp" label="Código MP" />
                  <Th col="mp_desc" sortK="desc_tecnica_mp" label="Descrição MP" />
                  <Th col="mp_qtde" sortK="qtde_mp" label="Qtde MP" center />
                  <Th col="operacao" sortK="descricao_operacao" label="Operação" />
                  <Th col="maquina" sortK="descricao_maquina" label="Máquina" />
                  <Th col="dxf" sortK="existe" label="DXF" center />

                  <th className={styles.th} style={thStyle("acoes")}>
                    <div className={styles.thInner} />
                  </th>
                </tr>
              </thead>
            </table>
          </div>

          <div
            ref={scrollRef}
            className={styles.virtualScroll}
            onScroll={(e) => {
              const target = e.currentTarget as HTMLDivElement;
              setScrollTop(target.scrollTop);

              if (headScrollRef.current) {
                headScrollRef.current.scrollLeft = target.scrollLeft;
              }

              if (contextMenu.visible) {
                fecharMenuContexto();
              }
            }}
          >
            <div style={{ height: totalHeight, position: "relative" }}>
              <table
                className={styles.table}
                style={{
                  tableLayout: "fixed",
                  position: "absolute",
                  top: offsetY,
                  width: "max-content",
                  minWidth: "1500px",
                }}
              >
                <colgroup>
                  {colKeys.map((col) => (
                    <col
                      key={col}
                      style={{ width: colWidths[col] ?? DEFAULT_COL_WIDTHS[col] }}
                    />
                  ))}
                </colgroup>

                <tbody>
                  {visibleItems.map((item) => {
                    const selected = selecionados.has(item._index);
                    const removing = saindo.has(item._index);

                    return (
                      <tr
                        key={item._index}
                        className={[
                          styles.tr,
                          selected ? styles.rowSelected : "",
                          removing ? styles.rowRemoving : "",
                        ].join(" ")}
                        style={{ height: ROW_HEIGHT }}
                        onContextMenu={(event) => abrirMenuContexto(event, item._index)}
                      >
                        <td className={styles.td} style={tdStyle("sel", selected)}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelecionado(item._index)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>

                        <td className={styles.td} style={tdStyle("lote", selected)}>
                          {item.num_lote_pro ?? "-"}
                        </td>

                        <td className={styles.td} style={tdStyle("ordem", selected)}>
                          {item.num_ordem ?? "-"}
                        </td>

                        <td className={styles.td} style={tdStyle("codigo", selected)}>
                          <div className={styles.codeCell}>
                            <span>{item.codigo || "-"}</span>

                            {(item.repetidoGeral || item.duplicadoDxf) && (
                              <div className={styles.inlineBadges}>
                                {item.repetidoOrdem && (
                                  <span className={styles.repeatBadge}>Rep. Ordem</span>
                                )}
                                {item.repetidoLote && (
                                  <span className={styles.repeatBadge}>Rep. Lote</span>
                                )}
                                {item.duplicadoDxf && (
                                  <span
                                    className={styles.dxfBadge}
                                    title={`DXF encontrado em ${item.caminhosDxf.length} locais:\n${item.caminhosDxf.join("\n")}`}
                                  >
                                    DXF duplicado
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className={styles.td} style={tdStyle("desc")}>
                          {item.desc_tecnica ?? "-"}
                        </td>

                        <td className={`${styles.td} ${styles.tdCenter}`} style={tdStyle("qtde")}>
                          {item.qtde ?? "-"}
                        </td>

                        <td className={styles.td} style={tdStyle("mp_codigo")}>
                          {item.cod_item_mp ?? "-"}
                        </td>

                        <td className={styles.td} style={tdStyle("mp_desc")}>
                          {item.desc_tecnica_mp ?? "-"}
                        </td>

                        <td className={`${styles.td} ${styles.tdCenter}`} style={tdStyle("mp_qtde")}>
                          {item.qtde_mp ?? "-"}
                        </td>

                        <td className={styles.td} style={tdStyle("operacao")}>
                          {item.descricao_operacao ?? "-"}
                        </td>

                        <td className={styles.td} style={tdStyle("maquina")}>
                          {item.descricao_maquina ?? "-"}
                        </td>

                        <td className={`${styles.td} ${styles.tdCenter}`} style={tdStyle("dxf")}>
                          {item.existe === true ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirVisualizacaoDxf(item);
                              }}
                              className={`${styles.statusPill} ${styles.statusFound} ${styles.statusPillClickable}`}
                              title={
                                item.caminhosDxf.length > 1
                                  ? `Encontrado em ${item.caminhosDxf.length} locais:\n${item.caminhosDxf.join("\n")}\n\nClique para conferir o DXF C/ Desenho.`
                                  : `${item.caminhosDxf[0] ?? ""}\n\nClique para conferir o DXF C/ Desenho.`
                              }
                            >
                              Encontrado <span aria-hidden="true">👁</span>
                            </button>
                          ) : (
                            <span
                              className={`${styles.statusPill} ${item.existe === null
                                ? styles.statusPending
                                : styles.statusMissing
                                }`}
                              title={
                                item.existe === null
                                  ? undefined
                                  : "Nenhum arquivo DXF encontrado para este código, em nenhuma subpasta."
                              }
                            >
                              {item.existe === null
                                ? "Validando..."
                                : "Não encontrado"}
                            </span>
                          )}
                        </td>

                        <td
                          className={`${styles.td} ${styles.tdCenter}`}
                          style={tdStyle("acoes")}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removerLinha(item._index);
                            }}
                            className={styles.deleteRowButton}
                            title="Remover este item"
                            disabled={removing}
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {totalRows === 0 && (
                    <tr>
                      <td className={styles.emptyRow} colSpan={13}>
                        Nenhum item encontrado para o filtro atual.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            onClick={onClose}
            className={styles.secondaryButton}
            disabled={isSubmitting}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className={styles.primaryButton}
            disabled={totalRestantes === 0 || isSubmitting}
          >
            {isSubmitting
              ? "Adicionando..."
              : totalRestantes === 1
                ? "Adicionar 1 item ao grid"
                : `Adicionar ${totalRestantes} itens ao grid`}
          </button>
        </div>

        {contextMenu.visible && (
          <div
            className={styles.contextMenu}
            style={{
              position: "fixed",
              top: contextMenu.y,
              left: contextMenu.x,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.contextMenuItem}
              onClick={visualizarDesenhoMenuContexto}
              disabled={
                contextMenu.rowIndex === null ||
                itensComStatus[contextMenu.rowIndex]?.existe !== true
              }
            >
              Conferir o DXF C/ Desenho
            </button>

            <div className={styles.contextMenuSeparator} />

            <button
              type="button"
              className={styles.contextMenuItem}
              onClick={excluirLinhaMenuContexto}
            >
              Excluir linha
            </button>
          </div>
        )}
      </div>

      <DesenhoViewerModal
        open={desenhoVisualizacao.open}
        caminhoDxf={desenhoVisualizacao.caminhoDxf}
        arquivoDxf={desenhoVisualizacao.arquivoDxf}
        codigo={desenhoVisualizacao.codigo}
        codDesenho={desenhoVisualizacao.codDesenho}
        onClose={() =>
          setDesenhoVisualizacao((prev) => ({ ...prev, open: false }))
        }
      />
    </div>
  );
}