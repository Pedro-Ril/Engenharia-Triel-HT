"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HotTable, HotColumn } from "@handsontable/react-wrapper";
import type { HotTableRef } from "@handsontable/react-wrapper";
import Handsontable from "handsontable";
import { registerAllModules } from "handsontable/registry";
import { registerLanguageDictionary, ptBR } from "handsontable/i18n";
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";
import type { TabelaProcessamentoRow } from "@/modules/integra-lantek-agro/types/processamentoOrdens.types";
import { formatarEspessura } from "@/modules/integra-lantek-agro/utils/espessura";
import DesenhoViewerModal from "@/modules/integra-lantek-agro/components/DesenhoViewerModal";
import styles from "@/modules/integra-lantek-shared/components/ExcelGrid.module.css";

registerAllModules();
registerLanguageDictionary(ptBR);

type Props = {
  rows: TabelaProcessamentoRow[];
  setRows: React.Dispatch<React.SetStateAction<TabelaProcessamentoRow[]>>;
  onVisibleRowsChange?: (rows: TabelaProcessamentoRow[]) => void;
};

type CampoEditavel = "material" | "maquina" | "espessura";

type FiltroSalvo = {
  column: number;
  conditions: Array<{
    name: string;
    args: unknown[];
  }>;
  operation: "conjunction" | "disjunction";
};

interface FiltersCondition {
  name: string;
  args: unknown[];
}

interface FiltersPlugin {
  getConditions?: (col: number) => FiltersCondition[] | undefined;
  getOperation?: (col: number) => "conjunction" | "disjunction" | undefined;
  clearConditions?: (col: number) => void;
  addCondition?: (
    col: number,
    name: string,
    args: unknown[],
    operation: "conjunction" | "disjunction"
  ) => void;
  filter?: () => void;
}

const CAMPOS_EDITAVEIS = new Set<string>(["material", "maquina", "espessura"]);

const OPCOES_MATERIAL = [
  "",
  "AÇO CARBONO",
  "AÇO CARBONO XADREZ",
  "AÇO GALVANIZADO",
  "ALUMINIO",
  "ALUMINIO XADREZ",
  "INOX",
  "ALUMINIO XADREZ DIAMOND",
];

const OPCOES_MAQUINA = ["CALFRAN Laser 6Kw", "Baw - XPR 300 - EDGE Connect"];

function isCampoEditavel(field: string): field is CampoEditavel {
  return CAMPOS_EDITAVEIS.has(field);
}

function salvarFiltros(hot: Handsontable): FiltroSalvo[] {
  const plugin = hot.getPlugin("filters") as unknown as FiltersPlugin;
  if (!plugin) return [];

  const totalCols = hot.countCols();
  const filtros: FiltroSalvo[] = [];

  for (let col = 0; col < totalCols; col += 1) {
    const conditions = plugin.getConditions?.(col);

    if (conditions && conditions.length > 0) {
      filtros.push({
        column: col,
        conditions: conditions.map((cond) => ({
          name: cond.name,
          args: Array.isArray(cond.args) ? [...cond.args] : [],
        })),
        operation: plugin.getOperation?.(col) ?? "conjunction",
      });
    }
  }

  return filtros;
}

function restaurarFiltros(hot: Handsontable, filtros: FiltroSalvo[]) {
  const plugin = hot.getPlugin("filters") as unknown as FiltersPlugin;
  if (!plugin) return;

  const totalCols = hot.countCols();

  for (let col = 0; col < totalCols; col += 1) {
    plugin.clearConditions?.(col);
  }

  for (const filtro of filtros) {
    for (const cond of filtro.conditions) {
      plugin.addCondition?.(
        filtro.column,
        cond.name,
        cond.args,
        filtro.operation
      );
    }
  }

  plugin.filter?.();
}

