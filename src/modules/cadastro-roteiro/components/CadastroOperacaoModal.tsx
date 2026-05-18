"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/cadastro-roteiro/cadastro-roteiro.module.css";
import {
    RoteiroItem,
    RoteiroTreeNode,
} from "../types/cadastroRoteiro.types";

type SelectOption = {
    codigo: string;
    descricao: string;
};

type OperacaoOption = {
    COD_EMP: number;
    ID_OPERACAO: number;
    COD_OPERACAO: number;
    DESC_OPERACAO: string;
    ORIGEM: string;
    ID_CENTRO_TRAB: number;
    COD_CENTRO_TRAB: string;
    DESC_CENTRO_TRAB: string;
};

type Props = {
    open: boolean;
    item: RoteiroTreeNode | null;
    roteiroEdicao?: RoteiroItem | null;
    onClose: () => void;
    onRoteiroSalvo?: (codItem: string) => Promise<void>;
};

type OperacaoAdicionada = {
    seq: string;
    situacao: string;
    operacao: string;
    roteiroPadrao: string;
    centroTrabalho: string;
    dataInicio: string;
    dataFim: string;
    apontamento: string;
    obrigatorio: string;
    unidadeMedida: string;
    umApontamento: string;
    lote: string;
    tempo: string;
    percentualRecuperacao: string;
    qtdeHomens: string;
    folgaMinima: string;
    numeroDias: string;
    tempoPreparacao: string;
    numeroDiasExecucao: string;
    observacao: string;
};

type Toast = {
    id: number;
    mensagem: string;
    tipo: "sucesso" | "erro";
    retornoErp?: any;
};

const API_OPERACOES =
    "http://proserver.trielht.com.br:1000/api/operacoes?cod_emp=2";

const API_CENTRO_TRABALHO =
    "http://proserver.trielht.com.br:1000/api/centro_trabalho?cod_emp=2";

const API_UNIDADE_MEDIDA =
    "http://proserver.trielht.com.br:1000/api/unidade_medida";

const API_IMPORTAR_ROTEIRO =
    "http://proserver.trielht.com.br:1000/api/roteiro/importar";

const situacaoOptions: SelectOption[] = [
    { codigo: "Aprovada", descricao: "Aprovada" },
    { codigo: "Em elaboração", descricao: "Em elaboração" },
    { codigo: "Inativa", descricao: "Inativa" },
];

const simNaoOptions: SelectOption[] = [
    { codigo: "Sim", descricao: "Sim" },
    { codigo: "Não", descricao: "Não" },
];

const roteirosOptions: SelectOption[] = [
    { codigo: "Padrão", descricao: "Padrão" },
    { codigo: "Alternativo 1", descricao: "Alternativo 1" },
    { codigo: "Alternativo 2", descricao: "Alternativo 2" },
    { codigo: "Alternativo 3", descricao: "Alternativo 3" },
    { codigo: "Alternativo 4", descricao: "Alternativo 4" },
    { codigo: "Alternativo 5", descricao: "Alternativo 5" },
    { codigo: "Alternativo 6", descricao: "Alternativo 6" },
    { codigo: "Alternativo 7", descricao: "Alternativo 7" },
    { codigo: "Alternativo 8", descricao: "Alternativo 8" },
    { codigo: "Alternativo 9", descricao: "Alternativo 9" },
    { codigo: "Alternativo 10", descricao: "Alternativo 10" },
];

function formatarOption(option: SelectOption) {
    if (!option.codigo && !option.descricao) return "";
    if (option.codigo === option.descricao) return option.descricao;
    return `${option.codigo} - ${option.descricao}`;
}

function extrairCodigo(valor: string) {
    return String(valor || "").split("-")[0].trim();
}

function simNaoParaFlag(valor: string) {
    return valor === "Sim" ? "1" : "0";
}

function alternativoParaNumero(valor?: string | null) {
    const texto = String(valor ?? "").trim().toUpperCase();

    if (!texto || texto.includes("PADRÃO") || texto.includes("PADRAO")) {
        return 0;
    }

    const match = texto.match(/ALTERNATIVO\s+(\d+)/);

    return match ? Number(match[1]) : 0;
}

function numeroParaRoteiro(alternativo?: string | number | null) {
    const texto = String(alternativo ?? "").trim();

    if (!texto || texto === "0" || texto.toUpperCase().includes("PADRÃO")) {
        return "Padrão";
    }

    const match = texto.toUpperCase().match(/ALTERNATIVO\s+(\d+)/);

    if (match) return `Alternativo ${match[1]}`;

    return texto
        .toLowerCase()
        .replace(/^alternativo (\d+)$/, "Alternativo $1")
        .replace(/^padrão$/, "Padrão");
}

