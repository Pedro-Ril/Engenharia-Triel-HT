"use client";

import { useCallback, useMemo, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import ExcelGrid from "@/modules/integra-lantek-agro/components/ExcelGrid";
import ValidationModal from "@/modules/integra-lantek-agro/components/ValidationModal";
import FeedbackModal from "@/modules/integra-lantek-agro/components/FeedbackModal";
import InfoPesquisaModal from "@/modules/integra-lantek-agro/components/InfoPesquisaModal";
import {
  buscarOrdens,
  exportarPlanilha,
  validarDxf,
} from "@/modules/integra-lantek-agro/services/processamentoOrdens.service";
import type {
  ApiIntegracaoItem,
  DxfValidacaoResultado,
  TabelaProcessamentoRow,
  TipoBusca,
} from "@/modules/integra-lantek-agro/types/processamentoOrdens.types";
import styles from "@/modules/integra-lantek-shared/ProcessamentoOrdensPage.module.css";
import { generateId } from "@/modules/integra-lantek-agro/utils/generateId";
import {
  extrairEspessuraDaDescricaoMp,
  inferirMaterialDaDescricaoMp,
} from "@/modules/integra-lantek-agro/utils/espessura";

type ResumoOrdensAgrupado = {
  material: string;
  espessura: string;
  ordens: string[];
};

export type DxfInfo = {
  existe: boolean;
  duplicado: boolean;
  caminho: string;
  caminhos: string[];
};

function montarDxfMap(
  resultados: DxfValidacaoResultado[]
): Record<string, DxfInfo> {
  const mapa: Record<string, DxfInfo> = {};

  resultados.forEach((resultado) => {
    mapa[String(resultado.codigo).trim()] = {
      existe: resultado.existe,
      duplicado: resultado.duplicado,
      caminho: resultado.caminho,
      caminhos: resultado.caminhos,
    };
  });

  return mapa;
}

function mapApiItemToRow(
  item: ApiIntegracaoItem,
  index: number
): TabelaProcessamentoRow {
  return {
    id: `${item.num_ordem ?? "sem-ordem"}-${item.cod_item_mp ?? "sem-mp"
      }-${index}-${generateId()}`,

    numLote: item.num_lote_pro?.toString() ?? "",
    numOrdem: item.num_ordem?.toString() ?? "",

    codItem: item.cod_item ?? "",
    codDesenho: item.cod_desenho ?? "",
    descTecnica: item.desc_tecnica ?? "",
    qtde: item.qtde ?? "",

    codItemMp: item.cod_item_mp ?? "",
    descTecnicaMp: item.desc_tecnica_mp ?? "",
    qtdeMp: item.qtde_mp ?? "",
    codUnidMp: item.cod_unid_med_mp ?? "",

    material: inferirMaterialDaDescricaoMp(item.desc_tecnica_mp),
    espessura: extrairEspessuraDaDescricaoMp(item.desc_tecnica_mp),

    operacao: item.descricao_operacao ?? "",
    maquina: item.descricao_maquina ?? "",

    cliente: item.descricao_cli ?? "",
    pdv: item.num_pedido?.toString() ?? "",

    dxfExiste: null,
    dxfCaminho: "",
    dxfDuplicado: false,
    dxfCaminhos: [],
  };
}

function parseValoresBusca(valor: string): string[] {
  return [
    ...new Set(
      valor
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

function gerarResumoOrdens(
  rows: TabelaProcessamentoRow[]
): ResumoOrdensAgrupado[] {
  const mapa = new Map<string, ResumoOrdensAgrupado>();

  rows.forEach((row) => {
    const material = String(row.material ?? "").trim() || "SEM MATERIAL";
    const espessura = String(row.espessura ?? "").trim() || "SEM ESPESSURA";
    const ordem = String(row.numOrdem ?? "").trim();

    if (!ordem) return;

    const chave = `${material}||${espessura}`;

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        material,
        espessura,
        ordens: [],
      });
    }

    const grupo = mapa.get(chave);

    if (grupo && !grupo.ordens.includes(ordem)) {
      grupo.ordens.push(ordem);
    }
  });

  return Array.from(mapa.values())
    .map((grupo) => ({
      ...grupo,
      ordens: grupo.ordens.sort((a, b) =>
        a.localeCompare(b, "pt-BR", { numeric: true })
      ),
    }))
    .sort((a, b) => {
      const materialCompare = a.material.localeCompare(b.material, "pt-BR");
      if (materialCompare !== 0) return materialCompare;

      return a.espessura.localeCompare(b.espessura, "pt-BR", {
        numeric: true,
      });
    });
}

export default function ProcessamentoOrdensPage() {
  const [tipoBusca, setTipoBusca] = useState<TipoBusca>("ordem");
  const [valorBusca, setValorBusca] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [resultadoApi, setResultadoApi] = useState<ApiIntegracaoItem[]>([]);
  const [rows, setRows] = useState<TabelaProcessamentoRow[]>([]);
  const [dxfMap, setDxfMap] = useState<Record<string, DxfInfo>>({});
  const [visibleRows, setVisibleRows] = useState<TabelaProcessamentoRow[]>([]);

  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackModalTitle, setFeedbackModalTitle] = useState("");
  const [feedbackModalMessage, setFeedbackModalMessage] = useState("");
  const [feedbackResumoOrdens, setFeedbackResumoOrdens] = useState<
    ResumoOrdensAgrupado[]
  >([]);
  const [infoModalOpen, setInfoModalOpen] = useState(false);

  const totalItensVisiveis = useMemo(() => visibleRows.length, [visibleRows]);
  const totalItensGerais = useMemo(() => rows.length, [rows]);

  const totalQtdeItens = useMemo(() => {
    return visibleRows.reduce((acc, row) => {
      const valor = Number(row.qtde || 0);
      return acc + (Number.isNaN(valor) ? 0 : valor);
    }, 0);
  }, [visibleRows]);

  const totalQtdeMp = useMemo(() => {
    return visibleRows.reduce((acc, row) => {
      const valor = Number(row.qtdeMp || 0);
      return acc + (Number.isNaN(valor) ? 0 : valor);
    }, 0);
  }, [visibleRows]);

  const unidadeMp = useMemo(() => {
    const unidades = [
      ...new Set(
        visibleRows
          .map((row) => String(row.codUnidMp ?? "").trim())
          .filter(Boolean)
      ),
    ];

    if (!unidades.length) return "";
    if (unidades.length === 1) return unidades[0];

    return unidades.join(" / ");
  }, [visibleRows]);

  const handleVisibleRowsChange = useCallback(
    (novasRows: TabelaProcessamentoRow[]) => {
      setVisibleRows((anteriores) => {
        if (
          anteriores.length === novasRows.length &&
          anteriores.every((item, index) => item.id === novasRows[index]?.id)
        ) {
          return anteriores;
        }

        return novasRows;
      });
    },
    []
  );

  async function handleBuscar() {
    const valor = valorBusca.trim();

    if (!valor) {
      setErro("Informe uma ordem ou lote para realizar a busca.");
      return;
    }

    const valoresBusca = parseValoresBusca(valor);

    if (!valoresBusca.length) {
      setErro("Informe uma ordem ou lote válido para realizar a busca.");
      return;
    }

    try {
      setLoading(true);
      setErro("");
      setResultadoApi([]);
      setDxfMap({});

      const respostas = await Promise.all(
        valoresBusca.map(async (valorIndividual) => {
          const data = await buscarOrdens(tipoBusca, valorIndividual);
          const items = Array.isArray(data?.value) ? data.value : [];

          return {
            valor: valorIndividual,
            items,
          };
        })
      );

      const items = respostas.flatMap((resposta) => resposta.items);

      if (!items.length) {
        setErro("Nenhum registro foi encontrado para a consulta informada.");
        return;
      }

      const itensParaValidar = items
        .map((item: ApiIntegracaoItem) => ({
          codigo: String(item.cod_item ?? "").trim(),
          codDesenho: String(item.cod_desenho ?? "").trim(),
        }))
        .filter((item) => item.codigo || item.codDesenho);

      const validacao = await validarDxf(itensParaValidar);

      setDxfMap(montarDxfMap(validacao.resultados));
      setResultadoApi(items);
      setModalOpen(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado ao buscar dados.";
      setErro(message);
    } finally {
      setLoading(false);
    }
  }

  function handleLimpar() {
    setTipoBusca("ordem");
    setValorBusca("");
    setErro("");
    setResultadoApi([]);
    setDxfMap({});
    setRows([]);
    setVisibleRows([]);
    setFeedbackResumoOrdens([]);
  }

  async function handleConfirmarModal(items: ApiIntegracaoItem[]) {
    try {
      setErro("");

      const novasLinhas = items.map(mapApiItemToRow);
      const itensParaValidar = novasLinhas
        .map((row) => ({
          codigo: String(row.codItem ?? "").trim(),
          codDesenho: String(row.codDesenho ?? "").trim(),
        }))
        .filter((item) => item.codigo || item.codDesenho);

      const validacao = await validarDxf(itensParaValidar);
      const mapaDxf = montarDxfMap(validacao.resultados);

      const linhasComDxf = novasLinhas.map((row) => {
        const info = mapaDxf[String(row.codItem).trim()];

        return {
          ...row,
          dxfExiste: info?.existe ?? false,
          dxfCaminho: info?.caminho ?? "",
          dxfDuplicado: info?.duplicado ?? false,
          dxfCaminhos: info?.caminhos ?? [],
        };
      });

      setRows((prev) => [...prev, ...linhasComDxf]);
      setModalOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao validar os DXFs.";
      setErro(message);
    }
  }

  function handleRemoverUltimaLinha() {
    setRows((prev) => prev.slice(0, -1));
  }

  async function handleExportar() {
    try {
      setErro("");

      if (!rows.length) {
        setErro("Não há registros para exportar.");
        return;
      }

      const resultado = await exportarPlanilha(rows);
      const resumo = gerarResumoOrdens(rows);

      setFeedbackResumoOrdens(resumo);
      setFeedbackModalTitle("Exportação concluída");
      setFeedbackModalMessage(
        `${resultado?.message ?? "Arquivo exportado com sucesso."}\n\n` +
        `Arquivo: ${resultado?.fileName ?? "Lantek.xls"}\n` +
        `Destino: ${resultado?.path ?? ""}\n` +
        `Registros exportados: ${resultado?.totalRegistros ?? rows.length}`
      );
      setFeedbackModalOpen(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado ao exportar.";
      setErro(message);
    }
  }

  function formatarNumero4Casas(valor: number | string) {
    const numero = Number(valor ?? 0);

    if (Number.isNaN(numero)) return "0,0000";

    return numero.toLocaleString("pt-BR", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }

  return (
    <main className={styles.page}>
      <section className={styles.heroHeader}>
        <div className={styles.heroHeaderContent}>
          <span className={styles.badge}>Módulo PCP</span>
          <h1 className={styles.title}>Integração FoccoERP x Lantek via XLS</h1>
          <p className={styles.subtitle}>
            Consulta por ordem ou lote, validação dos dados e montagem da
            planilha para exportação.
          </p>
        </div>
      </section>

      <section className={styles.sectionBlock}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionMiniTitle}>Consulta inicial</span>
              <h2 className={styles.sectionTitle}>Buscar dados da integração</h2>
              <p className={styles.sectionText}>
                Informe uma ou mais ordens ou lotes para buscar os dados na API.
              </p>
            </div>

            <button
              type="button"
              className={styles.infoBadge}
              onClick={() => setInfoModalOpen(true)}
              title="Clique aqui para visualizar algumas regras de integração"
            >
              Integração ativa
            </button>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Tipo de busca</label>
              <Dropdown
                value={tipoBusca}
                options={[
                  { value: "ordem", label: "Ordem" },
                  { value: "lote", label: "Lote" },
                ]}
                onValueChange={(valor) => setTipoBusca(valor as TipoBusca)}
              />
            </div>

            <div className={styles.fieldWide}>
              <label className={styles.label}>Ordem ou lote</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Ex.: 12345, 12346, 12347"
                value={valorBusca}
                onChange={(e) => setValorBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleBuscar();
                  }
                }}
              />
            </div>

            <button
              className={`${styles.button} ${styles.primaryButton}`}
              onClick={handleBuscar}
              disabled={loading}
            >
              {loading ? "Buscando..." : "Buscar"}
            </button>

            <button
              className={`${styles.button} ${styles.secondaryButton}`}
              onClick={handleLimpar}
              disabled={loading}
            >
              Limpar
            </button>
          </div>

          {erro ? <div className={styles.errorMessage}>{erro}</div> : null}
        </div>
      </section>

      <section className={styles.sectionBlock}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionMiniTitle}>
                Planilha de processamento
              </span>
              <h2 className={styles.sectionTitle}>Dados para exportação</h2>
              <p className={styles.sectionText}>
                Edite diretamente como planilha. Os campos de material,
                espessura e máquina aceitam edição e replicação.
              </p>
            </div>

            <div className={styles.statusPill}>
              {totalItensVisiveis} visível(is) / {totalItensGerais} total
            </div>
          </div>

          {!rows.length ? (
            <div className={styles.emptyState}>
              Nenhum registro carregado ainda.
            </div>
          ) : (
            <div className={styles.gridWrapper}>
              <ExcelGrid
                rows={rows}
                setRows={setRows}
                onVisibleRowsChange={handleVisibleRowsChange}
              />
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>
                    Quantidade de Itens
                  </span>
                  <strong className={styles.summaryValue}>
                    {totalQtdeItens}
                  </strong>
                </div>

                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Quantidade MP</span>
                  <strong className={styles.summaryValue}>
                    {formatarNumero4Casas(totalQtdeMp)} {unidadeMp}
                  </strong>
                </div>
              </div>

              <div className={styles.actionRow}>
                <button
                  className={`${styles.button} ${styles.secondaryButton}`}
                  onClick={handleRemoverUltimaLinha}
                >
                  Remover última linha
                </button>

                <button
                  className={`${styles.button} ${styles.successButton}`}
                  onClick={handleExportar}
                >
                  Exportar XLS
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <ValidationModal
        open={modalOpen}
        items={resultadoApi}
        dxfMap={dxfMap}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirmarModal}
      />

      <FeedbackModal
        open={feedbackModalOpen}
        title={feedbackModalTitle}
        message={feedbackModalMessage}
        resumoOrdensAgrupado={feedbackResumoOrdens}
        onClose={() => setFeedbackModalOpen(false)}
      />

      <InfoPesquisaModal
        open={infoModalOpen}
        onClose={() => setInfoModalOpen(false)}
      />
    </main>
  );
}