function ExcelGridComponent({ rows, setRows, onVisibleRowsChange }: Props) {
  const hotRef = useRef<HotTableRef>(null);
  const ultimaAssinaturaVisivelRef = useRef<string>("");
  const filtrosPendentesRef = useRef<FiltroSalvo[] | null>(null);
  const dataRef = useRef<TabelaProcessamentoRow[]>(rows);

  const [desenhoVisualizacao, setDesenhoVisualizacao] = useState<{
    open: boolean;
    caminhoDxf: string;
    arquivoDxf: string;
    codigo: string;
    codDesenho: string;
  }>({ open: false, caminhoDxf: "", arquivoDxf: "", codigo: "", codDesenho: "" });

  const abrirVisualizacaoDxf = useCallback((linha: TabelaProcessamentoRow) => {
    if (!linha.dxfCaminho) return;

    setDesenhoVisualizacao({
      open: true,
      caminhoDxf: linha.dxfCaminho,
      arquivoDxf: linha.dxfCaminho.split("\\").pop() ?? linha.codItem,
      codigo: linha.codItem,
      codDesenho: linha.codDesenho,
    });
  }, []);

  const fields = useMemo(
    () => [
      "numLote",
      "numOrdem",
      "codItem",
      "codDesenho",
      "descTecnica",
      "qtde",
      "codItemMp",
      "descTecnicaMp",
      "qtdeMp",
      "codUnidMp",
      "material",
      "espessura",
      "maquina",
      "operacao",
    ],
    []
  );

  const colEspessuraIndex = useMemo(
    () => fields.indexOf("espessura"),
    [fields]
  );

  useEffect(() => {
    dataRef.current = rows;
  }, [rows]);

  const atualizarLinhasVisiveis = useCallback(() => {
    if (!onVisibleRowsChange || !hotRef.current?.hotInstance) return;

    const hot = hotRef.current.hotInstance;
    const sourceRows = hot.getSourceData() as TabelaProcessamentoRow[];
    const totalLinhasVisuais = hot.countRows();
    const visiveis: TabelaProcessamentoRow[] = [];

    for (let visualRow = 0; visualRow < totalLinhasVisuais; visualRow += 1) {
      const physicalRow = hot.toPhysicalRow(visualRow);

      if (
        physicalRow === null ||
        physicalRow === undefined ||
        physicalRow < 0 ||
        physicalRow >= sourceRows.length
      ) {
        continue;
      }

      const linha = sourceRows[physicalRow];
      if (linha) visiveis.push(linha);
    }

    const assinatura = visiveis
      .map((r) => `${r.id}:${r.material}:${r.espessura}:${r.maquina}`)
      .join("|");

    if (assinatura !== ultimaAssinaturaVisivelRef.current) {
      ultimaAssinaturaVisivelRef.current = assinatura;
      onVisibleRowsChange(visiveis);
    }
  }, [onVisibleRowsChange]);

  useEffect(() => {
    const hot = hotRef.current?.hotInstance;
    if (!hot) return;

    if (filtrosPendentesRef.current) {
      queueMicrotask(() => {
        const hotAtual = hotRef.current?.hotInstance;
        const filtros = filtrosPendentesRef.current;
        if (!hotAtual || !filtros) return;

        restaurarFiltros(hotAtual, filtros);
        filtrosPendentesRef.current = null;
        atualizarLinhasVisiveis();
      });

      return;
    }

    atualizarLinhasVisiveis();
  }, [rows, atualizarLinhasVisiveis]);

  const handleAfterChange = useCallback(
    (changes: Handsontable.CellChange[] | null, source: string) => {
      if (!changes) return;
      if (
        source === "loadData" ||
        source === "internal" ||
        source === "populateFromArray"
      ) {
        return;
      }

      const hot = hotRef.current?.hotInstance;
      if (!hot) return;

      type AlteracaoResolvida = {
        physicalRow: number;
        field: CampoEditavel;
        newValue: unknown;
        visualRow: number;
      };

      const alteracoesResolvidas: AlteracaoResolvida[] = [];

      for (const [visualRow, field, oldValue, newValue] of changes) {
        if (oldValue === newValue) continue;
        if (typeof field !== "string") continue;
        if (!isCampoEditavel(field)) continue;

        const physicalRow = hot.toPhysicalRow(Number(visualRow));
        if (
          physicalRow === null ||
          physicalRow === undefined ||
          physicalRow < 0
        ) {
          continue;
        }

        alteracoesResolvidas.push({
          physicalRow,
          field,
          newValue,
          visualRow: Number(visualRow),
        });
      }

      if (!alteracoesResolvidas.length) return;

      const displayCorrections: Array<[number, number, string]> = [];

      setRows((prevRows) => {
        const updated = [...prevRows];
        let houveAlteracao = false;

        for (const {
          physicalRow,
          field,
          newValue,
          visualRow,
        } of alteracoesResolvidas) {
          if (physicalRow >= updated.length) continue;

          const linhaOriginal = updated[physicalRow];
          if (!linhaOriginal) continue;

          if (field === "espessura") {
            const valorFormatado = formatarEspessura(newValue);

            if (linhaOriginal.espessura !== valorFormatado) {
              updated[physicalRow] = {
                ...linhaOriginal,
                espessura: valorFormatado,
              };
              houveAlteracao = true;
              displayCorrections.push([
                visualRow,
                colEspessuraIndex,
                valorFormatado,
              ]);
            }
            continue;
          }

          const valor = String(newValue ?? "");
          if (linhaOriginal[field] !== valor) {
            updated[physicalRow] = {
              ...linhaOriginal,
              [field]: valor,
            };
            houveAlteracao = true;
          }
        }

        if (houveAlteracao) {
          dataRef.current = updated;
          return updated;
        }

        return prevRows;
      });

      if (displayCorrections.length > 0) {
        queueMicrotask(() => {
          const hotAtual = hotRef.current?.hotInstance;
          if (!hotAtual) return;

          for (const [vRow, col, valor] of displayCorrections) {
            hotAtual.setDataAtCell(vRow, col, valor, "internal");
          }
        });
      }
    },
    [setRows, colEspessuraIndex]
  );

  const handleBeforeRemoveRow = useCallback(
    (
      index: number,
      amount: number,
      physicalRows: number[],
      source?: string
    ): false | void => {
      if (!amount || source === "loadData") return;

      const hot = hotRef.current?.hotInstance;
      if (!hot) return false;

      const filtrosAtivos = salvarFiltros(hot);

      const indicesParaRemover =
        physicalRows && physicalRows.length
          ? [...physicalRows]
          : Array.from({ length: amount }, (_, i) => {
              const physical = hot.toPhysicalRow(index + i);
              return physical ?? index + i;
            });

      if (!indicesParaRemover.length) return false;

      const indicesOrdenados = [...indicesParaRemover].sort((a, b) => b - a);
      filtrosPendentesRef.current = filtrosAtivos;

      setRows((prevRows) => {
        const updated = [...prevRows];

        for (const idx of indicesOrdenados) {
          if (idx >= 0 && idx < updated.length) {
            updated.splice(idx, 1);
          }
        }

        dataRef.current = updated;
        return updated;
      });

      return false;
    },
    [setRows]
  );

  const cells = useCallback(
    (row: number, col: number): Handsontable.CellProperties => {
      const field = fields[col] ?? "";
      const cellProperties = {} as Handsontable.CellProperties;

      if (!CAMPOS_EDITAVEIS.has(field)) {
        cellProperties.readOnly = true;
      }

      if (col === colEspessuraIndex) {
        cellProperties.placeholder = "0,00";
      }

      if (field === "codItem" || field === "codDesenho") {
        const hot = hotRef.current?.hotInstance;
        const physicalRow = hot ? hot.toPhysicalRow(row) : row;

        const linha =
          hot && physicalRow !== null && physicalRow !== undefined
            ? (hot.getSourceData() as TabelaProcessamentoRow[])[physicalRow]
            : undefined;

        if (linha?.dxfExiste === true) {
          cellProperties.className = "dxfCellFound";
        } else if (linha?.dxfExiste === false) {
          cellProperties.className = "dxfCellMissing";
        }
      }

      return cellProperties;
    },
    [fields, colEspessuraIndex]
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.hot}>
        <HotTable
          ref={hotRef}
          data={dataRef.current}
          rowHeaders={true}
          colHeaders={true}
          width="100%"
          height={820}
          stretchH="all"
          autoWrapRow={true}
          autoWrapCol={true}
          licenseKey="non-commercial-and-evaluation"
          language={ptBR.languageCode}
          manualColumnResize={true}
          manualRowResize={true}
          filters={true}
          dropdownMenu={true}
          hiddenColumns={{ indicators: true }}
          contextMenu={{
            items: {
              visualizar_dxf: {
                name: "Conferir o DXF C/ Desenho",
                callback(_key, selection) {
                  const hot = this as unknown as Handsontable;
                  const visualRow = selection?.[0]?.start?.row;
                  if (visualRow === null || visualRow === undefined) return;

                  const physicalRow = hot.toPhysicalRow(visualRow);
                  const sourceRows =
                    hot.getSourceData() as TabelaProcessamentoRow[];
                  const linha =
                    sourceRows[physicalRow ?? visualRow];

                  if (linha) abrirVisualizacaoDxf(linha);
                },
                disabled() {
                  const hot = this as unknown as Handsontable;
                  const visualRow = hot.getSelectedLast()?.[0];
                  if (visualRow === null || visualRow === undefined) {
                    return true;
                  }

                  const physicalRow = hot.toPhysicalRow(visualRow);
                  const sourceRows =
                    hot.getSourceData() as TabelaProcessamentoRow[];
                  const linha =
                    sourceRows[physicalRow ?? visualRow];

                  return !linha?.dxfCaminho;
                },
              },
              separator0: { name: "---------" },
              row_above: {},
              row_below: {},
              remove_row: {},
              separator1: { name: "---------" },
              col_left: {},
              col_right: {},
              remove_col: {},
              clear_column: {},
              separator2: { name: "---------" },
              read_only: {
                hidden() {
                  const hot = this as unknown as Handsontable;
                  const col = hot.getSelectedLast()?.[1];
                  if (col === null || col === undefined) return true;

                  const field = fields[col];
                  return !CAMPOS_EDITAVEIS.has(String(field));
                },
              },
              separator3: { name: "---------" },
              alignment: {},
              separator4: { name: "---------" },
              copy: {},
              cut: {},
            },
          }}
          columnSorting={true}
          fixedColumnsStart={4}
          cells={cells}
          afterChange={handleAfterChange}
          afterFilter={atualizarLinhasVisiveis}
          afterColumnSort={atualizarLinhasVisiveis}
          afterRowMove={atualizarLinhasVisiveis}
          beforeRemoveRow={handleBeforeRemoveRow}
          afterCreateRow={atualizarLinhasVisiveis}
          afterLoadData={atualizarLinhasVisiveis}
        >
          <HotColumn title="Lote" data="numLote" readOnly width={90} />
          <HotColumn title="Ordem" data="numOrdem" readOnly width={110} />
          <HotColumn title="Cód. Item" data="codItem" readOnly width={120} />
          <HotColumn
            title="Cód. Desenho"
            data="codDesenho"
            readOnly
            width={130}
          />
          <HotColumn
            title="Descrição Técnica"
            data="descTecnica"
            readOnly
            width={320}
          />
          <HotColumn
            title="Qtde"
            data="qtde"
            readOnly
            type="numeric"
            width={90}
          />
          <HotColumn
            title="Cód. Item MP"
            data="codItemMp"
            readOnly
            width={120}
          />
          <HotColumn
            title="Descrição Técnica MP"
            data="descTecnicaMp"
            readOnly
            width={380}
          />
          <HotColumn
            title="Qtde MP"
            data="qtdeMp"
            readOnly
            type="numeric"
            width={95}
          />
          <HotColumn title="UM" data="codUnidMp" readOnly width={80} />
          <HotColumn
            title="Material"
            data="material"
            type="dropdown"
            source={OPCOES_MATERIAL}
            strict={false}
            allowInvalid={false}
            width={260}
          />
          <HotColumn title="Espessura" data="espessura" width={130} />
          <HotColumn
            title="Máquina"
            data="maquina"
            type="dropdown"
            source={OPCOES_MAQUINA}
            strict={false}
            allowInvalid={false}
            width={220}
          />
          <HotColumn title="Operação" data="operacao" readOnly width={200} />
        </HotTable>
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

const ExcelGrid = memo(ExcelGridComponent);
export default ExcelGrid;