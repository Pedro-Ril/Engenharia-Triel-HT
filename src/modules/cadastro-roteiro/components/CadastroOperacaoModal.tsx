"use client";

import { X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as EventoTeclado, Ref } from "react";
import styles from "@/app/cadastro-roteiro/cadastro-roteiro.module.css";
import {
    formatarOption,
    SearchSelect,
    useTecladoBusca,
    type SelectOption,
} from "./CampoBusca";
import {
    ComponenteEstrutura,
    ConsumoForm,
    RecursoForm,
    RoteiroItem,
    RoteiroTreeNode,
} from "../types/cadastroRoteiro.types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { buscarRoteiroCompletoErp } from "../services/cadastroRoteiro.service";
import { RecursosConsumosOperacao } from "./RecursosConsumosOperacao";
import { PaisNoErp } from "./PaisNoErp";
import { OutrosPaisMenu } from "./OutrosPaisMenu";
import AbrirPdfItemButton from "./AbrirPdfItemButton";
import Abrir3DPlayButton from "./Abrir3DPlayButton";
import { formatarTempo, mascararTempo, tempoParaNumero } from "../utils/tempo";
import { codigoDoPdf } from "../utils/codigo-pdf";

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
    /*
     * De quem o item faz parte na estrutura consultada -- so para o
     * cabecalho se situar. Null quando o item e a raiz da consulta.
     */
    pai?: RoteiroTreeNode | null;
    /*
     * Os OUTROS conjuntos da estrutura que também usam o item (além do
     * `pai`): viram o menu "+N pais" no cabeçalho.
     */
    outrosPais?: RoteiroTreeNode[];
    roteiroEdicao?: RoteiroItem | null;
    /*
     * Observação que o item pai já tem no roteiro dele (ver
     * CadastroRoteiro.tsx). NÃO entra sozinha: a pessoa clica em
     * "Importar OBS Pai" na operação em que ela deve ir -- às vezes é a
     * primeira, às vezes a segunda.
     */
    observacaoHerdada?: string;
    onClose: () => void;
    onRoteiroSalvo?: (codItem: string) => Promise<void>;
    /*
     * Clique numa operação da faixa "No ERP": a página troca o
     * `roteiroEdicao` por ela (mesmo item, mesmo pai) e o modal passa a
     * editá-la sem fechar.
     */
    onEditarOperacao?: (roteiro: RoteiroItem) => void;
};

/*
 * Só o que a API v2 grava. Situação, datas, Lote, UM Apontamento,
 * % Recup. Perda, Qtde. Homens e os campos de Planejamento saíram da
 * tela: nunca chegavam ao ERP (a v2 não os aceita), e quem preenchia
 * achava que tinha gravado.
 */
type OperacaoAdicionada = {
    seq: string;
    operacao: string;
    roteiroPadrao: string;
    centroTrabalho: string;
    apontamento: string;
    obrigatorio: string;
    unidadeMedida: string;
    tempo: string;
    observacao: string;
    /* Máquinas e componentes consumidos -- vão para a API v2. */
    recursos: RecursoForm[];
    consumos: ConsumoForm[];
};

/* O roteiro do item como está no ERP agora, lido ao abrir o modal. */
type EstadoErp =
    | { estado: "carregando"; codigo: string }
    | { estado: "ok"; codigo: string; roteiros: RoteiroItem[]; componentes: ComponenteEstrutura[] }
    | { estado: "erro"; codigo: string; mensagem: string };

type CampoErro =
    | "seq"
    | "operacao"
    | "centro"
    | "unidade"
    | "apontamento"
    | "obrigatorio"
    | "tempo"
    | "observacao"
    | "consumo"
    | "geral";

/* Erro de validação com o campo dono -- para marcar e focar o campo. */
type ErroFormulario = { campo: CampoErro; mensagem: string };

type PayloadRoteiro = {
    cod_emp: number;
    cod_item: string;
    roteiros: Record<string, unknown>[];
};

/* O que /v2/roteiro/importar/validar devolve (só o que a tela usa). */
type DetalheErp = {
    alternativo: number;
    seq: number;
    cod_operacao?: string | number | null;
    status?: string;
    camposAlterados?: { campo: string; de: unknown; para: unknown }[];
    removidos?: { recursos?: number; consumos?: number };
    desligados?: { operacoesOrdens?: number; roteirosMrp?: number };
};

type RespostaPlanoErp = {
    success: boolean;
    message?: string;
    avisos?: { mensagem?: string }[];
    detalhes?: DetalheErp[];
    excluidos?: DetalheErp[];
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

/*
 * v2: só grava o que mudou, como a tela FENG0202 -- a v1 apagava e
 * reinseria as operações, levando junto consumos e máscaras e
 * desligando as operações das ordens e do MRP.
 */
const API_IMPORTAR_ROTEIRO =
    "http://proserver.trielht.com.br:1000/api/v2/roteiro/importar";

/*
 * Simula a gravação sem gravar (mesmo plano da v2). Roda em todo
 * "adicionar próxima" e antes de gravar: o erro aparece na hora, e o que
 * o envio muda além do que a pessoa mexeu (exclusões, revisão de outras
 * operações) passa por confirmação.
 */
const API_VALIDAR_ROTEIRO =
    "http://proserver.trielht.com.br:1000/api/v2/roteiro/importar/validar";

/*
 * Vigência fixa: não aparece na tela e vai sempre a padrão. A situação
 * também saiu -- é sempre "Aprovada" e a API nem recebe esse campo.
 */
const DT_INICIO_PADRAO = "1900-01-01";
const DT_FIM_PADRAO = "2999-12-31";

/* Limite da coluna OBSERVACAO no ERP (a API recusa acima disto). */
const MAX_OBSERVACAO = 500;

/*
 * Quase toda operacao e apontada em minuto -- deixar pronto poupa um
 * campo por cadastro. Casado pelo CODIGO da unidade, nao pela
 * descricao, que varia ("MINUTO", "MINUTOS").
 */
const CODIGO_UNIDADE_PADRAO = "MIN";

/*
 * Operações, centros e unidades do ERP praticamente não mudam: lidas
 * uma vez, valem para as próximas aberturas do modal (escopo do módulo,
 * dura até recarregar a página). Só entra aqui lista que chegou certa e
 * com itens -- a que falhou fica de fora e é pedida de novo no "Tentar
 * de novo" do rodapé ou na próxima abertura.
 */
const cacheListasErp: {
    operacoes?: OperacaoOption[];
    centros?: SelectOption[];
    unidades?: SelectOption[];
} = {};

/* GET de uma lista do ERP; null quando falhou (rede, HTTP ou formato). */
async function lerListaErp(url: string): Promise<Record<string, unknown>[] | null> {
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
        });
        const json = await response.json().catch(() => null);

        return response.ok && json?.success && Array.isArray(json.data) ? json.data : null;
    } catch (error) {
        console.error("Erro ao carregar lista do ERP:", url, error);
        return null;
    }
}

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

function extrairCodigo(valor: string) {
    return String(valor || "").split("-")[0].trim();
}

function recursosDoErp(roteiro?: RoteiroItem): RecursoForm[] {
    return (roteiro?.RECURSOS ?? []).map((r) => ({
        codRecurso: String(r.COD_RECURSO),
        descricao: String(r.DESC_RECURSO ?? ""),
        preferencial: Number(r.PREFERENCIAL ?? 1) === 1,
    }));
}

function consumosDoErp(roteiro?: RoteiroItem): ConsumoForm[] {
    return (roteiro?.CONSUMOS ?? []).map((c) => ({
        codItem: String(c.COD_ITEM),
        descricao: String(c.DESC_ITEM ?? ""),
        seqOrd: Number(c.SEQ_ORD),
        perConsumo: String(c.PER_CONSUMO ?? 100).replace(".", ","),
    }));
}

function rotuloAlternativo(alternativo: number): string {
    return Number(alternativo) === 0 ? "Padrão" : `Alternativo ${alternativo}`;
}

const NOMES_CAMPOS_ERP: Record<string, string> = {
    revisao: "revisão",
    tempo: "tempo",
    observacao: "observação",
    dt_inicio: "data início",
    dt_fim: "data fim",
    apontamento: "apontamento",
    obrigatorio: "obrigatório",
    operacao_id: "operação",
    centr_trab_id: "centro de trabalho",
    unid_med_id: "unidade",
    recursos: "máquinas",
    consumos: "consumos",
};

function valorLegivel(valor: unknown): string {
    if (valor === null || valor === undefined || valor === "") return "vazio";
    if (Array.isArray(valor)) return valor.length ? valor.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ") : "nenhum";
    return String(valor);
}