function formatarDataInput(data?: string | null) {
    if (!data) return "";

    const texto = String(data).trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

    const match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

    if (match) {
        const [, dia, mes, ano] = match;
        return `${ano}-${mes}-${dia}`;
    }

    return texto;
}

function calcularProximaSequencia(
    item: RoteiroTreeNode | null,
    operacoesAdicionadas: OperacaoAdicionada[],
    roteiroAtual: string
) {
    const alternativoAtual = alternativoParaNumero(roteiroAtual);

    const sequenciasExistentes = (item?.roteiros ?? [])
        .filter(
            (r) =>
                alternativoParaNumero(r.ALTERNATIVO) === alternativoAtual
        )
        .map((r) => Number(r.SEQ || 0));

    const sequenciasAdicionadas = operacoesAdicionadas
        .filter(
            (r) =>
                alternativoParaNumero(r.roteiroPadrao) === alternativoAtual
        )
        .map((r) => Number(r.seq || 0));

    const todasSequencias = [
        ...sequenciasExistentes,
        ...sequenciasAdicionadas,
    ].filter((n) => Number.isFinite(n) && n > 0);

    if (todasSequencias.length === 0) return "10";

    return String(Math.max(...todasSequencias) + 10);
}

// =========================================
// TOAST
// =========================================
function ToastContainer({
    toasts,
    onRemove,
    onOpenRetorno,
}: {
    toasts: Toast[];
    onRemove: (id: number) => void;
    onOpenRetorno: (retorno: any) => void;
}) {
    return (
        <div
            style={{
                position: "fixed",
                top: "24px",
                right: "24px",
                zIndex: 99999,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                pointerEvents: "none",
            }}
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    onClick={() => {
                        if (toast.retornoErp) onOpenRetorno(toast.retornoErp);
                    }}
                    style={{
                        pointerEvents: "all",
                        cursor: toast.retornoErp ? "pointer" : "default",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        padding: "14px 16px",
                        borderRadius: "12px",
                        minWidth: "300px",
                        maxWidth: "460px",
                        fontSize: "14px",
                        fontWeight: 600,
                        boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
                        animation: "toastIn 0.25s ease",
                        ...(toast.tipo === "sucesso"
                            ? {
                                background: "#f0fdf4",
                                color: "#166534",
                                border: "1px solid #bbf7d0",
                            }
                            : {
                                background: "#fdecec",
                                color: "#b71c1c",
                                border: "1px solid #f5c8c8",
                            }),
                    }}
                    title={toast.retornoErp ? "Clique para ver o retorno completo do ERP" : ""}
                >
                    <span>
                        {toast.tipo === "sucesso" ? "✓" : "✕"}&nbsp;&nbsp;{toast.mensagem}
                        {toast.retornoErp && (
                            <small style={{ display: "block", marginTop: "4px", opacity: 0.75 }}>
                                Clique para ver o retorno completo do ERP
                            </small>
                        )}
                    </span>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove(toast.id);
                        }}
                        style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: "16px",
                            lineHeight: 1,
                            color: "inherit",
                            opacity: 0.6,
                            padding: 0,
                        }}
                    >
                        ×
                    </button>
                </div>
            ))}

            <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
}

function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const contadorRef = useRef(0);

    function exibirToast(
        mensagem: string,
        tipo: Toast["tipo"],
        retornoErp?: any,
        duracao = 7000
    ) {
        const id = ++contadorRef.current;
        setToasts((prev) => [...prev, { id, mensagem, tipo, retornoErp }]);
        setTimeout(() => removerToast(id), duracao);
    }

    function removerToast(id: number) {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }

    return { toasts, exibirToast, removerToast };
}

// =========================================
// SEARCH SELECT
// =========================================
function SearchSelect({
    label,
    required,
    value,
    options,
    placeholder,
    onChange,
}: {
    label: string;
    required?: boolean;
    value: string;
    options: SelectOption[];
    placeholder?: string;
    onChange: (value: string) => void;
}) {
    const [search, setSearch] = useState("");
    const [opened, setOpened] = useState(false);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    const filteredOptions = useMemo(() => {
        const termo = search.trim().toLowerCase();

        if (!termo) return options;

        return options.filter((option) =>
            `${option.codigo} ${option.descricao}`.toLowerCase().includes(termo)
        );
    }, [options, search]);

    useEffect(() => {
        if (!value) setSearch("");
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(event.target as Node)
            ) {
                setOpened(false);
                setSearch("");
            }
        }

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <div className={styles.formField} ref={wrapperRef}>
            <label className={styles.formLabel}>
                {label}
                {required && <span className={styles.required}>*</span>}
            </label>

            <input
                type="text"
                className={styles.formInput}
                placeholder={placeholder || "Pesquisar..."}
                value={search || value}
                onFocus={() => setOpened(true)}
                onClick={() => {
                    setSearch("");
                    setOpened(true);
                }}
                onChange={(e) => {
                    setSearch(e.target.value);
                    setOpened(true);
                    onChange(e.target.value);
                }}
            />

            {(opened || search) && filteredOptions.length > 0 && (
                <div className={styles.searchDropdown}>
                    {filteredOptions.map((option) => (
                        <button
                            key={option.codigo}
                            type="button"
                            className={styles.searchOption}
                            onClick={() => {
                                const selected = formatarOption(option);
                                onChange(selected);
                                setSearch("");
                                setOpened(false);
                            }}
                        >
                            <strong>{option.codigo}</strong>
                            <span>{option.descricao}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// =========================================
// OPERACAO SEARCH SELECT
// =========================================
function OperacaoSearchSelect({
    value,
    options,
    loading,
    onChange,
    onSelect,
}: {
    value: string;
    options: OperacaoOption[];
    loading: boolean;
    onChange: (value: string) => void;
    onSelect: (option: OperacaoOption) => void;
}) {
    const [search, setSearch] = useState("");
    const [opened, setOpened] = useState(false);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    const filteredOptions = useMemo(() => {
        const termo = search.trim().toLowerCase();

        if (!termo) return options.slice(0, 30);

        return options
            .filter((option) =>
                `${option.COD_OPERACAO} ${option.DESC_OPERACAO} ${option.COD_CENTRO_TRAB} ${option.DESC_CENTRO_TRAB}`
                    .toLowerCase()
                    .includes(termo)
            )
            .slice(0, 30);
    }, [options, search]);

    useEffect(() => {
        if (!value) setSearch("");
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(event.target as Node)
            ) {
                setOpened(false);
                setSearch("");
            }
        }

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <div className={styles.formField} ref={wrapperRef}>
            <label className={styles.formLabel}>
                Operação<span className={styles.required}>*</span>
            </label>

            <input
                type="text"
                className={styles.formInput}
                placeholder={
                    loading ? "Carregando operações..." : "Pesquisar operação..."
                }
                value={search || value}
                disabled={loading}
                onFocus={() => setOpened(true)}
                onClick={() => {
                    setSearch("");
                    setOpened(true);
                }}
                onChange={(e) => {
                    setSearch(e.target.value);
                    setOpened(true);
                    onChange(e.target.value);
                }}
            />

            {(opened || search) && filteredOptions.length > 0 && (
                <div className={styles.searchDropdown}>
                    {filteredOptions.map((option) => (
                        <button
                            key={option.ID_OPERACAO}
                            type="button"
                            className={styles.searchOption}
                            onClick={() => {
                                const selected = `${option.COD_OPERACAO} - ${option.DESC_OPERACAO}`;

                                onChange(selected);
                                onSelect(option);
                                setSearch("");
                                setOpened(false);
                            }}
                        >
                            <strong>
                                {option.COD_OPERACAO} - {option.DESC_OPERACAO}
                            </strong>
                            <span>
                                Centro: {option.COD_CENTRO_TRAB} - {option.DESC_CENTRO_TRAB}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// =========================================
// MODAL PRINCIPAL
// =========================================
export default function CadastroOperacaoModal({
    open,
    item,
    roteiroEdicao,
    onClose,
    onRoteiroSalvo,
}: Props) {
    const modoEdicao = !!roteiroEdicao;

    const [seq, setSeq] = useState("10");
    const [situacao, setSituacao] = useState("Aprovada");
    const [operacao, setOperacao] = useState("");
    const [roteiroPadrao, setRoteiroPadrao] = useState("Padrão");
    const [centroTrabalho, setCentroTrabalho] = useState("");
    const [dataInicio, setDataInicio] = useState("1900-01-01");
    const [dataFim, setDataFim] = useState("2999-12-31");

    const [apontamento, setApontamento] = useState("Não");
    const [obrigatorio, setObrigatorio] = useState("Não");
    const [unidadeMedida, setUnidadeMedida] = useState("");
    const [umApontamento, setUmApontamento] = useState("");
    const [lote, setLote] = useState("");
    const [tempo, setTempo] = useState("");
    const [percentualRecuperacao, setPercentualRecuperacao] = useState("");
    const [qtdeHomens, setQtdeHomens] = useState("");

    const [folgaMinima, setFolgaMinima] = useState("");
    const [numeroDias, setNumeroDias] = useState("");
    const [tempoPreparacao, setTempoPreparacao] = useState("");
    const [numeroDiasExecucao, setNumeroDiasExecucao] = useState("");
    const [observacao, setObservacao] = useState("");

    const [operacoes, setOperacoes] = useState<OperacaoOption[]>([]);
    const [loadingOperacoes, setLoadingOperacoes] = useState(false);

    const [centrosTrabalho, setCentrosTrabalho] = useState<SelectOption[]>([]);
    const [unidadesMedida, setUnidadesMedida] = useState<SelectOption[]>([]);

    const [loadingCentros, setLoadingCentros] = useState(false);
    const [loadingUnidades, setLoadingUnidades] = useState(false);

    const [erroValidacao, setErroValidacao] = useState("");
    const [operacoesAdicionadas, setOperacoesAdicionadas] = useState<
        OperacaoAdicionada[]
    >([]);

    const [salvando, setSalvando] = useState(false);
    const [retornoErpModal, setRetornoErpModal] = useState<any>(null);

    const { toasts, exibirToast, removerToast } = useToast();

    const seqInicial = useMemo(() => {
        return calcularProximaSequencia(item, [], "Padrão");
    }, [item]);

    useEffect(() => {
        if (!open) return;

        async function carregarDados() {
            try {
                setLoadingOperacoes(true);
                setLoadingCentros(true);
                setLoadingUnidades(true);

                const [responseOperacoes, responseCentros, responseUnidades] =
                    await Promise.all([
                        fetch(API_OPERACOES, {
                            method: "GET",
                            headers: { "Content-Type": "application/json" },
                            cache: "no-store",
                        }),
                        fetch(API_CENTRO_TRABALHO, {
                            method: "GET",
                            headers: { "Content-Type": "application/json" },
                            cache: "no-store",
                        }),
                        fetch(API_UNIDADE_MEDIDA, {
                            method: "GET",
                            headers: { "Content-Type": "application/json" },
                            cache: "no-store",
                        }),
                    ]);

                const jsonOperacoes = await responseOperacoes.json().catch(() => null);
                const jsonCentros = await responseCentros.json().catch(() => null);
                const jsonUnidades = await responseUnidades.json().catch(() => null);

                setOperacoes(
                    responseOperacoes.ok &&
                        jsonOperacoes?.success &&
                        Array.isArray(jsonOperacoes.data)
                        ? jsonOperacoes.data
                        : []
                );

                setCentrosTrabalho(
                    responseCentros.ok &&
                        jsonCentros?.success &&
                        Array.isArray(jsonCentros.data)
                        ? jsonCentros.data.map((centro: any) => ({
                            codigo: String(centro.COD_CENTRO_TRAB ?? "").trim(),
                            descricao: String(centro.DESC_CENTRO_TRAB ?? "").trim(),
                        }))
                        : []
                );

                setUnidadesMedida(
                    responseUnidades.ok &&
                        jsonUnidades?.success &&
                        Array.isArray(jsonUnidades.data)
                        ? jsonUnidades.data.map((unidade: any) => ({
                            codigo: String(unidade.COD_UNID_MED ?? "").trim(),
                            descricao: String(unidade.DESC_UNID_MED ?? "").trim(),
                        }))
                        : []
                );
            } catch (error) {
                console.error("Erro ao carregar dados:", error);

                setOperacoes([]);
                setCentrosTrabalho([]);
                setUnidadesMedida([]);
            } finally {
                setLoadingOperacoes(false);
                setLoadingCentros(false);
                setLoadingUnidades(false);
            }
        }

        carregarDados();
    }, [open]);

    useEffect(() => {
        if (!open) return;

        setErroValidacao("");

        if (roteiroEdicao) {
            setSeq(String(roteiroEdicao.SEQ ?? ""));
            setSituacao("Aprovada");

            setOperacao(
                `${roteiroEdicao.COD_OPERACAO ?? ""} - ${roteiroEdicao.DESC_OPERACAO ?? ""
                    }`.trim()
            );

            setRoteiroPadrao(numeroParaRoteiro(roteiroEdicao.ALTERNATIVO));

            setCentroTrabalho(
                `${roteiroEdicao.COD_CENTRO_TRAB ?? ""} - ${roteiroEdicao.DESC_CENTRO_TRAB ?? ""
                    }`.trim()
            );

            setDataInicio(formatarDataInput(roteiroEdicao.DT_INICIO) || "1900-01-01");
            setDataFim(formatarDataInput(roteiroEdicao.DT_FIM) || "2999-12-31");

            setApontamento(roteiroEdicao.APONTAMENTO === 1 ? "Sim" : "Não");
            setObrigatorio(roteiroEdicao.OBRIGATORIO === 1 ? "Sim" : "Não");

            setUnidadeMedida(
                `${roteiroEdicao.COD_UNID_MED ?? ""} - ${roteiroEdicao.DESC_UNID_MED ?? ""
                    }`.trim()
            );

            setUmApontamento("");
            setLote("");
            setTempo(String(roteiroEdicao.TEMPO ?? ""));
            setPercentualRecuperacao("");
            setQtdeHomens("");
            setFolgaMinima("");
            setNumeroDias("");
            setTempoPreparacao("");
            setNumeroDiasExecucao("");
            setObservacao(String(roteiroEdicao.OBSERVACAO ?? ""));
            setOperacoesAdicionadas([]);

            return;
        }

        setSeq(seqInicial);
        setOperacoesAdicionadas([]);
        limparCamposFormulario(false);
    }, [open, item, seqInicial, roteiroEdicao]);

    useEffect(() => {
        if (apontamento === "Não") {
            setObrigatorio("Não");
        }
    }, [apontamento]);

    useEffect(() => {
        if (!open || modoEdicao) return;

        const proximaSeq = calcularProximaSequencia(
            item,
            operacoesAdicionadas,
            roteiroPadrao
        );

        setSeq(proximaSeq);
    }, [roteiroPadrao, operacoesAdicionadas, item, open, modoEdicao]);

    function limparCamposFormulario(limparSeq = true) {
        if (limparSeq) setSeq("10");

        setSituacao("Aprovada");
        setOperacao("");
        setRoteiroPadrao("Padrão");
        setCentroTrabalho("");
        setDataInicio("1900-01-01");
        setDataFim("2999-12-31");
        setUnidadeMedida("");
        setUmApontamento("");
        setLote("");
        setTempo("");
        setPercentualRecuperacao("");
        setQtdeHomens("");
        setFolgaMinima("");
        setNumeroDias("");
        setTempoPreparacao("");
        setNumeroDiasExecucao("");
        setObservacao("");
        setObrigatorio("Não");
        setApontamento("Não");
        setErroValidacao("");
    }

    function limparCamposParaProximaOperacao(proximaSeq: string) {
        limparCamposFormulario(false);
        setSeq(proximaSeq);
    }

    function validarFormulario() {
        if (!seq.trim()) return "Informe a sequência.";
        if (!situacao.trim()) return "Informe a situação.";
        if (!operacao.trim()) return "Informe a operação.";
        if (!roteiroPadrao.trim()) return "Informe o roteiro.";
        if (!centroTrabalho.trim()) return "Informe o centro de trabalho.";
        if (!dataInicio.trim()) return "Informe a data de início.";
        if (!dataFim.trim()) return "Informe a data fim.";
        if (!apontamento.trim()) return "Informe o apontamento.";
        if (!unidadeMedida.trim()) return "Informe a unidade de medida.";

        if (apontamento === "Sim" && !obrigatorio.trim()) {
            return "Informe se a operação é obrigatória.";
        }

        return "";
    }

    function montarOperacaoAtual(): OperacaoAdicionada {
        return {
            seq,
            situacao,
            operacao,
            roteiroPadrao,
            centroTrabalho,
            dataInicio,
            dataFim,
            apontamento,
            obrigatorio: apontamento === "Sim" ? obrigatorio : "Não",
            unidadeMedida,
            umApontamento,
            lote,
            tempo,
            percentualRecuperacao,
            qtdeHomens,
            folgaMinima,
            numeroDias,
            tempoPreparacao,
            numeroDiasExecucao,
            observacao,
        };
    }

    function operacaoFormParaPayload(op: OperacaoAdicionada) {
        return {
            alternativo: alternativoParaNumero(op.roteiroPadrao),
            seq: Number(op.seq),
            cod_operacao: extrairCodigo(op.operacao),
            cod_centro_trab: extrairCodigo(op.centroTrabalho),
            cod_unid_med: extrairCodigo(op.unidadeMedida),
            dt_inicio: op.dataInicio || null,
            dt_fim: op.dataFim || null,
            apontamento: simNaoParaFlag(op.apontamento),
            obrigatorio:
                op.apontamento === "Sim" ? simNaoParaFlag(op.obrigatorio) : "0",
            tempo: op.tempo ? Number(String(op.tempo).replace(",", ".")) : null,
            observacao: op.observacao?.trim() || null,
            revisao: item?.revisao || null,
        };
    }

    function roteiroExistenteParaPayload(roteiro: RoteiroItem) {
        return {
            alternativo: alternativoParaNumero(roteiro.ALTERNATIVO),
            seq: Number(roteiro.SEQ),
            cod_operacao: String(roteiro.COD_OPERACAO ?? "").trim(),
            cod_centro_trab: String(roteiro.COD_CENTRO_TRAB ?? "").trim(),
            cod_unid_med: String(roteiro.COD_UNID_MED ?? "").trim(),
            dt_inicio: roteiro.DT_INICIO || null,
            dt_fim: roteiro.DT_FIM || null,
            apontamento: String(roteiro.APONTAMENTO ?? "0"),
            obrigatorio: String(roteiro.OBRIGATORIO ?? "0"),
            tempo: roteiro.TEMPO ?? null,
            observacao: roteiro.OBSERVACAO || null,
            revisao: item?.revisao || null,
        };
    }

    function ehMesmoRoteiro(roteiro: RoteiroItem, roteiroComparar: RoteiroItem) {
        return (
            Number(roteiro.SEQ) === Number(roteiroComparar.SEQ) &&
            alternativoParaNumero(roteiro.ALTERNATIVO) ===
            alternativoParaNumero(roteiroComparar.ALTERNATIVO)
        );
    }

    async function salvarOperacao(fecharDepois: boolean) {
        if (!item) return;

        const erro = validarFormulario();

        if (erro) {
            setErroValidacao(erro);
            return;
        }

        const operacaoAtual = montarOperacaoAtual();

        // =========================================
        // SALVAR E ADICIONAR PRÓXIMA
        // NÃO ENVIA PARA ERP
        // =========================================
        if (!modoEdicao && !fecharDepois) {
            const listaAtualizada = [...operacoesAdicionadas, operacaoAtual];

            setOperacoesAdicionadas(listaAtualizada);

            const proximaSeq = calcularProximaSequencia(
                item,
                listaAtualizada,
                roteiroPadrao
            );

            limparCamposParaProximaOperacao(proximaSeq);

            return;
        }

        try {
            setSalvando(true);
            setErroValidacao("");

            // =========================================
            // ROTEIROS EXISTENTES
            // =========================================
            const existentes = (item.roteiros ?? [])
                .filter((roteiro) => {
                    if (!modoEdicao || !roteiroEdicao) return true;
                    return !ehMesmoRoteiro(roteiro, roteiroEdicao);
                })
                .map(roteiroExistenteParaPayload);

            // =========================================
            // OPERAÇÕES NOVAS DA SESSÃO
            // =========================================
            const novasOperacoes = modoEdicao
                ? [operacaoAtual]
                : [...operacoesAdicionadas, operacaoAtual];

            // =========================================
            // PAYLOAD FINAL
            // =========================================
            const payload = {
                cod_emp: 2,
                cod_item: item.codigoNormalizado,
                roteiros: [
                    ...existentes,
                    ...novasOperacoes.map(operacaoFormParaPayload),
                ],
            };

            console.log("PAYLOAD ERP", JSON.stringify(payload, null, 2));

            const response = await fetch(API_IMPORTAR_ROTEIRO, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const json = await response.json().catch(() => null);

            if (!response.ok || !json?.success) {
                exibirToast(
                    json?.message || json?.error || "Erro ao importar roteiro no ERP.",
                    "erro",
                    json
                );
                return;
            }

            exibirToast(
                json?.message || "Roteiro importado com sucesso.",
                "sucesso",
                json
            );

            setOperacoesAdicionadas([]);
            if (item?.codigoNormalizado) {
                await onRoteiroSalvo?.(item.codigoNormalizado);
            }
            onClose();
        } catch (error) {
            console.error(error);
            exibirToast("Erro inesperado ao enviar roteiro para o ERP.", "erro");
        } finally {
            setSalvando(false);
        }
    }

    return (
        <>
            <ToastContainer
                toasts={toasts}
                onRemove={removerToast}
                onOpenRetorno={setRetornoErpModal}
            />

            {retornoErpModal && (
                <div
                    className={styles.modalOverlay}
                    onClick={() => setRetornoErpModal(null)}
                >
                    <div
                        className={styles.operacaoModalContent}
                        onClick={(e) => e.stopPropagation()}
                        style={{ maxWidth: "900px" }}
                    >
                        <div className={styles.operacaoModalHeader}>
                            <div>
                                <h3 className={styles.operacaoModalTitle}>Retorno do ERP</h3>
                                <p className={styles.operacaoModalSubtitle}>
                                    Resultado completo da importação do roteiro
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.modalCloseButton}
                                onClick={() => setRetornoErpModal(null)}
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.operacaoModalBody}>
                            <pre
                                style={{
                                    margin: 0,
                                    padding: "16px",
                                    background: "#0f172a",
                                    color: "#e5e7eb",
                                    borderRadius: "10px",
                                    fontSize: "13px",
                                    lineHeight: 1.5,
                                    maxHeight: "60vh",
                                    overflow: "auto",
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                }}
                            >
                                {JSON.stringify(retornoErpModal, null, 2)}
                            </pre>
                        </div>

                        <div className={styles.operacaoModalFooter}>
                            <button
                                type="button"
                                className={styles.modalSecondaryButton}
                                onClick={() => setRetornoErpModal(null)}
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {open && item && (
                <div className={styles.modalOverlay} onClick={onClose}>
                    <div
                        className={styles.operacaoModalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.operacaoModalHeader}>
                            <div>
                                <h3 className={styles.operacaoModalTitle}>
                                    {modoEdicao ? "Editar Operação" : "Cadastro de Operação"}
                                </h3>
                                <p className={styles.operacaoModalSubtitle}>
                                    Item {item.codigoNormalizado} | {item.revisao || "-"} —{" "}
                                    {item.descricaoNormalizada || "Sem descrição"}
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.modalCloseButton}
                                onClick={onClose}
                                disabled={salvando}
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.operacaoModalBody}>
                            {erroValidacao && (
                                <div className={styles.errorBox}>{erroValidacao}</div>
                            )}

                            {!modoEdicao && operacoesAdicionadas.length > 0 && (
                                <div className={styles.operacoesAdicionadasBox}>
                                    <h4>Operações adicionadas nesta sessão</h4>

                                    <div className={styles.operacoesAdicionadasList}>
                                        {operacoesAdicionadas.map((op, index) => (
                                            <div
                                                key={`${op.seq}-${index}`}
                                                className={styles.operacaoAdicionadaCard}
                                            >
                                                <strong>Sequência: {op.seq}</strong>

                                                <span>
                                                    <b>Operação:</b> {op.operacao || "-"}
                                                </span>

                                                <span>
                                                    <b>Centro:</b> {op.centroTrabalho || "-"}
                                                </span>

                                                <span>
                                                    <b>Apontamento:</b> {op.apontamento || "-"}
                                                </span>

                                                {op.apontamento === "Sim" && (
                                                    <span>
                                                        <b>Obrigatório:</b> {op.obrigatorio || "-"}
                                                    </span>
                                                )}

                                                <span>
                                                    <b>Unidade:</b> {op.unidadeMedida || "-"}
                                                </span>

                                                {op.observacao?.trim() && (
                                                    <div className={styles.operacaoObservacao}>
                                                        <b>Observação:</b> {op.observacao}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={styles.formSection}>
                                <div className={styles.formGrid}>
                                    <div className={styles.formField}>
                                        <label className={styles.formLabel}>
                                            Seq<span className={styles.required}>*</span>
                                        </label>
                                        <input
                                            className={styles.formInput}
                                            value={seq}
                                            onChange={(e) => setSeq(e.target.value)}
                                        />
                                    </div>

                                    <SearchSelect
                                        label="Situação"
                                        required
                                        value={situacao}
                                        options={situacaoOptions}
                                        onChange={setSituacao}
                                        placeholder="Pesquisar situação..."
                                    />

                                    <OperacaoSearchSelect
                                        value={operacao}
                                        options={operacoes}
                                        loading={loadingOperacoes}
                                        onChange={setOperacao}
                                        onSelect={(option) => {
                                            setOperacao(
                                                `${option.COD_OPERACAO} - ${option.DESC_OPERACAO}`
                                            );
                                            setCentroTrabalho(
                                                `${option.COD_CENTRO_TRAB} - ${option.DESC_CENTRO_TRAB}`
                                            );
                                        }}
                                    />

                                    {modoEdicao ? (
                                        <div className={styles.formField}>
                                            <label className={styles.formLabel}>Roteiro</label>
                                            <input
                                                className={styles.formInput}
                                                value={roteiroPadrao}
                                                disabled
                                                readOnly
                                                title="O tipo do roteiro não pode ser alterado durante a edição."
                                                style={{
                                                    background: "#f3f4f6",
                                                    cursor: "not-allowed",
                                                    color: "#6b7280",
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <SearchSelect
                                            label="Roteiro"
                                            value={roteiroPadrao}
                                            options={roteirosOptions}
                                            onChange={setRoteiroPadrao}
                                            placeholder="Pesquisar roteiro..."
                                        />
                                    )}

                                    <SearchSelect
                                        label="Centro de Trabalho"
                                        required
                                        value={centroTrabalho}
                                        options={centrosTrabalho}
                                        onChange={setCentroTrabalho}
                                        placeholder={
                                            loadingCentros
                                                ? "Carregando centros..."
                                                : "Pesquisar centro..."
                                        }
                                    />

                                    <div className={styles.formField}>
                                        <label className={styles.formLabel}>
                                            Data Início<span className={styles.required}>*</span>
                                        </label>
                                        <input
                                            type="date"
                                            className={styles.formInput}
                                            value={dataInicio}
                                            onChange={(e) => setDataInicio(e.target.value)}
                                        />
                                    </div>

                                    <div className={styles.formField}>
                                        <label className={styles.formLabel}>
                                            Data Fim<span className={styles.required}>*</span>
                                        </label>
                                        <input
                                            type="date"
                                            className={styles.formInput}
                                            value={dataFim}
                                            onChange={(e) => setDataFim(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <fieldset className={styles.formFieldset}>
                                <legend>Apontamento</legend>

                                <div className={styles.formGrid}>
                                    <SearchSelect
                                        label="Apontamento"
                                        required
                                        value={apontamento}
                                        options={simNaoOptions}
                                        onChange={setApontamento}
                                        placeholder="Pesquisar apontamento..."
                                    />

                                    {apontamento === "Sim" && (
                                        <SearchSelect
                                            label="Obrigatório"
                                            required
                                            value={obrigatorio}
                                            options={simNaoOptions}
                                            onChange={setObrigatorio}
                                            placeholder="Pesquisar obrigatório..."
                                        />
                                    )}

                                    <SearchSelect
                                        label="Unidade de Medida"
                                        required
                                        value={unidadeMedida}
                                        options={unidadesMedida}
                                        onChange={setUnidadeMedida}
                                        placeholder={
                                            loadingUnidades
                                                ? "Carregando unidades..."
                                                : "Pesquisar unidade..."
                                        }
                                    />

                                    <SearchSelect
                                        label="UM Apontamento"
                                        value={umApontamento}
                                        options={unidadesMedida}
                                        onChange={setUmApontamento}
                                        placeholder={
                                            loadingUnidades
                                                ? "Carregando unidades..."
                                                : "Pesquisar unidade..."
                                        }
                                    />

                                    <div className={styles.formField}>
                                        <label className={styles.formLabel}>Lote</label>
                                        <input
                                            className={styles.formInput}
                                            value={lote}
                                            onChange={(e) => setLote(e.target.value)}
                                        />
                                    </div>

                                    <div className={styles.formField}>
                                        <label className={styles.formLabel}>Tempo</label>
                                        <input
                                            className={styles.formInput}
                                            value={tempo}
                                            onChange={(e) => setTempo(e.target.value)}
                                        />
                                    </div>

                                    <div className={styles.formField}>
                                        <label className={styles.formLabel}>% Recup. Perda</label>
                                        <input
                                            className={styles.formInput}
                                            value={percentualRecuperacao}
                                            onChange={(e) => setPercentualRecuperacao(e.target.value)}
                                        />
                                    </div>

                                    <div className={styles.formField}>
                                        <label className={styles.formLabel}>Qtde. Homens</label>
                                        <input
                                            className={styles.formInput}
                                            value={qtdeHomens}
                                            onChange={(e) => setQtdeHomens(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </fieldset>

                            <fieldset className={styles.formFieldset}>
                                <legend>Planejamento</legend>

                                <div className={styles.formGrid}>
                                    <div className={styles.formField}>
                                        <label className={styles.formLabel}>Folga Mínima</label>
                                        <input
                                            className={styles.formInput}
                                            value={folgaMinima}
                                            onChange={(e) => setFolgaMinima(e.target.value)}
                                        />
                                    </div>

                                    <div className={styles.formField}>
                                        <label className={styles.formLabel}>
                                            Tempo de Preparação
                                        </label>
                                        <input
                                            className={styles.formInput}
                                            value={tempoPreparacao}
                                            onChange={(e) => setTempoPreparacao(e.target.value)}
                                        />
                                    </div>

                                    <div className={styles.formField}>
                                        <label className={styles.formLabel}>Número de Dias</label>
                                        <input
                                            className={styles.formInput}
                                            value={numeroDias}
                                            onChange={(e) => setNumeroDias(e.target.value)}
                                        />
                                    </div>

                                    <div className={styles.formField}>
                                        <label className={styles.formLabel}>
                                            Número Dias Execução
                                        </label>
                                        <input
                                            className={styles.formInput}
                                            value={numeroDiasExecucao}
                                            onChange={(e) => setNumeroDiasExecucao(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </fieldset>

                            <div className={styles.formFieldFull}>
                                <label className={styles.formLabel}>Observação</label>
                                <textarea
                                    className={styles.formTextarea}
                                    value={observacao}
                                    onChange={(e) => setObservacao(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className={styles.operacaoModalFooter}>
                            <button
                                type="button"
                                className={styles.modalSecondaryButton}
                                onClick={onClose}
                                disabled={salvando}
                            >
                                Cancelar
                            </button>

                            {modoEdicao ? (
                                <button
                                    type="button"
                                    className={styles.modalPrimaryButton}
                                    onClick={() => salvarOperacao(true)}
                                    disabled={salvando}
                                >
                                    {salvando ? "Enviando..." : "Salvar alteração"}
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className={styles.modalSecondaryButton}
                                        onClick={() => salvarOperacao(true)}
                                        disabled={salvando}
                                    >
                                        {salvando ? "Enviando..." : "Salvar e sair"}
                                    </button>

                                    <button
                                        type="button"
                                        className={styles.modalPrimaryButton}
                                        onClick={() => salvarOperacao(false)}
                                        disabled={salvando}
                                    >
                                        {salvando ? "Enviando..." : "Salvar e adicionar próxima"}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}