function percentualDeTexto(valor: string): number {
    return Number(String(valor).trim().replace(",", "."));
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

/*
 * Base da próxima sequência: o roteiro lido da v2 ao abrir o modal, que é
 * o do ERP agora. A foto da árvore (item.roteiros) só vale enquanto essa
 * leitura não chega -- operação incluída no ERP depois de a árvore
 * carregar fazia o modal sugerir uma sequência que já existia.
 */
function roteirosParaSequencia(item: RoteiroTreeNode | null, erp: EstadoErp | null): RoteiroItem[] {
    if (erp?.estado === "ok" && erp.codigo === item?.codigoNormalizado) return erp.roteiros;
    return item?.roteiros ?? [];
}

function calcularProximaSequencia(
    roteirosExistentes: RoteiroItem[],
    operacoesAdicionadas: OperacaoAdicionada[],
    roteiroAtual: string
) {
    const alternativoAtual = alternativoParaNumero(roteiroAtual);

    const sequenciasExistentes = roteirosExistentes
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
                                background: "var(--success-bg)",
                                color: "var(--success-text)",
                                border: "1px solid var(--success-border)",
                            }
                            : {
                                background: "var(--danger-bg)",
                                color: "var(--danger-text)",
                                border: "1px solid var(--danger-border)",
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
// OPERACAO SEARCH SELECT
// =========================================
function OperacaoSearchSelect({
    value,
    options,
    loading,
    onChange,
    onSelect,
    inputRef,
    invalido = false,
    disabled = false,
}: {
    value: string;
    options: OperacaoOption[];
    loading: boolean;
    /* Travado enquanto o modal grava ou valida no ERP. */
    disabled?: boolean;
    onChange: (value: string) => void;
    onSelect: (option: OperacaoOption) => void;
    inputRef?: Ref<HTMLInputElement>;
    invalido?: boolean;
}) {
    const [search, setSearch] = useState("");
    const [opened, setOpened] = useState(false);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    /* Liga o campo a lista para o leitor de tela (aria-controls). */
    const idLista = useId();

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

    const listaVisivel = !disabled && (opened || !!search) && filteredOptions.length > 0;

    function fecharLista() {
        setOpened(false);
        setSearch("");
    }

    function escolher(option: OperacaoOption) {
        onChange(`${option.COD_OPERACAO} - ${option.DESC_OPERACAO}`);
        onSelect(option);
        setSearch("");
        setOpened(false);
    }

    const { ativo, listaRef, aoTeclar, destacar } = useTecladoBusca({
        opcoes: filteredOptions,
        aberto: listaVisivel,
        abrir: () => setOpened(true),
        fechar: fecharLista,
        escolher,
    });

    return (
        <div className={styles.formField} ref={wrapperRef}>
            <label className={styles.formLabel}>
                Operação<span className={styles.required}>*</span>
            </label>

            <input
                ref={inputRef}
                type="text"
                className={invalido ? `${styles.formInput} ${styles.formInputInvalido}` : styles.formInput}
                aria-invalid={invalido || undefined}
                placeholder={
                    loading ? "Carregando operações..." : "Pesquisar operação..."
                }
                value={search || value}
                disabled={loading || disabled}
                role="combobox"
                aria-expanded={listaVisivel}
                aria-controls={idLista}
                aria-autocomplete="list"
                onFocus={() => setOpened(true)}
                onBlur={fecharLista}
                onKeyDown={aoTeclar}
                onClick={() => {
                    setSearch("");
                    setOpened(true);
                }}
                onChange={(e) => {
                    setSearch(e.target.value);
                    setOpened(true);
                    destacar(0, false);

                    /* Igual ao SearchSelect: digitar filtra, escolher decide. */
                    if (!e.target.value) onChange("");
                }}
            />

            {listaVisivel && (
                <div
                    className={styles.searchDropdown}
                    ref={listaRef}
                    id={idLista}
                    role="listbox"
                >
                    {filteredOptions.map((option, indice) => (
                        <button
                            key={option.ID_OPERACAO}
                            type="button"
                            tabIndex={-1}
                            role="option"
                            aria-selected={indice === ativo}
                            className={
                                indice === ativo
                                    ? `${styles.searchOption} ${styles.searchOptionAtivo}`
                                    : styles.searchOption
                            }
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => destacar(indice, false)}
                            onClick={() => escolher(option)}
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
    pai,
    outrosPais = [],
    roteiroEdicao,
    observacaoHerdada = "",
    onClose,
    onRoteiroSalvo,
    onEditarOperacao,
}: Props) {
    const modoEdicao = !!roteiroEdicao;

    const [seq, setSeq] = useState("10");
    const [operacao, setOperacao] = useState("");
    const [roteiroPadrao, setRoteiroPadrao] = useState("Padrão");
    const [centroTrabalho, setCentroTrabalho] = useState("");
    const [apontamento, setApontamento] = useState("Não");
    const [obrigatorio, setObrigatorio] = useState("Não");
    const [unidadeMedida, setUnidadeMedida] = useState("");
    const [tempo, setTempo] = useState("");
    const [observacao, setObservacao] = useState("");
    const [recursos, setRecursos] = useState<RecursoForm[]>([]);
    const [consumos, setConsumos] = useState<ConsumoForm[]>([]);
    const [erp, setErp] = useState<EstadoErp | null>(null);
    /*
     * A pessoa escolheu o centro nesta sessão (e não é só o que veio da
     * operação em edição): só aí a máquina única do centro entra sozinha.
     */
    const [centroEscolhido, setCentroEscolhido] = useState(false);

    const [operacoes, setOperacoes] = useState<OperacaoOption[]>([]);
    const [loadingOperacoes, setLoadingOperacoes] = useState(false);

    const [centrosTrabalho, setCentrosTrabalho] = useState<SelectOption[]>([]);
    const [unidadesMedida, setUnidadesMedida] = useState<SelectOption[]>([]);

    const [loadingCentros, setLoadingCentros] = useState(false);
    const [loadingUnidades, setLoadingUnidades] = useState(false);

    const [erroValidacao, setErroValidacao] = useState<ErroFormulario | null>(null);
    const [operacoesAdicionadas, setOperacoesAdicionadas] = useState<
        OperacaoAdicionada[]
    >([]);

    const [salvando, setSalvando] = useState(false);
    const [validando, setValidando] = useState(false);
    const [confirmarFechar, setConfirmarFechar] = useState(false);
    const [confirmacaoGravar, setConfirmacaoGravar] = useState<{
        payload: PayloadRoteiro;
        itens: string[];
    } | null>(null);
    const [retornoErpModal, setRetornoErpModal] = useState<any>(null);
    /* Operação da fila que a pessoa quer corrigir, esperando a confirmação
       de descartar o que está no formulário. */
    const [confirmarEditarFila, setConfirmarEditarFila] = useState<number | null>(null);
    /* Operação da faixa "No ERP" escolhida com formulário/fila pendente,
       esperando a confirmação de descartar. */
    const [confirmarTrocarOperacao, setConfirmarTrocarOperacao] = useState<RoteiroItem | null>(null);
    /* Aviso que não é erro (ex.: observação do pai cortada no limite). */
    const [avisoRodape, setAvisoRodape] = useState<string | null>(null);
    /* Listas do ERP que não vieram (operações, centros, unidades). */
    const [listasComFalha, setListasComFalha] = useState<string[]>([]);
    /* Contadores do "Tentar de novo": mudar refaz só aquela leitura. */
    const [tentativaListas, setTentativaListas] = useState(0);
    const [tentativaErp, setTentativaErp] = useState(0);

    /* A pessoa mexeu em algo? Decide se fechar pede confirmação. */
    const tocadoRef = useRef(false);
    const conteudoRef = useRef<HTMLDivElement | null>(null);
    const idTitulo = useId();
    const seqInputRef = useRef<HTMLInputElement | null>(null);
    const operacaoInputRef = useRef<HTMLInputElement | null>(null);
    const centroInputRef = useRef<HTMLInputElement | null>(null);
    const unidadeInputRef = useRef<HTMLInputElement | null>(null);
    const apontamentoInputRef = useRef<HTMLInputElement | null>(null);
    const obrigatorioInputRef = useRef<HTMLInputElement | null>(null);
    const tempoInputRef = useRef<HTMLInputElement | null>(null);
    const observacaoRef = useRef<HTMLTextAreaElement | null>(null);
    const focoInicialFeito = useRef(false);
    /*
     * A pessoa digitou a sequência nesta operação: o recálculo automático
     * (troca de roteiro, fila, leitura do ERP) não pode mais passar por
     * cima dela. Volta a false ao limpar o formulário.
     */
    const seqEditadaRef = useRef(false);
    /*
     * Para onde o foco volta depois de validar/gravar. Os campos ficam
     * desabilitados nesse meio tempo, e focar um campo desabilitado não
     * faz nada -- o efeito sem dependências lá embaixo espera ele
     * reabilitar.
     */
    const focoPendenteRef = useRef<HTMLElement | null>(null);

    const { toasts, exibirToast, removerToast } = useToast();

    /*
     * Cópias para os efeitos de leitura do ERP e de preenchimento: trocar
     * de operação pela faixa muda o `roteiroEdicao` com o modal aberto, e
     * isso não pode refazer a leitura do ERP (a faixa sumiria enquanto
     * carrega) -- o roteiro já lido serve para os recursos/consumos.
     */
    const roteiroEdicaoRef = useRef<RoteiroItem | null>(roteiroEdicao ?? null);
    const erpRef = useRef<EstadoErp | null>(null);

    useEffect(() => {
        roteiroEdicaoRef.current = roteiroEdicao ?? null;
        erpRef.current = erp;
    }, [roteiroEdicao, erp]);

    const seqInicial = useMemo(() => {
        return calcularProximaSequencia(item?.roteiros ?? [], [], "Padrão");
    }, [item]);

    useEffect(() => {
        if (!open) return;

        async function carregarDados() {
            try {
                /* Só pede ao ERP a lista que ainda não está guardada. */
                setLoadingOperacoes(!cacheListasErp.operacoes);
                setLoadingCentros(!cacheListasErp.centros);
                setLoadingUnidades(!cacheListasErp.unidades);

                const [dadosOperacoes, dadosCentros, dadosUnidades] = await Promise.all([
                    cacheListasErp.operacoes ? null : lerListaErp(API_OPERACOES),
                    cacheListasErp.centros ? null : lerListaErp(API_CENTRO_TRABALHO),
                    cacheListasErp.unidades ? null : lerListaErp(API_UNIDADE_MEDIDA),
                ]);

                if (dadosOperacoes?.length) {
                    cacheListasErp.operacoes = dadosOperacoes as unknown as OperacaoOption[];
                }

                if (dadosCentros?.length) {
                    cacheListasErp.centros = dadosCentros.map((centro) => ({
                        codigo: String(centro.COD_CENTRO_TRAB ?? "").trim(),
                        descricao: String(centro.DESC_CENTRO_TRAB ?? "").trim(),
                    }));
                }

                if (dadosUnidades?.length) {
                    cacheListasErp.unidades = dadosUnidades.map((unidade) => ({
                        codigo: String(unidade.COD_UNID_MED ?? "").trim(),
                        descricao: String(unidade.DESC_UNID_MED ?? "").trim(),
                    }));
                }

                const unidades: SelectOption[] = cacheListasErp.unidades ?? [];

                setOperacoes(cacheListasErp.operacoes ?? []);
                setCentrosTrabalho(cacheListasErp.centros ?? []);
                setUnidadesMedida(unidades);

                /*
                 * Antes a falha era silenciosa: o campo só ficava sem
                 * opções. Lista respondida, mesmo vazia, não conta como
                 * falha (null = não respondeu; guardada = não foi pedida).
                 */
                setListasComFalha(
                    [
                        !cacheListasErp.operacoes && dadosOperacoes === null ? "operações" : "",
                        !cacheListasErp.centros && dadosCentros === null ? "centros de trabalho" : "",
                        !cacheListasErp.unidades && dadosUnidades === null ? "unidades de medida" : "",
                    ].filter(Boolean)
                );

                /*
                 * A lista chega depois do formulario montar, entao o padrao
                 * so pode ser aplicado aqui.
                 *
                 * So preenche campo VAZIO: em edicao o efeito que carrega o
                 * roteiro ja rodou e colocou a unidade de la, entao nada e
                 * sobrescrito. Decidir pelo valor atual, em vez de perguntar
                 * se e edicao, mantem este efeito dependendo so de `open`
                 * -- do contrario ele refaria as tres consultas ao ERP a
                 * cada troca de roteiro em edicao.
                 */
                const padrao = unidades.find(
                    (unidade) => unidade.codigo.toUpperCase() === CODIGO_UNIDADE_PADRAO
                );

                if (padrao) {
                    setUnidadeMedida((atual) => (atual ? atual : formatarOption(padrao)));
                }
            } catch (error) {
                console.error("Erro ao carregar dados:", error);

                setOperacoes([]);
                setCentrosTrabalho([]);
                setUnidadesMedida([]);
                setListasComFalha(["operações", "centros de trabalho", "unidades de medida"]);
            } finally {
                setLoadingOperacoes(false);
                setLoadingCentros(false);
                setLoadingUnidades(false);
            }
        }

        carregarDados();
    }, [open, tentativaListas]);

    /*
     * Ao abrir, lê o roteiro do item como está no ERP AGORA (v2): traz as
     * máquinas e os consumos de cada operação e a estrutura do item.
     * Serve para preencher a operação em edição e é a base do envio --
     * a v2 exclui o que não vier no JSON, então partir do que a árvore
     * carregou lá atrás apagaria operação incluída no ERP nesse meio
     * tempo.
     */
    useEffect(() => {
        if (!open || !item?.codigoNormalizado) return;

        const codigo = item.codigoNormalizado;
        let cancelado = false;

        setErp({ estado: "carregando", codigo });

        buscarRoteiroCompletoErp(codigo).then((resultado) => {
            if (cancelado) return;

            if (!resultado.ok) {
                setErp({ estado: "erro", codigo, mensagem: resultado.mensagem });
                return;
            }

            setErp({
                estado: "ok",
                codigo,
                roteiros: resultado.roteiros,
                componentes: resultado.componentes,
            });

            /* A operação em edição AGORA (pode ter trocado pela faixa
               enquanto a leitura corria). */
            const emEdicao = roteiroEdicaoRef.current;
            if (emEdicao) {
                const atual = resultado.roteiros.find((r) => ehMesmoRoteiro(r, emEdicao));
                setRecursos(recursosDoErp(atual));
                setConsumos(consumosDoErp(atual));
            }
        });

        return () => {
            cancelado = true;
        };
    }, [open, item, tentativaErp]);

    useEffect(() => {
        if (!open) return;

        setErroValidacao(null);
        setAvisoRodape(null);
        setCentroEscolhido(false);
        tocadoRef.current = false;
        seqEditadaRef.current = false;

        if (roteiroEdicao) {
            setSeq(String(roteiroEdicao.SEQ ?? ""));

            setOperacao(
                `${roteiroEdicao.COD_OPERACAO ?? ""} - ${roteiroEdicao.DESC_OPERACAO ?? ""
                    }`.trim()
            );

            setRoteiroPadrao(numeroParaRoteiro(roteiroEdicao.ALTERNATIVO));

            setCentroTrabalho(
                `${roteiroEdicao.COD_CENTRO_TRAB ?? ""} - ${roteiroEdicao.DESC_CENTRO_TRAB ?? ""
                    }`.trim()
            );

            setApontamento(roteiroEdicao.APONTAMENTO === 1 ? "Sim" : "Não");
            setObrigatorio(roteiroEdicao.OBRIGATORIO === 1 ? "Sim" : "Não");

            setUnidadeMedida(
                `${roteiroEdicao.COD_UNID_MED ?? ""} - ${roteiroEdicao.DESC_UNID_MED ?? ""
                    }`.trim()
            );

            setTempo(formatarTempo(roteiroEdicao.TEMPO));
            setObservacao(String(roteiroEdicao.OBSERVACAO ?? ""));
            /*
             * Com o roteiro do ERP já lido (troca de operação pela faixa),
             * vêm dele agora; senão chegam com a leitura (efeito acima).
             */
            const erpLido = erpRef.current;
            const atual = erpLido?.estado === "ok" && erpLido.codigo === item?.codigoNormalizado
                ? erpLido.roteiros.find((r) => ehMesmoRoteiro(r, roteiroEdicao))
                : undefined;
            setRecursos(atual ? recursosDoErp(atual) : []);
            setConsumos(atual ? consumosDoErp(atual) : []);
            setOperacoesAdicionadas([]);

            return;
        }

        setSeq(seqInicial);
        setOperacoesAdicionadas([]);
        limparCamposFormulario(false);
    }, [open, item, seqInicial, roteiroEdicao]);

    /*
     * Foco: ao abrir, vai para onde a pessoa começa (Operação no cadastro,
     * Tempo na edição); ao fechar, volta para onde estava -- a linha da
     * árvore -- em vez de cair no topo da página.
     */
    useEffect(() => {
        if (!open) return;

        const focoAnterior = document.activeElement;
        focoInicialFeito.current = false;

        return () => {
            if (focoAnterior instanceof HTMLElement) focoAnterior.focus();
        };
    }, [open]);

    /* O campo Operação fica desabilitado enquanto a lista carrega: o foco
       inicial espera ela chegar. */
    useEffect(() => {
        if (!open || focoInicialFeito.current) return;
        if (!roteiroEdicao && loadingOperacoes) return;

        const alvo = roteiroEdicao ? tempoInputRef : operacaoInputRef;
        const timer = window.setTimeout(() => {
            if (!alvo.current || alvo.current.disabled) return;
            alvo.current.focus();
            focoInicialFeito.current = true;
        }, 60);

        return () => window.clearTimeout(timer);
    }, [open, roteiroEdicao, loadingOperacoes]);

    useEffect(() => {
        if (apontamento === "Não") {
            setObrigatorio("Não");
        }
    }, [apontamento]);

    useEffect(() => {
        if (!open || modoEdicao) return;
        /* Sequência digitada pela pessoa: fica a dela. */
        if (seqEditadaRef.current) return;

        const proximaSeq = calcularProximaSequencia(
            roteirosParaSequencia(item, erp),
            operacoesAdicionadas,
            roteiroPadrao
        );

        setSeq(proximaSeq);
    }, [roteiroPadrao, operacoesAdicionadas, item, erp, open, modoEdicao]);

    /* Devolve o foco guardado em focoPendenteRef assim que o campo
       reabilitar (depois de validar/gravar, ou na próxima operação). */
    useEffect(() => {
        const alvo = focoPendenteRef.current;

        if (!alvo || alvo.hasAttribute("disabled") || !alvo.isConnected) return;

        focoPendenteRef.current = null;
        alvo.focus();
    });

    /* Texto da unidade padrao ("MIN - MINUTO"), ou vazio se a lista
       ainda nao chegou ou o ERP nao tiver esse codigo. */
    function unidadePadraoFormatada(): string {
        const padrao = unidadesMedida.find(
            (unidade) => unidade.codigo.toUpperCase() === CODIGO_UNIDADE_PADRAO
        );

        return padrao ? formatarOption(padrao) : "";
    }

    /*
     * Toda mudança feita pela pessoa passa por aqui: marca o formulário como
     * alterado (fechar passa a pedir confirmação) e tira o erro da vez.
     */
    function alterou<T>(definir: (valor: T) => void) {
        return (valor: T) => {
            tocadoRef.current = true;
            setErroValidacao(null);
            setAvisoRodape(null);
            definir(valor);
        };
    }

    /*
     * "Importar OBS Pai": a pessoa decide em qual operação a observação
     * do pai entra. Campo vazio recebe o texto; com texto já digitado, o
     * do pai vai embaixo, sem apagar nada; se já estiver lá, não repete.
     */
    const observacaoPai = observacaoHerdada.trim();
    const observacaoPaiNoCampo = Boolean(observacaoPai) && observacao.includes(observacaoPai);

    function importarObservacaoPai() {
        if (!observacaoPai) return;

        tocadoRef.current = true;
        setErroValidacao(null);

        const juntada = !observacao.trim()
            ? observacaoPai
            : observacao.includes(observacaoPai)
                ? observacao
                : `${observacao.trimEnd()}\n${observacaoPai}`;

        /*
         * O ERP recusa observação acima do limite. Juntar sem olhar o
         * tamanho passava dele, e o erro só aparecia ao gravar -- corta
         * aqui e avisa, para a pessoa conferir o fim do texto.
         */
        if (juntada.length > MAX_OBSERVACAO) {
            setObservacao(juntada.slice(0, MAX_OBSERVACAO));
            setAvisoRodape(
                `A observação do pai não coube inteira: foi cortada no limite de ${MAX_OBSERVACAO} caracteres do ERP. Confira o fim do texto.`
            );
            return;
        }

        setAvisoRodape(null);
        setObservacao(juntada);
    }

    /* Recurso só vale para máquina do mesmo centro: trocar o centro
       descarta as máquinas escolhidas para o anterior. */
    function alterarCentro(novo: string) {
        tocadoRef.current = true;
        setErroValidacao(null);

        if (extrairCodigo(novo) !== extrairCodigo(centroTrabalho)) {
            setRecursos([]);
        }

        setCentroEscolhido(true);
        setCentroTrabalho(novo);
    }

    function limparCamposFormulario(limparSeq = true) {
        if (limparSeq) setSeq("10");

        setOperacao("");
        setRoteiroPadrao("Padrão");
        setCentroTrabalho("");
        setUnidadeMedida("");
        setTempo("");
        setObservacao("");
        setRecursos([]);
        setConsumos([]);
        setObrigatorio("Não");
        /* Apontamento e "Sim" na pratica quase sempre; abrir ja marcado
           evita o clique repetido a cada operacao. */
        setApontamento("Sim");
        setErroValidacao(null);
        setAvisoRodape(null);
        setCentroEscolhido(false);
        seqEditadaRef.current = false;
    }

    function limparCamposParaProximaOperacao(proximaSeq: string) {
        limparCamposFormulario(false);

        /*
         * Volta na unidade padrao em vez de em branco. So aqui, e nao
         * dentro de limparCamposFormulario: aquela funcao tambem roda no
         * efeito de abertura do modal, e ler `unidadesMedida` ali a
         * tornaria dependencia reativa daquele efeito. Na abertura a
         * lista do ERP nem chegou ainda -- quem aplica o padrao la e o
         * proprio carregamento. Aqui ela ja esta em maos.
         */
        setUnidadeMedida(unidadePadraoFormatada());
        setSeq(proximaSeq);

        /* Próxima operação: o foco volta para Operação, sem mouse -- assim
           que o campo reabilitar (ele fica travado enquanto valida). */
        focoPendenteRef.current = operacaoInputRef.current;
    }

    /*
     * Nada da operação em andamento foi preenchido. Unidade, apontamento,
     * roteiro e sequência não contam: já vêm com valor sozinhos.
     */
    function formularioVazio() {
        return (
            !operacao.trim() &&
            !centroTrabalho.trim() &&
            !tempo.trim() &&
            !observacao.trim() &&
            recursos.length === 0 &&
            consumos.length === 0
        );
    }

    /* Sem o roteiro atual do ERP, o envio poderia excluir operações. */
    function erroLeituraErp(): ErroFormulario | null {
        if (!erp || erp.estado === "carregando") {
            return { campo: "geral", mensagem: "Aguarde: lendo o roteiro atual do ERP." };
        }

        if (erp.estado === "erro") {
            return { campo: "geral", mensagem: `Não foi possível ler o roteiro atual do ERP: ${erp.mensagem}` };
        }

        return null;
    }

    function validarFormulario(): ErroFormulario | null {
        if (!seq.trim()) return { campo: "seq", mensagem: "Informe a sequência." };

        const seqNumero = Number(seq);

        if (!Number.isInteger(seqNumero) || seqNumero <= 0) {
            return { campo: "seq", mensagem: "A sequência deve ser um número inteiro maior que zero." };
        }

        /*
         * Sequência repetida no mesmo alternativo: a v2 trataria as duas
         * como a mesma operação e uma sobrescreveria a outra. Confere no
         * roteiro do ERP (menos a própria operação em edição) e na fila.
         */
        const alternativoAtual = alternativoParaNumero(roteiroPadrao);

        if (erp?.estado === "ok") {
            const repetidaNoErp = erp.roteiros.find(
                (r) =>
                    alternativoParaNumero(r.ALTERNATIVO) === alternativoAtual &&
                    Number(r.SEQ) === seqNumero &&
                    !(roteiroEdicao && ehMesmoRoteiro(r, roteiroEdicao))
            );

            if (repetidaNoErp) {
                return {
                    campo: "seq",
                    mensagem: `A sequência ${seqNumero} já existe no ${rotuloAlternativo(alternativoAtual)} do ERP (${repetidaNoErp.COD_OPERACAO ?? "-"} - ${repetidaNoErp.DESC_OPERACAO ?? ""}). Use outra sequência.`,
                };
            }
        }

        if (!modoEdicao) {
            const repetidaNaFila = operacoesAdicionadas.find(
                (op) =>
                    alternativoParaNumero(op.roteiroPadrao) === alternativoAtual &&
                    Number(op.seq) === seqNumero
            );

            if (repetidaNaFila) {
                return {
                    campo: "seq",
                    mensagem: `A sequência ${seqNumero} já está na fila (${repetidaNaFila.operacao || "-"}). Use outra sequência.`,
                };
            }
        }

        if (!operacao.trim()) return { campo: "operacao", mensagem: "Informe a operação." };
        if (!centroTrabalho.trim()) {
            return { campo: "centro", mensagem: "Informe o centro de trabalho." };
        }
        if (!unidadeMedida.trim()) {
            return { campo: "unidade", mensagem: "Informe a unidade de medida." };
        }
        if (!apontamento.trim()) {
            return { campo: "apontamento", mensagem: "Informe o apontamento." };
        }
        if (apontamento === "Sim" && !obrigatorio.trim()) {
            return { campo: "obrigatorio", mensagem: "Informe se a operação é obrigatória." };
        }

        if (tempo.trim() && tempoParaNumero(tempo) === null) {
            return { campo: "tempo", mensagem: "Tempo inválido: use só número, com vírgula para os decimais (ex.: 1,5)." };
        }

        if (observacao.length > MAX_OBSERVACAO) {
            return {
                campo: "observacao",
                mensagem: `A observação tem ${observacao.length} caracteres; o ERP aceita até ${MAX_OBSERVACAO}.`,
            };
        }

        for (const consumo of consumos) {
            const percentual = percentualDeTexto(consumo.perConsumo);

            if (!Number.isFinite(percentual) || percentual <= 0 || percentual > 100) {
                return {
                    campo: "consumo",
                    mensagem: `Consumo de ${consumo.codItem}: o percentual deve ser maior que 0 e até 100.`,
                };
            }
        }

        return erroLeituraErp();
    }

    /* Mostra o erro no rodapé, marca o campo e põe o foco nele. */
    function mostrarErro(erro: ErroFormulario) {
        setErroValidacao(erro);

        if (erro.campo === "observacao") {
            observacaoRef.current?.focus();
            return;
        }

        const refs: Partial<Record<CampoErro, typeof tempoInputRef>> = {
            seq: seqInputRef,
            operacao: operacaoInputRef,
            centro: centroInputRef,
            unidade: unidadeInputRef,
            apontamento: apontamentoInputRef,
            obrigatorio: obrigatorioInputRef,
            tempo: tempoInputRef,
        };

        refs[erro.campo]?.current?.focus();
    }

    function montarOperacaoAtual(): OperacaoAdicionada {
        return {
            seq,
            operacao,
            roteiroPadrao,
            centroTrabalho,
            apontamento,
            obrigatorio: apontamento === "Sim" ? obrigatorio : "Não",
            unidadeMedida,
            tempo,
            observacao,
            recursos,
            consumos,
        };
    }

    function operacaoFormParaPayload(op: OperacaoAdicionada) {
        return {
            alternativo: alternativoParaNumero(op.roteiroPadrao),
            seq: Number(op.seq),
            cod_operacao: extrairCodigo(op.operacao),
            cod_centro_trab: extrairCodigo(op.centroTrabalho),
            cod_unid_med: extrairCodigo(op.unidadeMedida),
            dt_inicio: DT_INICIO_PADRAO,
            dt_fim: DT_FIM_PADRAO,
            apontamento: simNaoParaFlag(op.apontamento),
            obrigatorio:
                op.apontamento === "Sim" ? simNaoParaFlag(op.obrigatorio) : "0",
            tempo: tempoParaNumero(op.tempo),
            observacao: op.observacao?.trim() || null,
            revisao: item?.revisao || null,
            /*
             * Sempre como lista nas operações deste envio: a v2 deixa a
             * operação exatamente com o que vier. É o que mantém máquinas e
             * consumos quando a sequência muda na edição -- a v2 exclui a
             * operação antiga e inclui a nova, e a nova leva estes.
             */
            recursos: op.recursos.map((r) => ({
                cod_recurso: r.codRecurso,
                preferencial: r.preferencial ? "1" : "0",
            })),
            consumos: op.consumos.map((c) => ({
                cod_item: c.codItem,
                seq_ord: c.seqOrd,
                per_consumo: percentualDeTexto(c.perConsumo),
            })),
        };
    }

    /*
     * Operações que a pessoa não mexeu: vão SEM recursos e consumos, e a
     * v2 deixa no ERP o que já existe. A revisão vai com a da peça, de
     * propósito -- o roteiro acompanha a revisão atual. Quando isso muda a
     * revisão de alguma delas, a confirmação antes de gravar mostra.
     */
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

    /* O roteiro inteiro como vai ao ERP: o que já existe + as novas. */
    function montarPayload(novas: OperacaoAdicionada[]): PayloadRoteiro {
        const existentes = (erp?.estado === "ok" ? erp.roteiros : [])
            .filter((roteiro) => {
                if (!modoEdicao || !roteiroEdicao) return true;
                return !ehMesmoRoteiro(roteiro, roteiroEdicao);
            })
            .map(roteiroExistenteParaPayload);

        return {
            cod_emp: 2,
            cod_item: item?.codigoNormalizado ?? "",
            roteiros: [...existentes, ...novas.map(operacaoFormParaPayload)],
        };
    }

    async function validarNoErp(
        payload: PayloadRoteiro
    ): Promise<{ ok: true; resposta: RespostaPlanoErp } | { ok: false; mensagem: string }> {
        try {
            const response = await fetch(API_VALIDAR_ROTEIRO, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const json = (await response.json().catch(() => null)) as RespostaPlanoErp | null;

            if (!json) {
                return { ok: false, mensagem: `O ERP não respondeu à validação (HTTP ${response.status}).` };
            }

            if (!response.ok || !json.success) {
                return { ok: false, mensagem: json.message || "O ERP recusou o roteiro." };
            }

            return { ok: true, resposta: json };
        } catch {
            return { ok: false, mensagem: "Sem comunicação com a API do ERP para validar o roteiro." };
        }
    }

    /*
     * O que o envio muda no ERP ALÉM das operações que a pessoa cadastrou
     * ou editou: operações excluídas (que somem do JSON, ou a antiga quando
     * a sequência muda na edição) e alterações em outras operações -- como
     * a revisão. É isso que pede confirmação antes de gravar.
     */
    function impactosAlemDoEditado(resposta: RespostaPlanoErp, novas: OperacaoAdicionada[]): string[] {
        const mexidas = new Set(
            novas.map((op) => `${alternativoParaNumero(op.roteiroPadrao)}-${Number(op.seq)}`)
        );
        const itens: string[] = [];

        for (const excluida of resposta.excluidos ?? []) {
            const leva = [
                excluida.removidos?.recursos ? `${excluida.removidos.recursos} máquina(s)` : "",
                excluida.removidos?.consumos ? `${excluida.removidos.consumos} consumo(s)` : "",
            ]
                .filter(Boolean)
                .join(" e ");
            const ordens = excluida.desligados?.operacoesOrdens
                ? `; ${excluida.desligados.operacoesOrdens} operação(ões) de ordens perdem o vínculo`
                : "";

            itens.push(
                `Exclui a seq ${excluida.seq} (${rotuloAlternativo(excluida.alternativo)}, operação ${excluida.cod_operacao ?? "-"})${leva ? `, levando ${leva}` : ""}${ordens}.`
            );
        }

        for (const detalhe of resposta.detalhes ?? []) {
            if (detalhe.status !== "alterar") continue;
            if (mexidas.has(`${Number(detalhe.alternativo)}-${Number(detalhe.seq)}`)) continue;

            const campos = (detalhe.camposAlterados ?? [])
                .map((c) => `${NOMES_CAMPOS_ERP[c.campo] ?? c.campo}: ${valorLegivel(c.de)} → ${valorLegivel(c.para)}`)
                .join("; ");

            itens.push(
                `Altera a seq ${detalhe.seq} (${rotuloAlternativo(detalhe.alternativo)}): ${campos || "dados da operação"}.`
            );
        }

        return itens;
    }

    async function gravarNoErp(payload: PayloadRoteiro) {
        try {
            setSalvando(true);
            setErroValidacao(null);

            const response = await fetch(API_IMPORTAR_ROTEIRO, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const json = await response.json().catch(() => null);

            if (!response.ok || !json?.success) {
                const mensagem = json?.message || json?.error || "Erro ao importar roteiro no ERP.";
                setErroValidacao({ campo: "geral", mensagem });
                exibirToast(mensagem, "erro", json);
                return;
            }

            /* Centro fora do padrão, item inativo...: a v2 grava e avisa. */
            const avisos: string[] = Array.isArray(json?.avisos)
                ? json.avisos
                      .map((a: { mensagem?: string }) => a?.mensagem ?? "")
                      .filter(Boolean)
                : [];

            exibirToast(
                [json?.message || "Roteiro importado com sucesso.", ...avisos].join(" Aviso: "),
                "sucesso",
                json
            );

            setOperacoesAdicionadas([]);
            tocadoRef.current = false;
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

    async function salvarOperacao(fecharDepois: boolean) {
        if (!item || salvando || validando) return;

        /*
         * "Salvar e sair" com fila e formulário em branco: a pessoa já
         * enfileirou tudo e só quer gravar. Antes isso parava em "Informe
         * a operação." e a fila não ia. Formulário com qualquer coisa
         * preenchida continua sendo validado (e enviado) normalmente.
         */
        const soFila =
            !modoEdicao && fecharDepois && operacoesAdicionadas.length > 0 && formularioVazio();

        const erro = soFila ? erroLeituraErp() : validarFormulario();

        if (erro) {
            mostrarErro(erro);
            return;
        }

        const novas = modoEdicao
            ? [montarOperacaoAtual()]
            : soFila
                ? operacoesAdicionadas
                : [...operacoesAdicionadas, montarOperacaoAtual()];

        /* Os campos travam enquanto valida: guarda onde o foco estava
           para devolver depois (o teclado continua no modal). */
        const focoAntes = document.activeElement;
        if (focoAntes instanceof HTMLElement && conteudoRef.current?.contains(focoAntes)) {
            focoPendenteRef.current = focoAntes;
        }

        /* Simula no ERP antes de qualquer coisa: o erro aparece agora,
           e não no envio final depois de várias operações. */
        setValidando(true);
        const validacao = await validarNoErp(montarPayload(novas));
        setValidando(false);

        if (!validacao.ok) {
            setErroValidacao({ campo: "geral", mensagem: validacao.mensagem });
            return;
        }

        // =========================================
        // SALVAR E ADICIONAR PRÓXIMA
        // NÃO ENVIA PARA ERP (só valida)
        // =========================================
        if (!modoEdicao && !fecharDepois) {
            setOperacoesAdicionadas(novas);

            const proximaSeq = calcularProximaSequencia(
                roteirosParaSequencia(item, erp),
                novas,
                roteiroPadrao
            );

            limparCamposParaProximaOperacao(proximaSeq);
            return;
        }

        const payload = montarPayload(novas);
        const itens = impactosAlemDoEditado(validacao.resposta, novas);

        if (itens.length > 0) {
            /* O foco vai para a confirmação; devolvê-lo ao campo agora o
               tiraria de lá. */
            focoPendenteRef.current = null;
            setConfirmacaoGravar({ payload, itens });
            return;
        }

        await gravarNoErp(payload);
    }

    /* Fechar sem perder trabalho: com fila ou alteração, pergunta antes. */
    function pedirFechar() {
        if (salvando || validando) return;

        if (operacoesAdicionadas.length > 0 || tocadoRef.current) {
            setConfirmarFechar(true);
            return;
        }

        onClose();
    }

    /*
     * Operação da faixa "No ERP" para edição no mesmo modal. Com algo
     * pendente (formulário mexido ou fila), pergunta antes: a troca
     * reinicia o formulário e esvazia a fila.
     */
    function pedirEditarOperacao(roteiro: RoteiroItem) {
        if (salvando || validando || !onEditarOperacao) return;

        if (operacoesAdicionadas.length > 0 || tocadoRef.current) {
            setConfirmarTrocarOperacao(roteiro);
            return;
        }

        editarOperacao(roteiro);
    }

    function editarOperacao(roteiro: RoteiroItem) {
        /* O foco inicial (Tempo, na edição) vale de novo para a nova. */
        focoInicialFeito.current = false;
        onEditarOperacao?.(roteiro);
    }

    function removerDaFila(indice: number) {
        setOperacoesAdicionadas((atual) => atual.filter((_, i) => i !== indice));
    }

    /*
     * Operação da fila de volta ao formulário, para corrigir: sai da fila
     * e volta com "Salvar e adicionar próxima" (já com a sequência dela).
     */
    function trazerDaFila(indice: number) {
        const op = operacoesAdicionadas[indice];
        if (!op) return;

        removerDaFila(indice);

        /* A sequência é a dela, não a próxima calculada. */
        seqEditadaRef.current = true;
        tocadoRef.current = true;

        setSeq(op.seq);
        setOperacao(op.operacao);
        setRoteiroPadrao(op.roteiroPadrao);
        setCentroTrabalho(op.centroTrabalho);
        setApontamento(op.apontamento);
        setObrigatorio(op.obrigatorio);
        setUnidadeMedida(op.unidadeMedida);
        setTempo(op.tempo);
        setObservacao(op.observacao);
        setRecursos(op.recursos);
        setConsumos(op.consumos);
        /* As máquinas vêm da própria operação: nada de sugerir de novo. */
        setCentroEscolhido(false);
        setErroValidacao(null);
        setAvisoRodape(null);

        focoPendenteRef.current = operacaoInputRef.current;
    }

    /* Clique na pílula: com algo no formulário, pergunta antes de trocar. */
    function pedirTrazerDaFila(indice: number) {
        if (salvando || validando) return;

        if (formularioVazio()) {
            trazerDaFila(indice);
            return;
        }

        setConfirmarEditarFila(indice);
    }

    /*
     * Teclado no modal inteiro:
     * - Esc fecha (passando pela confirmação). Campo de busca com a lista
     *   aberta fecha só a lista: ele segura o Esc antes de chegar aqui.
     * - Ctrl+Enter: no cadastro, "adicionar próxima"; na edição, salva.
     *   Ctrl+Shift+Enter, no cadastro: grava no ERP e fecha.
     * - Tab fica preso dentro do modal, em vez de ir para a árvore atrás.
     */
    function aoTeclarNoModal(evento: EventoTeclado<HTMLDivElement>) {
        /*
         * Tecla vinda de um portal (Modal/ConfirmDialog da biblioteca
         * aberto a partir daqui): o React a faz subir pela árvore de
         * componentes até este div, mesmo estando fora dele no DOM. O Esc
         * de lá fecha só lá -- não pode pedir para fechar este modal.
         */
        if (!conteudoRef.current?.contains(evento.target as Node)) return;

        if (evento.key === "Escape") {
            evento.preventDefault();
            pedirFechar();
            return;
        }

        if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
            /* Enter que o campo de busca já usou para escolher uma opção. */
            if (evento.defaultPrevented) return;

            evento.preventDefault();

            if (modoEdicao) void salvarOperacao(true);
            else void salvarOperacao(evento.shiftKey);
            return;
        }

        if (evento.key !== "Tab" || !conteudoRef.current) return;

        const focaveis = Array.from(
            conteudoRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        ).filter((el) => el.tabIndex !== -1 && el.offsetParent !== null);

        if (focaveis.length === 0) return;

        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];

        if (evento.shiftKey && document.activeElement === primeiro) {
            evento.preventDefault();
            ultimo.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
            evento.preventDefault();
            primeiro.focus();
        }
    }

    /* Consumos já enfileirados: entram na conta do que "sobra" para consumir. */
    const consumidosNaFila = operacoesAdicionadas.flatMap((op) =>
        op.consumos.map((c) => ({
            alternativo: alternativoParaNumero(op.roteiroPadrao),
            seq: Number(op.seq),
            codItem: c.codItem,
            seqOrd: c.seqOrd,
            perConsumo: percentualDeTexto(c.perConsumo),
        }))
    );

    const erpPronto = erp?.estado === "ok";
    const ocupado = salvando || validando;

    /*
     * "Tentar de novo" refaz só a leitura que falhou. O erro antigo sai
     * do rodapé junto: ficaria contradizendo a nova tentativa.
     */
    function tentarLerErpDeNovo() {
        setErroValidacao(null);
        setTentativaErp((n) => n + 1);
    }

    function tentarListasDeNovo() {
        setListasComFalha([]);
        setTentativaListas((n) => n + 1);
    }

    const acaoTentarErp =
        erp?.estado === "erro" ? { rotulo: "Tentar de novo", executar: tentarLerErpDeNovo } : undefined;

    /* Uma linha no rodapé: o que está acontecendo, ou o que está errado. */
    const mensagemRodape: {
        tipo: "erro" | "info" | "aviso";
        texto: string;
        acao?: { rotulo: string; executar: () => void };
    } | null = validando
        ? { tipo: "info", texto: "Validando no ERP…" }
        : erroValidacao
            ? {
                tipo: "erro",
                texto: erroValidacao.mensagem,
                acao: erroValidacao.campo === "geral" ? acaoTentarErp : undefined,
            }
            : avisoRodape
                ? { tipo: "aviso", texto: avisoRodape }
                : !erp || erp.estado === "carregando"
                    ? { tipo: "info", texto: "Lendo o roteiro atual do ERP…" }
                    : erp.estado === "erro"
                        ? {
                            tipo: "erro",
                            texto: `Não foi possível ler o roteiro atual do ERP: ${erp.mensagem}`,
                            acao: acaoTentarErp,
                        }
                        : listasComFalha.length > 0
                            ? {
                                tipo: "erro",
                                texto: `Não foi possível carregar do ERP a lista de ${listasComFalha.join(", ")}.`,
                                acao: { rotulo: "Tentar de novo", executar: tentarListasDeNovo },
                            }
                            : null;

    /*
     * O roteiro do ERP no alternativo escolhido, para a faixa "No ERP" --
     * a pessoa vê o que já existe sem sair do modal. Só com a leitura
     * pronta: carregando ou com erro, o rodapé já conta.
     */
    const alternativoSelecionado = alternativoParaNumero(roteiroPadrao);
    const operacoesNoErp = erp?.estado === "ok"
        ? erp.roteiros
            .filter((r) => alternativoParaNumero(r.ALTERNATIVO) === alternativoSelecionado)
            .sort((a, b) => Number(a.SEQ ?? 0) - Number(b.SEQ ?? 0))
        : [];
    /* Acima disto vira "+N": a faixa é de uma linha só. */
    const MAX_NA_FAIXA_ERP = 8;
    const operacoesNaFaixa = operacoesNoErp.slice(0, MAX_NA_FAIXA_ERP);
    const operacoesForaDaFaixa = operacoesNoErp.slice(MAX_NA_FAIXA_ERP);

    function descreverOperacaoErp(r: RoteiroItem) {
        return [
            `Seq ${r.SEQ ?? "-"}: ${r.COD_OPERACAO ?? "-"} - ${r.DESC_OPERACAO ?? ""}`,
            `Centro: ${r.COD_CENTRO_TRAB ?? "-"} - ${r.DESC_CENTRO_TRAB ?? ""}`,
            `Tempo: ${r.TEMPO !== null && r.TEMPO !== undefined ? formatarTempo(r.TEMPO) : "-"} ${r.COD_UNID_MED ?? ""}`.trim(),
        ].join("\n");
    }

    /*
     * Roteiro: a lista diz quais alternativos já têm operação no ERP e
     * quais seriam novos. O valor gravado continua "Padrão"/"Alternativo
     * N" -- o complemento só aparece na lista.
     */
    const opcoesRoteiro: SelectOption[] = erp?.estado === "ok"
        ? roteirosOptions.map((opcao) => {
            const alternativo = alternativoParaNumero(opcao.codigo);
            const quantas = erp.roteiros.filter(
                (r) => alternativoParaNumero(r.ALTERNATIVO) === alternativo
            ).length;

            return {
                codigo: opcao.codigo,
                descricao: quantas > 0
                    ? `${quantas} ${quantas === 1 ? "operação" : "operações"} no ERP`
                    : "novo",
                valor: opcao.codigo,
            };
        })
        : roteirosOptions;

    const motivoBotaoDesabilitado = !erpPronto
        ? "Aguarde a leitura do roteiro atual do ERP."
        : undefined;

    const campoInvalido = (campo: CampoErro) => erroValidacao?.campo === campo;

    /* Erro de quem não é campo (abrir 2D/3D): vai para o rodapé. */
    function mostrarErroGeral(mensagem: string) {
        setErroValidacao({ campo: "geral", mensagem });
    }

    return (
        <>
            <ToastContainer
                toasts={toasts}
                onRemove={removerToast}
                onOpenRetorno={setRetornoErpModal}
            />

            {/*
                Modal da biblioteca: portal e z-index acima do modal de
                operação. O overlay antigo tinha o mesmo z-index e vinha
                antes no DOM, então abria ATRÁS do modal de operação.
                Fica fora do conteúdo do modal (como os ConfirmDialog
                abaixo) para o Esc daqui não subir até aoTeclarNoModal.
            */}
            <Modal
                open={Boolean(retornoErpModal)}
                title="Retorno do ERP"
                description="Resultado completo da importação do roteiro"
                size="large"
                onClose={() => setRetornoErpModal(null)}
                footer={
                    <button
                        type="button"
                        className={styles.modalSecondaryButton}
                        onClick={() => setRetornoErpModal(null)}
                    >
                        Fechar
                    </button>
                }
            >
                <pre className={styles.retornoErpJson}>
                    {JSON.stringify(retornoErpModal, null, 2)}
                </pre>
            </Modal>

            {open && item && (
                <div
                    className={styles.modalOverlay}
                    /* mousedown no próprio fundo: arrastar uma seleção de
                       texto para fora do modal não fecha mais nada. */
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) pedirFechar();
                    }}
                >
                    <div
                        ref={conteudoRef}
                        className={styles.operacaoModalContent}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={idTitulo}
                        onKeyDown={aoTeclarNoModal}
                    >
                        <div className={styles.operacaoModalHeader}>
                            <div className={styles.operacaoModalHeaderInfo}>
                                <h3 id={idTitulo} className={styles.operacaoModalTitle}>
                                    {modoEdicao ? "Editar Operação" : "Cadastro de Operação"}
                                </h3>
                                {/*
                                    De quem o item faz parte e quem esta sendo
                                    roteirizado. O codigo sozinho nao dizia onde
                                    o item entra na estrutura, que era a duvida
                                    mais comum de quem abre este modal.
                                */}
                                <div className={styles.hierarquiaItem}>
                                    <div className={styles.hierarquiaLinha}>
                                        <span className={styles.hierarquiaEtiqueta}>
                                            {pai ? "Pertence a" : "Topo da estrutura"}
                                        </span>

                                        {pai ? (
                                            <>
                                                <strong className={styles.hierarquiaCodigo}>
                                                    {pai.codigoNormalizado} | {pai.revisao || "-"}
                                                </strong>
                                                <span
                                                    className={styles.hierarquiaDescricao}
                                                    title={pai.descricaoNormalizada || ""}
                                                >
                                                    {pai.descricaoNormalizada || "Sem descrição"}
                                                </span>

                                                {/* 2D/3D do pai também; usado em mais
                                                    conjuntos, o menu lista os outros. */}
                                                <div className={styles.acoesNaLinha}>
                                                    <AbrirPdfItemButton
                                                        codigo={codigoDoPdf(pai)}
                                                        onErro={mostrarErroGeral}
                                                    />
                                                    <Abrir3DPlayButton item={pai} onErro={mostrarErroGeral} />
                                                    <OutrosPaisMenu pais={outrosPais} onErro={mostrarErroGeral} />
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <span className={styles.hierarquiaDescricao}>
                                                    Pesquisado sozinho — a consulta não tem pai acima.
                                                </span>
                                                <PaisNoErp codItem={item.codigoNormalizado} onErro={mostrarErroGeral} />
                                            </>
                                        )}
                                    </div>

                                    <div
                                        className={`${styles.hierarquiaLinha} ${styles.hierarquiaFilho}`}
                                    >
                                        <span className={styles.hierarquiaEtiqueta}>
                                            Roteirizando
                                        </span>

                                        <strong className={styles.hierarquiaCodigo}>
                                            {item.codigoNormalizado} | {item.revisao || "-"}
                                        </strong>
                                        <span
                                            className={styles.hierarquiaDescricao}
                                            title={item.descricaoNormalizada || ""}
                                        >
                                            {item.descricaoNormalizada || "Sem descrição"}
                                        </span>

                                        {/*
                                            Os mesmos botões da árvore, na linha do
                                            item: conferir o desenho sem fechar o
                                            modal, sem gastar uma faixa de altura.
                                        */}
                                        <div className={styles.acoesNaLinha}>
                                            <AbrirPdfItemButton
                                                codigo={codigoDoPdf(item)}
                                                onErro={mostrarErroGeral}
                                            />
                                            <Abrir3DPlayButton item={item} onErro={mostrarErroGeral} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                className={styles.modalCloseButton}
                                onClick={pedirFechar}
                                disabled={ocupado}
                                aria-label="Fechar"
                                title="Fechar (Esc)"
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>

                        <div className={styles.operacaoModalBody}>
                            {/*
                                Fila da sessão numa faixa só: uma pílula por
                                operação (seq + operação), com o resto no
                                title. Os cartões grandes empurravam o
                                formulário para fora da tela.
                            */}
                            {!modoEdicao && operacoesAdicionadas.length > 0 && (
                                <div className={styles.fila}>
                                    <span className={styles.filaTitulo}>
                                        Na fila ({operacoesAdicionadas.length}) — vão ao ERP ao gravar:
                                    </span>

                                    <ul className={styles.filaLista}>
                                        {operacoesAdicionadas.map((op, index) => (
                                            <li
                                                key={`${op.roteiroPadrao}-${op.seq}-${index}`}
                                                className={styles.filaItem}
                                            >
                                                {/* A pílula é o botão de corrigir: devolve
                                                    a operação ao formulário. O × só tira. */}
                                                <button
                                                    type="button"
                                                    className={styles.filaEditar}
                                                    disabled={ocupado}
                                                    aria-label={`Corrigir a seq ${op.seq} (${op.operacao || "-"}): volta ao formulário`}
                                                    title={[
                                                        `Centro: ${op.centroTrabalho || "-"}`,
                                                        `Unidade: ${op.unidadeMedida || "-"}`,
                                                        `Tempo: ${op.tempo || "-"}`,
                                                        `Apontamento: ${op.apontamento}${op.apontamento === "Sim" ? ` (obrigatório: ${op.obrigatorio})` : ""}`,
                                                        op.recursos.length ? `Máquinas: ${op.recursos.map((r) => r.codRecurso).join(", ")}` : "",
                                                        op.consumos.length ? `Consumos: ${op.consumos.map((c) => `${c.codItem} (${c.perConsumo}%)`).join(", ")}` : "",
                                                        op.observacao?.trim() ? `Observação: ${op.observacao.trim()}` : "",
                                                        "Clique para trazer de volta ao formulário e corrigir.",
                                                    ]
                                                        .filter(Boolean)
                                                        .join("\n")}
                                                    onClick={() => pedirTrazerDaFila(index)}
                                                >
                                                    <strong>{op.seq}</strong>
                                                    <span className={styles.filaOperacao}>
                                                        {op.operacao || "-"}
                                                    </span>
                                                    {op.roteiroPadrao !== "Padrão" && (
                                                        <span className={styles.filaAlternativo}>
                                                            {op.roteiroPadrao}
                                                        </span>
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className={styles.filaRemover}
                                                    aria-label={`Tirar a seq ${op.seq} da fila`}
                                                    title="Tirar da fila"
                                                    disabled={ocupado}
                                                    onClick={() => removerDaFila(index)}
                                                >
                                                    ×
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/*
                                Tudo numa coluna: dados da operação,
                                apontamento, observação e, por último,
                                máquinas e consumos lado a lado.
                            */}
                            <div className={styles.formColunaPrincipal}>
                            <div className={`${styles.formSection} ${styles.formSectionComFaixaErp}`}>
                                {/*
                                    O roteiro do ERP no alternativo escolhido,
                                    pendurado na borda de cima da seção (como
                                    uma legenda): não gasta altura, e o modal
                                    continua sem rolar. Detalhes no title.
                                */}
                                {erp?.estado === "ok" && (
                                    <div className={styles.faixaErp}>
                                        <span className={styles.faixaErpTitulo}>
                                            No ERP ({rotuloAlternativo(alternativoSelecionado)}):
                                        </span>

                                        {operacoesNoErp.length === 0 ? (
                                            <span className={styles.faixaErpVazio}>
                                                nenhuma operação — roteiro novo
                                            </span>
                                        ) : (
                                            operacoesNaFaixa.map((r) => {
                                                const emEdicao = Boolean(roteiroEdicao) && ehMesmoRoteiro(r, roteiroEdicao as RoteiroItem);
                                                const conteudo = (
                                                    <>
                                                        <strong>{r.SEQ}</strong> {r.DESC_OPERACAO || r.COD_OPERACAO}
                                                    </>
                                                );

                                                /* A que já está aberta só fica destacada. */
                                                if (emEdicao || !onEditarOperacao) {
                                                    return (
                                                        <span
                                                            key={`${r.ALTERNATIVO}-${r.SEQ}`}
                                                            className={
                                                                emEdicao
                                                                    ? `${styles.faixaErpOperacao} ${styles.faixaErpOperacaoAtual}`
                                                                    : styles.faixaErpOperacao
                                                            }
                                                            title={emEdicao ? `${descreverOperacaoErp(r)}\n(em edição)` : descreverOperacaoErp(r)}
                                                        >
                                                            {conteudo}
                                                        </span>
                                                    );
                                                }

                                                return (
                                                    <button
                                                        key={`${r.ALTERNATIVO}-${r.SEQ}`}
                                                        type="button"
                                                        className={`${styles.faixaErpOperacao} ${styles.faixaErpOperacaoBotao}`}
                                                        title={`Editar a seq ${r.SEQ}\n\n${descreverOperacaoErp(r)}`}
                                                        disabled={salvando || validando}
                                                        onClick={() => pedirEditarOperacao(r)}
                                                    >
                                                        {conteudo}
                                                    </button>
                                                );
                                            })
                                        )}

                                        {operacoesForaDaFaixa.length > 0 && (
                                            <span
                                                className={styles.faixaErpMais}
                                                title={operacoesForaDaFaixa.map(descreverOperacaoErp).join("\n\n")}
                                            >
                                                +{operacoesForaDaFaixa.length}
                                            </span>
                                        )}
                                    </div>
                                )}

                                <div className={styles.formGrid}>
                                    <div className={styles.formField}>
                                        <label className={styles.formLabel} htmlFor={`${idTitulo}-seq`}>
                                            Sequência<span className={styles.required}>*</span>
                                        </label>
                                        {/* Operação já cadastrada: a sequência fica
                                            travada, como o tipo do roteiro. */}
                                        <input
                                            id={`${idTitulo}-seq`}
                                            ref={seqInputRef}
                                            className={campoInvalido("seq") ? `${styles.formInput} ${styles.formInputInvalido}` : styles.formInput}
                                            aria-invalid={campoInvalido("seq") || undefined}
                                            inputMode="numeric"
                                            value={seq}
                                            disabled={modoEdicao || ocupado}
                                            readOnly={modoEdicao}
                                            title={
                                                modoEdicao
                                                    ? "A sequência não pode ser alterada depois de cadastrada."
                                                    : undefined
                                            }
                                            onChange={(e) => {
                                                /* Digitada à mão: o recálculo automático
                                                   deixa de mexer nela (ver seqEditadaRef). */
                                                seqEditadaRef.current = true;
                                                alterou(setSeq)(e.target.value.replace(/\D/g, ""));
                                            }}
                                        />
                                    </div>

                                    <OperacaoSearchSelect
                                        inputRef={operacaoInputRef}
                                        invalido={campoInvalido("operacao")}
                                        value={operacao}
                                        options={operacoes}
                                        loading={loadingOperacoes}
                                        disabled={ocupado}
                                        onChange={alterou(setOperacao)}
                                        onSelect={(option) => {
                                            alterou(setOperacao)(
                                                `${option.COD_OPERACAO} - ${option.DESC_OPERACAO}`
                                            );
                                            alterarCentro(
                                                `${option.COD_CENTRO_TRAB} - ${option.DESC_CENTRO_TRAB}`
                                            );
                                        }}
                                    />

                                    <SearchSelect
                                        inputRef={centroInputRef}
                                        invalido={campoInvalido("centro")}
                                        label="Centro de Trabalho"
                                        required
                                        disabled={ocupado}
                                        value={centroTrabalho}
                                        options={centrosTrabalho}
                                        onChange={alterarCentro}
                                        placeholder={
                                            loadingCentros
                                                ? "Carregando centros..."
                                                : "Pesquisar centro..."
                                        }
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
                                            />
                                        </div>
                                    ) : (
                                        <SearchSelect
                                            label="Roteiro"
                                            disabled={ocupado}
                                            value={roteiroPadrao}
                                            options={opcoesRoteiro}
                                            onChange={alterou(setRoteiroPadrao)}
                                            placeholder="Pesquisar roteiro..."
                                        />
                                    )}
                                </div>
                            </div>

                            <fieldset className={styles.formFieldset}>
                                <legend>Apontamento</legend>

                                <div className={styles.formGrid}>
                                    <div className={styles.formField}>
                                        <label className={styles.formLabel} htmlFor={`${idTitulo}-tempo`}>
                                            Tempo
                                        </label>
                                        <input
                                            id={`${idTitulo}-tempo`}
                                            ref={tempoInputRef}
                                            className={campoInvalido("tempo") ? `${styles.formInput} ${styles.formInputInvalido}` : styles.formInput}
                                            aria-invalid={campoInvalido("tempo") || undefined}
                                            inputMode="decimal"
                                            placeholder="0,000000"
                                            title="Só número; vírgula para os decimais (até 6 casas)."
                                            disabled={ocupado}
                                            value={tempo}
                                            onChange={(e) => alterou(setTempo)(mascararTempo(e.target.value))}
                                        />
                                    </div>

                                    <SearchSelect
                                        inputRef={unidadeInputRef}
                                        invalido={campoInvalido("unidade")}
                                        label="Unidade de Medida"
                                        required
                                        disabled={ocupado}
                                        value={unidadeMedida}
                                        options={unidadesMedida}
                                        onChange={alterou(setUnidadeMedida)}
                                        placeholder={
                                            loadingUnidades
                                                ? "Carregando unidades..."
                                                : "Pesquisar unidade..."
                                        }
                                    />

                                    <SearchSelect
                                        inputRef={apontamentoInputRef}
                                        invalido={campoInvalido("apontamento")}
                                        label="Apontamento"
                                        required
                                        disabled={ocupado}
                                        value={apontamento}
                                        options={simNaoOptions}
                                        onChange={alterou(setApontamento)}
                                        placeholder="Pesquisar apontamento..."
                                    />

                                    {apontamento === "Sim" && (
                                        <SearchSelect
                                            inputRef={obrigatorioInputRef}
                                            invalido={campoInvalido("obrigatorio")}
                                            label="Obrigatório"
                                            required
                                            disabled={ocupado}
                                            value={obrigatorio}
                                            options={simNaoOptions}
                                            onChange={alterou(setObrigatorio)}
                                            placeholder="Pesquisar obrigatório..."
                                        />
                                    )}
                                </div>
                            </fieldset>

                            <fieldset className={styles.formFieldset}>
                                {/* O botão mora na legenda: não ocupa altura,
                                    e o modal continua cabendo sem rolar. */}
                                <legend className={styles.legendaComAcao}>
                                    Observação
                                    {observacaoPai && (
                                        <button
                                            type="button"
                                            className={styles.botaoCompacto}
                                            title={`Observação do pai: ${observacaoPai}`}
                                            disabled={observacaoPaiNoCampo || ocupado}
                                            onClick={importarObservacaoPai}
                                        >
                                            {observacaoPaiNoCampo ? "OBS do pai importada" : "Importar OBS Pai"}
                                        </button>
                                    )}
                                </legend>

                                <div className={styles.formFieldObservacao}>
                                    <textarea
                                        ref={observacaoRef}
                                        className={
                                            campoInvalido("observacao")
                                                ? `${styles.formTextarea} ${styles.formInputInvalido}`
                                                : styles.formTextarea
                                        }
                                        aria-label="Observação"
                                        aria-invalid={campoInvalido("observacao") || undefined}
                                        maxLength={MAX_OBSERVACAO}
                                        disabled={ocupado}
                                        value={observacao}
                                        onChange={(e) => alterou(setObservacao)(e.target.value)}
                                    />
                                </div>
                            </fieldset>

                            <RecursosConsumosOperacao
                                codCentro={extrairCodigo(centroTrabalho)}
                                recursos={recursos}
                                consumos={consumos}
                                componentes={erp?.estado === "ok" ? erp.componentes : []}
                                alternativo={alternativoParaNumero(roteiroPadrao)}
                                seq={Number(seq)}
                                carregando={!erp || erp.estado === "carregando"}
                                erroErp={erp?.estado === "erro" ? erp.mensagem : ""}
                                disabled={ocupado}
                                sugerirMaquinaUnica={centroEscolhido}
                                consumidosNaFila={consumidosNaFila}
                                onRecursosChange={alterou(setRecursos)}
                                onConsumosChange={alterou(setConsumos)}
                            />
                            </div>
                        </div>

                        <div className={styles.operacaoModalFooter}>
                            {/* Erro e andamento ficam aqui, colados nos
                                botões -- no topo do corpo ninguém via. */}
                            <div
                                className={
                                    mensagemRodape?.tipo === "erro"
                                        ? `${styles.rodapeMensagem} ${styles.rodapeMensagemErro}`
                                        : mensagemRodape?.tipo === "aviso"
                                            ? `${styles.rodapeMensagem} ${styles.rodapeMensagemAviso}`
                                            : styles.rodapeMensagem
                                }
                                role={mensagemRodape?.tipo === "erro" ? "alert" : "status"}
                            >
                                {mensagemRodape?.texto}
                                {mensagemRodape?.acao && (
                                    <>
                                        {" "}
                                        <button
                                            type="button"
                                            className={styles.rodapeAcao}
                                            onClick={mensagemRodape.acao.executar}
                                        >
                                            {mensagemRodape.acao.rotulo}
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Atalho escrito no próprio botão, discreto:
                                no title ninguém descobria. */}
                            <button
                                type="button"
                                className={styles.modalSecondaryButton}
                                onClick={pedirFechar}
                                disabled={ocupado}
                                title="Esc"
                            >
                                Cancelar
                                <kbd className={styles.atalhoTecla}>Esc</kbd>
                            </button>

                            {modoEdicao ? (
                                <button
                                    type="button"
                                    className={styles.modalPrimaryButton}
                                    onClick={() => salvarOperacao(true)}
                                    disabled={ocupado || !erpPronto}
                                    title={motivoBotaoDesabilitado ?? "Ctrl+Enter"}
                                >
                                    {salvando ? "Enviando..." : validando ? "Validando..." : "Salvar alteração"}
                                    <kbd className={styles.atalhoTecla}>Ctrl+Enter</kbd>
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className={styles.modalSecondaryButton}
                                        onClick={() => salvarOperacao(true)}
                                        disabled={ocupado || !erpPronto}
                                        title={motivoBotaoDesabilitado ?? "Ctrl+Shift+Enter"}
                                    >
                                        {salvando ? "Enviando..." : "Salvar e sair"}
                                        <kbd className={styles.atalhoTecla}>Ctrl+Shift+Enter</kbd>
                                    </button>

                                    <button
                                        type="button"
                                        className={styles.modalPrimaryButton}
                                        onClick={() => salvarOperacao(false)}
                                        disabled={ocupado || !erpPronto}
                                        title={motivoBotaoDesabilitado ?? "Ctrl+Enter"}
                                    >
                                        {validando ? "Validando..." : "Salvar e adicionar próxima"}
                                        <kbd className={styles.atalhoTecla}>Ctrl+Enter</kbd>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Fora do conteúdo do modal: o Esc destes diálogos não pode
                borbulhar até o onKeyDown do modal e fechá-lo junto. */}
            <ConfirmDialog
                open={confirmarFechar}
                variant="warning"
                title="Fechar sem gravar?"
                message={
                    operacoesAdicionadas.length > 0
                        ? `Há ${operacoesAdicionadas.length} operação(ões) na fila que ainda não foram ao ERP, além do que está no formulário. Fechando agora, tudo isso se perde.`
                        : "O que foi preenchido no formulário ainda não foi ao ERP. Fechando agora, se perde."
                }
                confirmLabel="Fechar sem gravar"
                cancelLabel="Continuar editando"
                onConfirm={() => {
                    setConfirmarFechar(false);
                    tocadoRef.current = false;
                    onClose();
                }}
                onClose={() => setConfirmarFechar(false)}
            />

            <ConfirmDialog
                open={confirmarEditarFila !== null}
                variant="warning"
                title="Trocar o que está no formulário?"
                message={`O formulário tem uma operação em andamento (${operacao || "sem operação escolhida"}) que ainda não foi para a fila. Trazendo a seq ${confirmarEditarFila !== null ? operacoesAdicionadas[confirmarEditarFila]?.seq ?? "" : ""} da fila para corrigir, o que está no formulário se perde.`}
                confirmLabel="Descartar e corrigir a da fila"
                cancelLabel="Continuar no formulário"
                onConfirm={() => {
                    const indice = confirmarEditarFila;
                    setConfirmarEditarFila(null);
                    if (indice !== null) trazerDaFila(indice);
                }}
                onClose={() => setConfirmarEditarFila(null)}
            />

            <ConfirmDialog
                open={confirmarTrocarOperacao !== null}
                variant="warning"
                title="Trocar de operação sem gravar?"
                message={
                    operacoesAdicionadas.length > 0
                        ? `Há ${operacoesAdicionadas.length} operação(ões) na fila que ainda não foram ao ERP, além do que está no formulário. Abrindo a seq ${confirmarTrocarOperacao?.SEQ ?? ""} para editar, tudo isso se perde.`
                        : `O que foi preenchido no formulário ainda não foi ao ERP. Abrindo a seq ${confirmarTrocarOperacao?.SEQ ?? ""} para editar, se perde.`
                }
                confirmLabel="Descartar e trocar"
                cancelLabel="Continuar editando"
                onConfirm={() => {
                    const roteiro = confirmarTrocarOperacao;
                    setConfirmarTrocarOperacao(null);
                    if (roteiro) editarOperacao(roteiro);
                }}
                onClose={() => setConfirmarTrocarOperacao(null)}
            />

            <ConfirmDialog
                open={Boolean(confirmacaoGravar)}
                variant="warning"
                title="Gravar no ERP também muda isto"
                message={
                    <div className={styles.confirmacaoImpactos}>
                        <p>Além do que você cadastrou, o envio do roteiro completo vai:</p>
                        <ul>
                            {confirmacaoGravar?.itens.map((texto) => (
                                <li key={texto}>{texto}</li>
                            ))}
                        </ul>
                    </div>
                }
                confirmLabel="Gravar mesmo assim"
                cancelLabel="Voltar"
                loading={salvando}
                onConfirm={async () => {
                    const pendente = confirmacaoGravar;
                    if (!pendente) return;
                    await gravarNoErp(pendente.payload);
                    setConfirmacaoGravar(null);
                }}
                onClose={() => setConfirmacaoGravar(null)}
            />
        </>
    );
}