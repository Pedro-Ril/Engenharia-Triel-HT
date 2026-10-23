"use client";

import {
    Check,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    ChevronsDownUp,
    ChevronsUpDown,
    CircleCheck,
    CircleHelp,
    Copy,
    Download,
    LoaderCircle,
    TriangleAlert,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./cadastro-roteiro.module.css";
import {
    buscarDadosItensNoErp,
    buscarEstruturaComRoteiros,
    codigosParaCompletarNoErp,
    buscarRoteirosDoItem,
    deletarOperacaoRoteiro,
    deletarRoteiroCompleto,
    type ProgressoConsulta,
    type OrigemEstrutura,
} from "@/modules/cadastro-roteiro/services/cadastroRoteiro.service";
import CadastroOperacaoModal from "@/modules/cadastro-roteiro/components/CadastroOperacaoModal";
import {
    RoteiroItem,
    RoteiroTreeNode,
} from "@/modules/cadastro-roteiro/types/cadastroRoteiro.types";
import { codigoDoPdf } from "@/modules/cadastro-roteiro/utils/codigo-pdf";
import AbrirPdfItemButton from "@/modules/cadastro-roteiro/components/AbrirPdfItemButton";
import Abrir3DPlayButton from "@/modules/cadastro-roteiro/components/Abrir3DPlayButton";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { copiarParaAreaDeTransferencia } from "@/lib/utils/copiar-para-area-transferencia";
import { exportarPlanilha, nomeComData } from "@/lib/utils/exportar-planilha";
import {
    validarEstruturaNoErp,
    type ResultadoValidacaoEstrutura,
    type TipoDivergencia,
} from "@/modules/cadastro-roteiro/services/validacaoEstrutura.service";
import { ModoAberturaProvider } from "@/modules/cadastro-roteiro/components/ModoAberturaArquivos";
import { formatarTempo } from "@/modules/cadastro-roteiro/utils/tempo";
import type { ModoAberturaArquivos } from "@/modules/cadastro-roteiro/constants/abertura-arquivos";

function normalizarTipo(valor?: string | null): string {
    const texto = String(valor ?? "").trim().toLowerCase();

    if (
        texto === "comp.desenhado" ||
        texto === "comp desenhado" ||
        texto === "comprado desenhado"
    ) {
        return "comprado desenhado";
    }

    return texto;
}

function formatarTipo(valor?: string | null): string {
    const tipoNormalizado = normalizarTipo(valor);

    if (!tipoNormalizado) return "-";

    if (tipoNormalizado === "comprado desenhado") {
        return "Comprado Desenhado";
    }

    return tipoNormalizado
        .split(" ")
        .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
        .join(" ");
}

/*
 * O modulo existe para cadastrar roteiro de fabricacao, entao a
 * estrutura ja abre filtrada no que interessa. Continua desmarcavel.
 *
 * Item que vem do 3DX sem tipo (revisao ainda em trabalho) nao some do
 * filtro: o tipo do cadastro do ERP completa o no logo depois da
 * consulta (ver tipoBrutoDoItem), e ai ele entra como Fabricado.
 */
const TIPO_FILTRO_PADRAO = "fabricado";

/*
 * O tipo que a tela usa: o do 3DX e, se ele vier vazio, o do cadastro
 * do ERP (tipoErp). O `tipoint` bruto continua intocado no no -- a
 * conferencia da estrutura depende dele.
 */
function tipoBrutoDoItem(node: RoteiroTreeNode): string {
    return String(node.tipoint ?? "").trim() || String(node.tipoErp ?? "").trim();
}

function tipoVeioDoErp(node: RoteiroTreeNode): boolean {
    return !String(node.tipoint ?? "").trim() && Boolean(String(node.tipoErp ?? "").trim());
}

function obterTipoItem(node: RoteiroTreeNode): string {
    return normalizarTipo(tipoBrutoDoItem(node));
}

function obterTipoRoteiro(roteiro: RoteiroItem): string {
    const valor = String(roteiro.ALTERNATIVO ?? "").trim();

    if (!valor || valor === "0") return "Padrão";

    const upper = valor.toUpperCase();

    if (upper === "PADRÃO" || upper === "PADRAO") return "Padrão";

    const match = upper.match(/ALTERNATIVO\s+(\d+)/);

    if (match) return `Alternativo ${match[1]}`;

    if (/^\d+$/.test(valor)) return `Alternativo ${valor}`;

    return valor;
}

function alternativoParaNumero(valor?: string | number | null): number {
    const texto = String(valor ?? "").trim();

    if (!texto || texto === "0") return 0;

    const upper = texto.toUpperCase();

    if (upper === "PADRÃO" || upper === "PADRAO") return 0;

    const match = upper.match(/ALTERNATIVO\s+(\d+)/);

    if (match) return Number(match[1]);

    if (/^\d+$/.test(texto)) return Number(texto);

    return 0;
}

function formatarQtdOperacoes(qtd: number): string {
    return qtd === 1 ? "1 operação" : `${qtd} operações`;
}

/* "Alternativo 1" -> "Alt 1", para caber na badge. */
function abreviarAlternativo(tipoRoteiro: string): string {
    return tipoRoteiro.replace(/^Alternativo\s+/, "Alt ");
}

/*
 * Texto da badge de operações. Contar só o Padrão deixava um item que
 * só tem alternativo com um "0 operações" verde -- parecia cadastrado
 * e vazio ao mesmo tempo. Sem operação nenhuma, nada de badge (o
 * fabricado ganha o "Sem roteiro"; o comprado não precisa de roteiro).
 */
function resumirOperacoes(
    roteiros: RoteiroItem[]
): { texto: string; titulo: string; soAlternativo: boolean } | null {
    if (roteiros.length === 0) return null;

    const padrao = contarOperacoesPadrao(roteiros);
    const alternativos = agruparRoteirosPorAlternativo(roteiros)
        .map(([tipo]) => tipo)
        .filter((tipo) => tipo !== "Padrão");

    if (padrao > 0) {
        return {
            texto:
                alternativos.length > 0
                    ? `${formatarQtdOperacoes(padrao)} · +${alternativos.length} alt`
                    : formatarQtdOperacoes(padrao),
            titulo:
                alternativos.length > 0
                    ? `Roteiro padrão com ${formatarQtdOperacoes(padrao)}; também tem ${alternativos.join(", ")}.`
                    : `Roteiro padrão com ${formatarQtdOperacoes(padrao)}.`,
            soAlternativo: false,
        };
    }

    return {
        texto: `${roteiros.length} op · ${alternativos.map(abreviarAlternativo).join(", ")}`,
        titulo: `Sem roteiro padrão: ${formatarQtdOperacoes(roteiros.length)} em ${alternativos.join(", ")}.`,
        soAlternativo: true,
    };
}

/* Vigência que o ERP grava quando ninguém informa nenhuma -- não diz
   nada a quem lê o card, então só aparece quando for outra. */
const DT_INICIO_PADRAO = "01/01/1900";
const DT_FIM_PADRAO = "31/12/2999";

function vigenciaDiferenteDoPadrao(roteiro: RoteiroItem): boolean {
    const inicio = String(roteiro.DT_INICIO ?? "").trim();
    const fim = String(roteiro.DT_FIM ?? "").trim();

    return (Boolean(inicio) && inicio !== DT_INICIO_PADRAO) || (Boolean(fim) && fim !== DT_FIM_PADRAO);
}


function normalizarRevisao(valor?: string | number | null): string {
    return String(valor ?? "").trim().toUpperCase();
}

function obterRevisaoErp(roteiro: RoteiroItem): string {
    const roteiroComRevisao = roteiro as RoteiroItem & {
        REVISAO?: string | number | null;
    };

    return normalizarRevisao(roteiroComRevisao.REVISAO);
}

function obterRevisoesErpTexto(roteiros: RoteiroItem[]): string {
    const revisoes = Array.from(
        new Set(
            roteiros.map((roteiro) => obterRevisaoErp(roteiro) || "Sem revisão")
        )
    );

    return revisoes.length > 0 ? revisoes.join(", ") : "Sem revisão";
}

function roteiroComAtencao(node: RoteiroTreeNode): boolean {
    const revisao3dx = normalizarRevisao(node.revisao);

    if (!revisao3dx || node.roteiros.length === 0) return false;

    return node.roteiros.some((roteiro) => {
        const revisaoErp = obterRevisaoErp(roteiro);

        return !revisaoErp || revisaoErp !== revisao3dx;
    });
}

/*
 * Observação herdada do pai: quando o item de cima já tem uma
 * observação no roteiro dele, o filho nasce com o mesmo texto no
 * campo -- quase sempre a observação vale para a peça inteira, e
 * redigitar item a item é onde o pessoal errava.
 *
 * O pai é o IMEDIATO na estrutura (não a raiz pesquisada), então a
 * observação desce nível a nível. É só um valor inicial: quem está
 * cadastrando continua livre para apagar ou trocar.
 */
function encontrarPaiNaArvore(
    raiz: RoteiroTreeNode | null,
    filhoId: string
): RoteiroTreeNode | null {
    if (!raiz) return null;

    for (const filho of raiz.children) {
        if (filho.id === filhoId) return raiz;

        const achado = encontrarPaiNaArvore(filho, filhoId);
        if (achado) return achado;
    }

    return null;
}

/*
 * Todos os conjuntos da estrutura que usam o código como filho direto,
 * um por código. O mesmo item pode estar em mais de um conjunto; o
 * modal mostra o pai de onde foi aberto e lista os outros num menu.
 */
function paisDoCodigoNaArvore(
    raiz: RoteiroTreeNode | null,
    codigo: string
): RoteiroTreeNode[] {
    const achados = new Map<string, RoteiroTreeNode>();

    function visitar(node: RoteiroTreeNode) {
        for (const filho of node.children) {
            if (filho.codigoNormalizado === codigo && !achados.has(node.codigoNormalizado)) {
                achados.set(node.codigoNormalizado, node);
            }

            visitar(filho);
        }
    }

    if (raiz) visitar(raiz);

    return [...achados.values()];
}

/*
 * A primeira observação preenchida do roteiro, na ordem de sequência
 * das operações -- um item pode ter várias operações, e nem todas têm
 * texto.
 */
function primeiraObservacaoDoRoteiro(node: RoteiroTreeNode | null): string {
    if (!node) return "";

    const comObservacao = [...node.roteiros]
        .sort((a, b) => Number(a.SEQ ?? 0) - Number(b.SEQ ?? 0))
        .find((roteiro) => (roteiro.OBSERVACAO ?? "").trim());

    return (comObservacao?.OBSERVACAO ?? "").trim();
}

function contarOperacoesPadrao(roteiros: RoteiroItem[]): number {
    return roteiros.filter((roteiro) => obterTipoRoteiro(roteiro) === "Padrão")
        .length;
}

function agruparRoteirosPorAlternativo(roteiros: RoteiroItem[]) {
    const grupos = new Map<string, RoteiroItem[]>();

    for (const roteiro of roteiros) {
        const tipo = obterTipoRoteiro(roteiro);
        const lista = grupos.get(tipo) ?? [];
        lista.push(roteiro);
        grupos.set(tipo, lista);
    }

    return Array.from(grupos.entries());
}

function coletarTiposItens(
    node: RoteiroTreeNode | null,
    tipos = new Map<string, string>()
) {
    if (!node) return tipos;

    const tipoKey = obterTipoItem(node);

    if (tipoKey && !tipos.has(tipoKey)) {
        tipos.set(tipoKey, formatarTipo(tipoBrutoDoItem(node)));
    }

    for (const child of node.children) {
        coletarTiposItens(child, tipos);
    }

    return tipos;
}

function filtrarSemRoteiro(node: RoteiroTreeNode): RoteiroTreeNode | null {
    const filhosFiltrados = node.children
        .map((child) => filtrarSemRoteiro(child))
        .filter((child): child is RoteiroTreeNode => child !== null);

    const tipoItem = obterTipoItem(node);
    const semRoteiro = tipoItem === "fabricado" && node.roteiros.length === 0;

    if (!semRoteiro && filhosFiltrados.length === 0) return null;

    return { ...node, children: filhosFiltrados };
}


function filtrarComAtencao(node: RoteiroTreeNode): RoteiroTreeNode | null {
    const filhosFiltrados = node.children
        .map((child) => filtrarComAtencao(child))
        .filter((child): child is RoteiroTreeNode => child !== null);

    const tipoItem = obterTipoItem(node);
    const comAtencao = tipoItem === "fabricado" && roteiroComAtencao(node);

    if (!comAtencao && filhosFiltrados.length === 0) return null;

    return { ...node, children: filhosFiltrados };
}

function filtrarPorTipo(
    node: RoteiroTreeNode,
    tiposSelecionados: string[]
): RoteiroTreeNode | null {
    if (tiposSelecionados.length === 0) return node;

    const filhosFiltrados = node.children
        .map((child) => filtrarPorTipo(child, tiposSelecionados))
        .filter((child): child is RoteiroTreeNode => child !== null);

    const corresponde = tiposSelecionados.includes(obterTipoItem(node));

    if (!corresponde && filhosFiltrados.length === 0) return null;

    return { ...node, children: filhosFiltrados };
}

function contarItensUnicos(
    node: RoteiroTreeNode | null,
    codigos = new Set<string>()
): number {
    if (!node) return 0;

    const codigo = String(node.codigoNormalizado || "").trim();

    if (codigo) codigos.add(codigo);

    for (const child of node.children) {
        contarItensUnicos(child, codigos);
    }

    return codigos.size;
}

function contarItensSemRoteiro(
    node: RoteiroTreeNode | null,
    codigos = new Set<string>()
): number {
    if (!node) return 0;

    const codigo = String(node.codigoNormalizado || "").trim();
    const tipoItem = obterTipoItem(node);
    const semRoteiro = tipoItem === "fabricado" && node.roteiros.length === 0;

    if (codigo && semRoteiro) {
        codigos.add(codigo);
    }

    for (const child of node.children) {
        contarItensSemRoteiro(child, codigos);
    }

    return codigos.size;
}


function contarItensComAtencao(
    node: RoteiroTreeNode | null,
    codigos = new Set<string>()
): number {
    if (!node) return 0;

    const codigo = String(node.codigoNormalizado || "").trim();
    const tipoItem = obterTipoItem(node);
    const comAtencao = tipoItem === "fabricado" && roteiroComAtencao(node);

    if (codigo && comAtencao) {
        codigos.add(codigo);
    }

    for (const child of node.children) {
        contarItensComAtencao(child, codigos);
    }

    return codigos.size;
}

type ItemComAtencao = {
    item: RoteiroTreeNode;
    revisao3dx: string;
    revisoesErp: string;
};

function listarItensComAtencaoUnicos(
    node: RoteiroTreeNode | null,
    mapa = new Map<string, ItemComAtencao>()
): ItemComAtencao[] {
    if (!node) return [];

    const codigo = String(node.codigoNormalizado || "").trim();
    const tipoItem = obterTipoItem(node);
    const comAtencao = tipoItem === "fabricado" && roteiroComAtencao(node);

    if (codigo && comAtencao && !mapa.has(codigo)) {
        mapa.set(codigo, {
            item: node,
            revisao3dx: normalizarRevisao(node.revisao) || "-",
            revisoesErp: obterRevisoesErpTexto(node.roteiros),
        });
    }

    for (const child of node.children) {
        listarItensComAtencaoUnicos(child, mapa);
    }

    return Array.from(mapa.values());
}

function listarItensSemRoteiroUnicos(
    node: RoteiroTreeNode | null,
    mapa = new Map<string, RoteiroTreeNode>()
): RoteiroTreeNode[] {
    if (!node) return [];

    const codigo = String(node.codigoNormalizado || "").trim();
    const tipoItem = obterTipoItem(node);
    const semRoteiro = tipoItem === "fabricado" && node.roteiros.length === 0;

    if (codigo && semRoteiro && !mapa.has(codigo)) {
        mapa.set(codigo, node);
    }

    for (const child of node.children) {
        listarItensSemRoteiroUnicos(child, mapa);
    }

    return Array.from(mapa.values());
}

/*
 * Caminho da raiz até o nó (ids dos ANCESTRAIS, sem o próprio nó), ou
 * null se o nó não está nesta árvore. Só roda num clique/navegação, não
 * a cada render -- uma passada na árvore, mesmo com milhares de nós.
 */
function caminhoAteNo(raiz: RoteiroTreeNode | null, id: string): string[] | null {
    if (!raiz) return null;
    if (raiz.id === id) return [];

    for (const filho of raiz.children) {
        const caminho = caminhoAteNo(filho, id);
        if (caminho) return [raiz.id, ...caminho];
    }

    return null;
}

function coletarIdsComFilhos(node: RoteiroTreeNode | null, ids = new Set<string>()): Set<string> {
    if (!node) return ids;

    if (node.children.length > 0) ids.add(node.id);

    for (const filho of node.children) coletarIdsComFilhos(filho, ids);

    return ids;
}

function adicionarAoConjunto(atual: ReadonlySet<string>, ids: Iterable<string>): ReadonlySet<string> {
    const novo = new Set(atual);
    for (const id of ids) novo.add(id);
    return novo;
}

function alternarNoConjunto(atual: ReadonlySet<string>, id: string): ReadonlySet<string> {
    const novo = new Set(atual);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    return novo;
}

/* Sem acento e sem caixa: "conexao" acha "CONEXÃO". */
function normalizarBusca(texto: string): string {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

/* Nós que batem com o termo, na ordem em que aparecem na árvore. */
function localizarNaArvore(raiz: RoteiroTreeNode | null, termo: string): RoteiroTreeNode[] {
    const alvo = normalizarBusca(termo);
    const achados: RoteiroTreeNode[] = [];

    if (!raiz || !alvo) return achados;

    function visitar(node: RoteiroTreeNode) {
        if (
            normalizarBusca(node.codigoNormalizado).includes(alvo) ||
            normalizarBusca(node.descricaoNormalizada).includes(alvo)
        ) {
            achados.push(node);
        }

        for (const filho of node.children) visitar(filho);
    }

    visitar(raiz);

    return achados;
}

function itemSemRoteiro(node: RoteiroTreeNode): boolean {
    return obterTipoItem(node) === "fabricado" && node.roteiros.length === 0;
}

function itemComAtencao(node: RoteiroTreeNode): boolean {
    return obterTipoItem(node) === "fabricado" && !itemSemRoteiro(node) && roteiroComAtencao(node);
}

/*
 * Planilha da estrutura como está na tela (com os filtros aplicados):
 * uma linha por operação, e uma linha só para item sem operação. Sai
 * em .xlsx pelo exportarPlanilha do portal (o xlsx já é dependência).
 */
const CABECALHO_EXPORTACAO = [
    "Nível",
    "Código",
    "Revisão",
    "Tipo",
    "Descrição",
    "Situação",
    "Alternativo",
    "Sequência",
    "Operação",
    "Centro",
    "Unidade",
    "Tempo",
    "Observação",
];

function montarLinhasExportacao(
    raiz: RoteiroTreeNode,
    divergencias: ReadonlyMap<string, TipoDivergencia>
): (string | number)[][] {
    const linhas: (string | number)[][] = [];

    function visitar(node: RoteiroTreeNode, nivel: number) {
        const situacoes: string[] = [];

        if (itemSemRoteiro(node)) situacoes.push("Sem roteiro");
        if (itemComAtencao(node)) situacoes.push("Com atenção");

        const divergencia = divergencias.get(node.id);
        if (divergencia) situacoes.push(divergencia === "vencida" ? "Vencido no ERP" : "Não tem no ERP");

        const base = [
            nivel,
            node.codigoNormalizado,
            node.revisao || "",
            formatarTipo(tipoBrutoDoItem(node)),
            node.descricaoNormalizada,
            situacoes.length > 0 ? situacoes.join(", ") : "OK",
        ];

        const roteiros = [...node.roteiros].sort(
            (a, b) =>
                alternativoParaNumero(a.ALTERNATIVO) - alternativoParaNumero(b.ALTERNATIVO) ||
                Number(a.SEQ ?? 0) - Number(b.SEQ ?? 0)
        );

        if (roteiros.length === 0) {
            linhas.push([...base, "", "", "", "", "", "", ""]);
        }

        for (const roteiro of roteiros) {
            linhas.push([
                ...base,
                obterTipoRoteiro(roteiro),
                roteiro.SEQ ?? "",
                [roteiro.COD_OPERACAO, roteiro.DESC_OPERACAO].filter(Boolean).join(" - "),
                [roteiro.COD_CENTRO_TRAB, roteiro.DESC_CENTRO_TRAB].filter(Boolean).join(" - "),
                roteiro.COD_UNID_MED ?? "",
                formatarTempo(roteiro.TEMPO),
                String(roteiro.OBSERVACAO ?? "").trim(),
            ]);
        }

        for (const filho of node.children) visitar(filho, nivel + 1);
    }

    visitar(raiz, 0);

    return linhas;
}

/*
 * Código na URL (?codigo=), para a consulta poder ser compartilhada e
 * sobreviver a um F5. history.replaceState e não router.replace: o
 * Next (14.1+) sincroniza o useSearchParams com ele SEM ir ao servidor,
 * e o router.replace refaria o render do page.tsx a cada consulta só
 * para trocar a barra de endereço.
 */
/* Triel-HT: estrutura do 3DX (o padrão). Ciber: estrutura do ERP. */
const OPCOES_ORIGEM = [
    { value: "3dx", label: "Triel-HT" },
    { value: "ciber", label: "Ciber" },
];

function gravarCodigoNaUrl(codigo: string, origem: OrigemEstrutura) {
    try {
        const params = new URLSearchParams(window.location.search);
        params.set("codigo", codigo);
        if (origem === "ciber") params.set("origem", "ciber");
        else params.delete("origem");
        window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    } catch {
        /* Sem URL atualizada a consulta funciona do mesmo jeito. */
    }
}

function textoDoProgresso(progresso: ProgressoConsulta | null): string {
    if (!progresso) return "Consultando…";
    if (progresso.etapa === "estrutura") {
        return progresso.origem === "ciber" ? "Lendo estrutura no ERP (Ciber)…" : "Lendo estrutura no 3DX…";
    }
    return `Lendo roteiros no ERP ${progresso.feitos}/${progresso.total}…`;
}

/*
 * Copia o código da linha com um clique. O "Copiado" fica no próprio
 * botão por um instante -- um toast para isso seria barulho demais.
 */
function CopiarCodigoButton({ codigo }: { codigo: string }) {
    const [copiado, setCopiado] = useState(false);

    return (
        <button
            type="button"
            className={`${styles.copiarCodigoBotao} ${copiado ? styles.copiarCodigoBotaoFeito : ""}`}
            title={copiado ? "Copiado" : "Copiar código"}
            aria-label={copiado ? "Código copiado" : `Copiar código ${codigo}`}
            onClick={async (e) => {
                e.stopPropagation();
                const ok = await copiarParaAreaDeTransferencia(codigo);
                if (!ok) return;
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1500);
            }}
        >
            {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copiado && <span>Copiado</span>}
        </button>
    );
}

function PencilIcon() {
    return (
        <svg viewBox="0 0 24 24" className={styles.routeSvgIcon} aria-hidden="true">
            <path
                d="M4 20h4.4L19.7 8.7a1.6 1.6 0 0 0 0-2.3l-2.1-2.1a1.6 1.6 0 0 0-2.3 0L4 15.6V20Zm2-3.6 10.4-10.4 1.6 1.6L7.6 18H6v-1.6Z"
                fill="currentColor"
            />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg viewBox="0 0 24 24" className={styles.routeSvgIcon} aria-hidden="true">
            <path
                d="M8 21c-1.1 0-2-.9-2-2V8H5V6h4V4h6v2h4v2h-1v11c0 1.1-.9 2-2 2H8Zm0-13v11h8V8H8Zm2 2h2v7h-2v-7Zm4 0h2v7h-2v-7Z"
                fill="currentColor"
            />
        </svg>
    );
}

function RoteiroOperacaoCard({
    roteiro,
    index,
    onEdit,
    onDelete,
}: {
    roteiro: RoteiroItem;
    index: number;
    onEdit?: (roteiro: RoteiroItem) => void;
    onDelete?: (roteiro: RoteiroItem) => void;
}) {
    /*
     * Card denso: a primeira linha é o que se procura ao bater o olho
     * (sequência, operação, centro, tempo); a segunda, o resto. Início
     * e Fim só aparecem quando fogem da vigência padrão do ERP.
     */
    return (
        <div
            key={`${roteiro.COD_ITEM}-${roteiro.ALTERNATIVO}-${roteiro.SEQ}-${index}`}
            className={`${styles.roteiroCard} ${styles.roteiroCardCompacto}`}
        >
            <div className={styles.roteiroCardLinhas}>
                <div className={styles.roteiroCardLinha}>
                    <span>
                        <strong>Sequência:</strong> {roteiro.SEQ ?? "-"}
                    </span>

                    <span className={styles.roteiroCardOperacao}>
                        {roteiro.COD_OPERACAO ?? "-"} - {roteiro.DESC_OPERACAO ?? "-"}
                    </span>

                    <span>
                        <strong>Centro:</strong> {roteiro.COD_CENTRO_TRAB ?? "-"} -{" "}
                        {roteiro.DESC_CENTRO_TRAB ?? "-"}
                    </span>

                    <span>
                        <strong>Tempo:</strong> {formatarTempo(roteiro.TEMPO) || "-"}
                    </span>
                </div>

                <div className={`${styles.roteiroCardLinha} ${styles.roteiroCardLinhaSecundaria}`}>
                    <span>
                        <strong>Unidade:</strong> {roteiro.COD_UNID_MED ?? "-"} -{" "}
                        {roteiro.DESC_UNID_MED ?? "-"}
                    </span>

                    <span>
                        <strong>Apontamento:</strong>{" "}
                        {roteiro.APONTAMENTO === 1
                            ? "SIM"
                            : roteiro.APONTAMENTO === 0
                                ? "NÃO"
                                : "-"}
                    </span>

                    <span>
                        <strong>Obrigatório:</strong>{" "}
                        {roteiro.OBRIGATORIO === 1
                            ? "SIM"
                            : roteiro.OBRIGATORIO === 0
                                ? "NÃO"
                                : "-"}
                    </span>

                    {vigenciaDiferenteDoPadrao(roteiro) && (
                        <span>
                            <strong>Vigência:</strong> {roteiro.DT_INICIO ?? "-"} a{" "}
                            {roteiro.DT_FIM ?? "-"}
                        </span>
                    )}

                    <span className={styles.roteiroCardObs}>
                        <strong>Obs:</strong> {roteiro.OBSERVACAO?.trim() || "-"}
                    </span>
                </div>
            </div>

            {(onEdit || onDelete) && (
                <div className={styles.routeIconActions}>
                    {onEdit && (
                        <button
                            type="button"
                            className={styles.routeIconButton}
                            title="Editar operação"
                            aria-label="Editar operação"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(roteiro);
                            }}
                        >
                            <PencilIcon />
                        </button>
                    )}

                    {onDelete && (
                        <button
                            type="button"
                            className={`${styles.routeIconButton} ${styles.routeIconButtonDanger}`}
                            title="Deletar somente esta operação"
                            aria-label="Deletar somente esta operação"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(roteiro);
                            }}
                        >
                            <TrashIcon />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function RoteiroGrupoCard({
    tipoRoteiro,
    roteiros,
    onEditRoteiro,
    onDeleteRoteiro,
}: {
    tipoRoteiro: string;
    roteiros: RoteiroItem[];
    onEditRoteiro?: (roteiro: RoteiroItem) => void;
    onDeleteRoteiro?: (roteiro: RoteiroItem) => void;
}) {
    const [aberto, setAberto] = useState(false);

    return (
        <div className={styles.roteiroGrupoCard}>
            <button
                type="button"
                className={styles.roteiroGrupoHeader}
                onClick={(e) => {
                    e.stopPropagation();
                    setAberto((prev) => !prev);
                }}
            >
                <div>
                    <strong>{tipoRoteiro}</strong>
                    <span>{formatarQtdOperacoes(roteiros.length)}</span>
                </div>

                <span className={styles.roteiroGrupoChevron}>
                    {aberto ? "▾" : "▸"}
                </span>
            </button>

            {aberto && (
                <div className={styles.roteiroGrupoBody}>
                    {roteiros.map((roteiro, index) => (
                        <RoteiroOperacaoCard
                            key={`${roteiro.COD_ITEM}-${tipoRoteiro}-${roteiro.SEQ}-${index}`}
                            roteiro={roteiro}
                            index={index}
                            onEdit={onEditRoteiro}
                            onDelete={onDeleteRoteiro}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function RoteirosDoItem({
    item,
    roteiros,
    onEditRoteiro,
    onDeleteRoteiro,
    onDeleteRoteiroCompleto,
}: {
    item: RoteiroTreeNode;
    roteiros: RoteiroItem[];
    onEditRoteiro?: (roteiro: RoteiroItem) => void;
    onDeleteRoteiro?: (roteiro: RoteiroItem) => void;
    onDeleteRoteiroCompleto?: (item: RoteiroTreeNode) => void;
}) {
    const grupos = agruparRoteirosPorAlternativo(roteiros);

    return (
        <div className={styles.roteiroList}>
            <div className={styles.roteiroListHeader}>
                <span className={styles.roteiroListTitle}>
                    Roteiros cadastrados
                </span>

                {onDeleteRoteiroCompleto && roteiros.length > 0 && (
                    <button
                        type="button"
                        className={`${styles.routeIconButton} ${styles.routeIconButtonDanger}`}
                        title="Deletar roteiro completo deste item"
                        aria-label="Deletar roteiro completo deste item"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteRoteiroCompleto(item);
                        }}
                    >
                        <TrashIcon />
                    </button>
                )}
            </div>

            {grupos.length <= 1 ? (
                <>
                    <div className={styles.roteiroTipoUnico}>
                        Tipo roteiro: {grupos[0]?.[0] ?? "Padrão"}
                    </div>

                    {(grupos[0]?.[1] ?? roteiros).map((roteiro, index) => (
                        <RoteiroOperacaoCard
                            key={`${roteiro.COD_ITEM}-${roteiro.ALTERNATIVO}-${roteiro.SEQ}-${index}`}
                            roteiro={roteiro}
                            index={index}
                            onEdit={onEditRoteiro}
                            onDelete={onDeleteRoteiro}
                        />
                    ))}
                </>
            ) : (
                grupos.map(([tipoRoteiro, lista]) => (
                    <RoteiroGrupoCard
                        key={tipoRoteiro}
                        tipoRoteiro={tipoRoteiro}
                        roteiros={lista}
                        onEditRoteiro={onEditRoteiro}
                        onDeleteRoteiro={onDeleteRoteiro}
                    />
                ))
            )}
        </div>
    );
}

/*
 * Conferência da estrutura do 3DX contra a do ERP. Roda DEPOIS que a
 * árvore e os roteiros já estão na tela, para não atrasar quem só veio
 * cadastrar roteiro.
 */
type EstadoValidacaoErp =
    | { estado: "inativo" }
    | { estado: "validando" }
    | { estado: "pronto"; resultado: ResultadoValidacaoEstrutura }
    | { estado: "erro"; mensagem: string };

const SEM_DIVERGENCIAS: ReadonlyMap<string, TipoDivergencia> = new Map();

/*
 * Conferência com o ERP como um botão compacto no cabeçalho da árvore,
 * com a lista FLUTUANDO por cima (mesmo padrão do "Ver pais no ERP" do
 * cadastro). O bloco grande acima da árvore empurrava tudo para baixo
 * -- e quem só veio cadastrar roteiro não precisa dele à vista.
 */
function ConferenciaErp({
    validacao,
    onIrParaNo,
    onTentarDeNovo,
}: {
    validacao: EstadoValidacaoErp;
    /* Leva até o nó na árvore (expande os pais, rola e destaca). */
    onIrParaNo: (id: string) => void;
    onTentarDeNovo: () => void;
}) {
    const [aberto, setAberto] = useState(false);
    const caixaRef = useRef<HTMLDivElement | null>(null);

    /* Fecha ao clicar fora ou com Esc -- mesmo padrão dos menus do portal. */
    useEffect(() => {
        if (!aberto) return;

        function aoClicarFora(evento: MouseEvent) {
            if (caixaRef.current && !caixaRef.current.contains(evento.target as Node)) {
                setAberto(false);
            }
        }

        function aoTeclar(evento: KeyboardEvent) {
            if (evento.key === "Escape") {
                evento.stopPropagation();
                setAberto(false);
            }
        }

        document.addEventListener("mousedown", aoClicarFora);
        document.addEventListener("keydown", aoTeclar, true);

        return () => {
            document.removeEventListener("mousedown", aoClicarFora);
            document.removeEventListener("keydown", aoTeclar, true);
        };
    }, [aberto]);

    if (validacao.estado === "inativo") return null;

    if (validacao.estado === "validando") {
        /* Nada a abrir ainda: só avisa que a marcação está a caminho. */
        return (
            <span
                className={`${styles.conferenciaErpBotao} ${styles.conferenciaErpCarregando}`}
                title="A árvore já pode ser usada. Os itens que não estiverem no ERP serão marcados quando a conferência terminar."
                aria-live="polite"
            >
                <LoaderCircle aria-hidden="true" className={styles.conferenciaErpGirando} />
                Conferindo no ERP…
            </span>
        );
    }

    const divergencias = validacao.estado === "pronto" ? validacao.resultado.divergencias : [];
    const ligacoesConferidas =
        validacao.estado === "pronto" ? validacao.resultado.ligacoesConferidas : 0;
    const comProblema = validacao.estado === "erro" || divergencias.length > 0;

    const tom =
        validacao.estado === "erro"
            ? styles.conferenciaErpErro
            : divergencias.length > 0
              ? styles.conferenciaErpDivergente
              : styles.conferenciaErpOk;

    const rotulo =
        validacao.estado === "erro"
            ? "Não foi possível conferir"
            : ligacoesConferidas === 0
              ? "Nada a conferir no ERP"
              : divergencias.length === 0
                ? "Estrutura confere com o ERP"
                : divergencias.length === 1
                  ? "1 item fora do ERP"
                  : `${divergencias.length} itens fora do ERP`;

    return (
        <div className={styles.paisErp} ref={caixaRef}>
            <button
                type="button"
                className={`${styles.conferenciaErpBotao} ${tom}`}
                aria-expanded={aberto}
                aria-haspopup="dialog"
                onClick={() => setAberto((prev) => !prev)}
            >
                {comProblema ? <TriangleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                {rotulo}
                <ChevronDown
                    aria-hidden="true"
                    className={aberto ? styles.iconeGirado180 : undefined}
                />
            </button>

            {aberto && (
                <div
                    className={`${styles.paisErpPainel} ${styles.paisErpPainelDireita}`}
                    role="dialog"
                    aria-label="Conferência da estrutura com o ERP"
                >
                    <strong className={styles.paisErpTitulo}>
                        Estrutura do 3DX x ERP
                        {ligacoesConferidas > 0 && (
                            <span>
                                {ligacoesConferidas === 1
                                    ? "1 ligação conferida"
                                    : `${ligacoesConferidas} ligações conferidas`}
                            </span>
                        )}
                    </strong>

                    {validacao.estado === "erro" ? (
                        <>
                            {/* Falhar em silêncio pareceria "tudo certo" -- e não é isso. */}
                            <p className={styles.recursoErro}>
                                {validacao.mensagem} Sem a conferência nenhum item é marcado, o que não
                                quer dizer que a estrutura esteja igual à do ERP.
                            </p>
                            <div>
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setAberto(false);
                                        onTentarDeNovo();
                                    }}
                                >
                                    Tentar de novo
                                </Button>
                            </div>
                        </>
                    ) : ligacoesConferidas === 0 ? (
                        <p className={styles.recursoAviso}>
                            Este item não tem filhos debaixo de itens fabricados.
                        </p>
                    ) : divergencias.length === 0 ? (
                        <p className={styles.recursoAviso}>
                            As {ligacoesConferidas} ligações de itens fabricados batem com a estrutura do ERP.
                        </p>
                    ) : (
                        /* Lista inteira, com a rolagem do próprio painel: cortar
                           escondia justamente o que a pessoa precisava achar.
                           Cada linha leva até o item na árvore. */
                        <ul className={styles.paisErpLista}>
                            {divergencias.map((d) => (
                                <li key={`${d.codigoPai}>${d.codigoFilho}`}>
                                    <button
                                        type="button"
                                        className={styles.conferenciaErpItem}
                                        title="Mostrar este item na árvore"
                                        onClick={() => {
                                            setAberto(false);
                                            onIrParaNo(d.noId);
                                        }}
                                    >
                                        <strong>
                                            {d.codigoPai} › {d.codigoFilho}
                                        </strong>
                                        {d.descricaoFilho && <span>{d.descricaoFilho}</span>}
                                        {(d.tipo === "vencida" || d.instancias > 1) && (
                                            <small className={styles.paisErpDetalhe}>
                                                {[
                                                    d.tipo === "vencida" ? "vencido no ERP" : "",
                                                    d.instancias > 1 ? `${d.instancias} vezes na árvore` : "",
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </small>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {validacao.estado === "pronto" && (
                        <p className={styles.paisErpDetalhe}>
                            Só são conferidos os filhos de itens fabricados: item comprado não tem estrutura no ERP.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

/*
 * Expansão e detalhes moram no componente pai (conjuntos de ids), não
 * em cada nó: assim sobrevivem à troca de filtro (o nó filtrado é outro
 * objeto, mas o id é o mesmo) e o pai consegue abrir o caminho até um
 * item ao localizar. Consultar um Set é O(1) por nó.
 */
function TreeNode({
    node,
    raiz = false,
    expandidos,
    detalhesAbertos,
    destacadoId,
    onAlternarExpandido,
    onAlternarDetalhes,
    onCreateRoteiro,
    onEditRoteiro,
    onDeleteRoteiro,
    onDeleteRoteiroCompleto,
    onOpenAtencao,
    divergenciasErp,
}: {
    node: RoteiroTreeNode;
    /* A raiz fica sempre aberta -- recolhê-la esconderia a árvore toda. */
    raiz?: boolean;
    expandidos: ReadonlySet<string>;
    detalhesAbertos: ReadonlySet<string>;
    destacadoId: string | null;
    onAlternarExpandido: (id: string) => void;
    onAlternarDetalhes: (id: string) => void;
    /* id do nó -> divergência com o ERP. Vazio enquanto não conferiu. */
    divergenciasErp: ReadonlyMap<string, TipoDivergencia>;
    onCreateRoteiro: (item: RoteiroTreeNode) => void;
    onEditRoteiro: (item: RoteiroTreeNode, roteiro: RoteiroItem) => void;
    onDeleteRoteiro: (item: RoteiroTreeNode, roteiro: RoteiroItem) => void;
    onDeleteRoteiroCompleto: (item: RoteiroTreeNode) => void;
    onOpenAtencao: (item: RoteiroTreeNode) => void;
}) {
    const expanded = raiz || expandidos.has(node.id);
    const showDetails = detalhesAbertos.has(node.id);

    const hasChildren = node.children.length > 0;
    const tipoItem = obterTipoItem(node);
    const semRoteiro = tipoItem === "fabricado" && node.roteiros.length === 0;
    const comAtencao =
        tipoItem === "fabricado" && !semRoteiro && roteiroComAtencao(node);
    const resumoOperacoes = resumirOperacoes(node.roteiros);
    const divergenciaErp = divergenciasErp.get(node.id);
    const tipoExibido = tipoBrutoDoItem(node);
    /* Só há o que abrir quando existe roteiro ou dá para cadastrar um. */
    const temDetalhes = node.roteiros.length > 0 || tipoItem === "fabricado";
    const detalhesId = `detalhes-${node.id}`;

    return (
        <div className={styles.treeNode}>
            <div
                data-node-id={node.id}
                className={[
                    styles.treeRow,
                    semRoteiro ? styles.treeRowWarning : "",
                    comAtencao ? styles.treeRowAttention : "",
                    temDetalhes ? styles.treeRowComDetalhes : styles.treeRowSemDetalhes,
                    showDetails ? styles.treeRowAberta : "",
                    destacadoId === node.id ? styles.treeRowDestacada : "",
                ].join(" ")}
                onClick={() => {
                    if (temDetalhes) onAlternarDetalhes(node.id);
                }}
            >
                {hasChildren && !raiz ? (
                    <button
                        type="button"
                        className={`${styles.expandButton} ${styles.expandButtonFilhos}`}
                        aria-expanded={expanded}
                        aria-label={
                            expanded
                                ? `Recolher os itens filhos de ${node.codigoNormalizado}`
                                : `Mostrar os ${node.children.length} itens filhos de ${node.codigoNormalizado}`
                        }
                        title={
                            expanded
                                ? "Recolher itens filhos"
                                : `Mostrar ${node.children.length} itens filhos`
                        }
                        onClick={(e) => {
                            e.stopPropagation();
                            onAlternarExpandido(node.id);
                        }}
                    >
                        <ChevronRight
                            aria-hidden="true"
                            className={expanded ? styles.iconeGirado90 : undefined}
                        />
                    </button>
                ) : (
                    /* Folha (ou a raiz, sempre aberta): nada a expandir,
                       então nem é botão. */
                    <span
                        className={`${styles.expandButton} ${styles.expandButtonFolha}`}
                        aria-hidden="true"
                    >
                        {hasChildren ? <ChevronDown /> : "•"}
                    </span>
                )}

                <div className={styles.treeContent}>
                    <div className={styles.nodeTopLine}>
                        <div className={styles.nodeInfo}>
                            <strong className={styles.nodeCode}>
                                {node.codigoNormalizado || "-"}{" "}
                                {node.revisao ? `| ${node.revisao}` : ""}
                            </strong>

                            {node.codigoNormalizado && (
                                <CopiarCodigoButton codigo={node.codigoNormalizado} />
                            )}

                            {semRoteiro ? (
                                /* A propria badge e o atalho: quem esta varrendo a
                                   estrutura clica no que falta, no lugar de
                                   procurar o botao do lado. */
                                <button
                                    type="button"
                                    className={styles.badgeWarningButton}
                                    title="Cadastrar o roteiro deste item"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCreateRoteiro(node);
                                    }}
                                >
                                    Sem roteiro
                                </button>
                            ) : (
                                resumoOperacoes && (
                                    <span
                                        className={
                                            resumoOperacoes.soAlternativo
                                                ? styles.badgeSoAlternativo
                                                : styles.badgeSuccess
                                        }
                                        title={resumoOperacoes.titulo}
                                    >
                                        {resumoOperacoes.texto}
                                    </span>
                                )
                            )}

                            {divergenciaErp && (
                                <span
                                    className={styles.badgeErp}
                                    title={
                                        divergenciaErp === "vencida"
                                            ? "A ligação com o item pai existe no ERP, mas está fora da validade."
                                            : "A ligação com o item pai não existe na estrutura do ERP."
                                    }
                                >
                                    {divergenciaErp === "vencida" ? "Vencido no ERP" : "Não tem no ERP"}
                                </span>
                            )}

                            {comAtencao && (
                                <button
                                    type="button"
                                    className={styles.badgeAttentionButton}
                                    title="Revisão do roteiro divergente"
                                    aria-label="Revisão do roteiro divergente"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenAtencao(node);
                                    }}
                                >
                                    Atenção
                                </button>
                            )}

                            {/* Sem tipo nem no 3DX nem no ERP: a linha só não
                                mostra a badge -- "sem tipo" não é um tipo. */}
                            {tipoExibido && (
                                <span
                                    className={styles.nodeType}
                                    title={
                                        tipoVeioDoErp(node)
                                            ? "O 3DX não tem o tipo desta revisão; este é o do cadastro do item no ERP."
                                            : undefined
                                    }
                                >
                                    Tipo: {formatarTipo(tipoExibido)}
                                    {tipoVeioDoErp(node) && " (ERP)"}
                                </span>
                            )}
                        </div>

                        {/*
                            Ações da linha agrupadas na ponta direita (2D, 3D,
                            + Roteiro e Operações), sempre na mesma coluna:
                            soltos entre as badges, o 2D/3D caíam no meio da
                            linha e mudavam de lugar conforme as badges do item.
                        */}
                        <div className={styles.nodeAcoes}>
                            <AbrirPdfItemButton
                                codigo={codigoDoPdf(node)}
                                onErro={(mensagem) => {
                                    alert(mensagem);
                                }}
                            />
                            <Abrir3DPlayButton
                                item={node}
                                onErro={(mensagem) => {
                                    alert(mensagem);
                                }}
                            />

                            {/*
                                Atalho para quem esta varrendo a estrutura atras do
                                que falta: sem isto, cadastrar o roteiro de um item
                                exige abrir os detalhes dele antes. So aparece quando
                                nao ha roteiro -- o item que ja tem um continua com o
                                botao de dentro dos detalhes.
                            */}
                            {semRoteiro && (
                                <button
                                    type="button"
                                    className={styles.addRoteiroButton}
                                    title="Cadastrar roteiro deste item"
                                    aria-label="Cadastrar roteiro deste item"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCreateRoteiro(node);
                                    }}
                                >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path
                                            d="M12 5v14M5 12h14"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.4"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                    Roteiro
                                </button>
                            )}

                            {/*
                                O clique na linha toda abre os detalhes; este botão
                                é o que diz isso (e o que o teclado alcança). Fica
                                na ponta direita, longe do botão de filhos.
                            */}
                            {temDetalhes && (
                                <button
                                    type="button"
                                    className={styles.detalhesToggle}
                                    aria-expanded={showDetails}
                                    aria-controls={detalhesId}
                                    title={showDetails ? "Ocultar operações" : "Ver operações do item"}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAlternarDetalhes(node.id);
                                    }}
                                >
                                    Operações
                                    <ChevronDown
                                        aria-hidden="true"
                                        className={showDetails ? styles.iconeGirado180 : undefined}
                                    />
                                </button>
                            )}
                        </div>
                    </div>

                    <span className={styles.nodeDescription}>
                        {node.descricaoNormalizada || "Sem descrição"}
                    </span>

                    {showDetails && (
                        /* Clique dentro dos detalhes (ler, selecionar texto)
                           não fecha os detalhes: só a linha e o botão. */
                        <div
                            id={detalhesId}
                            className={styles.detalhesItem}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {node.roteiros.length > 0 && (
                                <RoteirosDoItem
                                    item={node}
                                    roteiros={node.roteiros}
                                    onEditRoteiro={(roteiro) => onEditRoteiro(node, roteiro)}
                                    onDeleteRoteiro={(roteiro) => onDeleteRoteiro(node, roteiro)}
                                    onDeleteRoteiroCompleto={onDeleteRoteiroCompleto}
                                />
                            )}

                            {tipoItem === "fabricado" && (
                                <button
                                    type="button"
                                    className={styles.createRouteButton}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCreateRoteiro(node);
                                    }}
                                >
                                    + Cadastrar operação
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {hasChildren && expanded && (
                <div className={styles.treeChildren}>
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            expandidos={expandidos}
                            detalhesAbertos={detalhesAbertos}
                            destacadoId={destacadoId}
                            onAlternarExpandido={onAlternarExpandido}
                            onAlternarDetalhes={onAlternarDetalhes}
                            onCreateRoteiro={onCreateRoteiro}
                            onEditRoteiro={onEditRoteiro}
                            onDeleteRoteiro={onDeleteRoteiro}
                            onDeleteRoteiroCompleto={onDeleteRoteiroCompleto}
                            onOpenAtencao={onOpenAtencao}
                            divergenciasErp={divergenciasErp}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}


type Toast = {
    id: number;
    mensagem: string;
    tipo: "sucesso" | "erro" | "info";
    retornoErp?: any;
};

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
                            : toast.tipo === "info"
                            ? {
                                background: "var(--info-bg)",
                                color: "var(--info-text)",
                                border: "1px solid var(--info-border)",
                            }
                            : {
                                background: "var(--danger-bg)",
                                color: "var(--danger-text)",
                                border: "1px solid var(--danger-border)",
                            }),
                    }}
                    title={toast.retornoErp ? "Clique para ver o retorno completo" : ""}
                >
                    <span>
                        {toast.tipo === "sucesso" ? "✓" : toast.tipo === "info" ? "ℹ" : "✕"}&nbsp;&nbsp;{toast.mensagem}
                        {toast.retornoErp && (
                            <small style={{ display: "block", marginTop: "4px", opacity: 0.75 }}>
                                Clique para ver o retorno completo
                            </small>
                        )}
                    </span>

                    <button
                        type="button"
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

function montarRetornoErro(mensagem: string, error: unknown) {
    return {
        success: false,
        message: mensagem,
        error:
            error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                }
                : error,
    };
}

export default function CadastroRoteiro({
    modoAbertura,
}: {
    /* Onde o PDF e o 3D abrem -- preferência da pessoa em Minha conta. */
    modoAbertura: ModoAberturaArquivos;
}) {
    /* ?codigo= na URL: a tela abre já consultando (ver efeito abaixo). */
    const searchParams = useSearchParams();
    const codigoDaUrl = (searchParams.get("codigo") ?? "").trim();

    const [codigoPai, setCodigoPai] = useState(codigoDaUrl);
    /*
     * Ciber: estruturas que não existem no 3DX. Marcado, a estrutura vem
     * do ERP -- só para item pai com item base 2316 -- e o resto da tela
     * segue igual. Vai junto na URL (?origem=ciber).
     */
    const [ciber, setCiber] = useState(searchParams.get("origem") === "ciber");
    /* A origem da consulta exibida (a do switch pode ter mudado depois). */
    const [origemConsulta, setOrigemConsulta] = useState<OrigemEstrutura>("3dx");
    const [loading, setLoading] = useState(false);
    /* Erro do campo (código vazio), mostrado no card de pesquisa. */
    const [erroCampo, setErroCampo] = useState("");
    /*
     * Erro da CONSULTA, mostrado na área da árvore com "Tentar de novo".
     * Erros de ações posteriores (exclusão, releitura depois de gravar)
     * vão para toast -- antes iam para cá e apareciam no card de
     * pesquisa como se a consulta tivesse falhado.
     */
    const [erroConsulta, setErroConsulta] = useState<{ mensagem: string; codigo: string } | null>(
        null
    );
    const [progresso, setProgresso] = useState<ProgressoConsulta | null>(null);
    const [mostrarSemRoteiro, setMostrarSemRoteiro] = useState(false);
    const [mostrarComAtencao, setMostrarComAtencao] = useState(false);
    const [filtrosAbertos, setFiltrosAbertos] = useState(false);
    const [tiposSelecionados, setTiposSelecionados] = useState<string[]>([TIPO_FILTRO_PADRAO]);

    /* Estado da árvore (ver TreeNode): ids abertos, ids com detalhes à
       mostra e o nó destacado pela última navegação. `vez` muda a cada
       navegação, para rolar de novo mesmo quando o alvo é o mesmo. */
    const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(() => new Set());
    const [detalhesAbertos, setDetalhesAbertos] = useState<ReadonlySet<string>>(() => new Set());
    const [destaque, setDestaque] = useState<{ id: string; vez: number } | null>(null);

    /* "Localizar na estrutura": digitado x aplicado (debounce de 400ms). */
    const [termoLocalizar, setTermoLocalizar] = useState("");
    const [termoLocalizarAplicado, setTermoLocalizarAplicado] = useState("");
    const [indiceLocalizado, setIndiceLocalizado] = useState(0);
    const timerLocalizarRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [exportando, setExportando] = useState(false);
    const [legendaAberta, setLegendaAberta] = useState(false);

    const [modalSemRoteiroOpen, setModalSemRoteiroOpen] = useState(false);
    const [modalComAtencaoOpen, setModalComAtencaoOpen] = useState(false);
    const [atencaoModalItem, setAtencaoModalItem] =
        useState<RoteiroTreeNode | null>(null);

    const [itemCadastroOperacao, setItemCadastroOperacao] =
        useState<RoteiroTreeNode | null>(null);

    /* Observação que o pai imediato já tem no roteiro dele, usada como
       valor inicial ao cadastrar o filho (ver primeiraObservacaoDoRoteiro). */
    const [observacaoHerdada, setObservacaoHerdada] = useState("");
    /* O pai do item aberto no modal, so para o cabecalho se situar. */
    const [validacaoErp, setValidacaoErp] = useState<EstadoValidacaoErp>({ estado: "inativo" });
    /* Consulta mais recente: resposta de uma consulta velha é descartada. */
    const consultaAtualRef = useRef(0);
    /*
     * A consulta automática do ?codigo= já foi feita (ou nem precisa:
     * a pessoa consultou à mão). Sem marcar na consulta manual, o
     * replaceState dela mudava o ?codigo= e o efeito de abertura
     * disparava uma segunda consulta igual -- hoje só o `loading` a
     * segurava, e uma falha rápida da primeira a deixava passar.
     */
    const consultouDaUrlRef = useRef(false);
    const [paiCadastroOperacao, setPaiCadastroOperacao] =
        useState<RoteiroTreeNode | null>(null);

    const { toasts, exibirToast, removerToast } = useToast();
    const [retornoErpModal, setRetornoErpModal] = useState<any>(null);

    const [roteiroEdicao, setRoteiroEdicao] = useState<RoteiroItem | null>(null);

    const [roteiroExclusao, setRoteiroExclusao] = useState<{
        item: RoteiroTreeNode;
        roteiro: RoteiroItem;
    } | null>(null);

    const [roteiroCompletoExclusao, setRoteiroCompletoExclusao] =
        useState<RoteiroTreeNode | null>(null);

    const [deletando, setDeletando] = useState(false);

    const [resultado, setResultado] = useState<{
        codigo: string;
        totalItens: number;
        totalInstancias: number;
        tree: RoteiroTreeNode;
    } | null>(null);

    /*
     * Relê do ERP o roteiro de um item e aplica em TODAS as ocorrências
     * dele na árvore (o mesmo código aparece em vários conjuntos). Se o
     * ERP falhar, avisa por toast e deixa a árvore como estava -- em vez
     * de pintar "Sem roteiro" num item que tem roteiro.
     */
    async function atualizarRoteirosDoItem(codItem: string) {
        const codigoNormalizado = String(codItem ?? "").trim();

        if (!codigoNormalizado) return;

        const consulta = consultaAtualRef.current;

        try {
            const roteirosAtualizados = await buscarRoteirosDoItem(codigoNormalizado);

            /* Outra estrutura foi consultada enquanto isto voltava. */
            if (consultaAtualRef.current !== consulta) return;

            setResultado((prev) => {
                if (!prev) return prev;

                function atualizarNode(node: RoteiroTreeNode): RoteiroTreeNode {
                    const mesmoItem =
                        String(node.codigoNormalizado ?? "").trim() === codigoNormalizado;

                    return {
                        ...node,
                        roteiros: mesmoItem ? roteirosAtualizados : node.roteiros,
                        children: node.children.map(atualizarNode),
                    };
                }

                return {
                    ...prev,
                    tree: atualizarNode(prev.tree),
                };
            });
        } catch (error) {
            console.error(error);

            if (consultaAtualRef.current !== consulta) return;

            const mensagem =
                error instanceof Error
                    ? error.message
                    : "Ocorreu erro ao atualizar o item na estrutura.";

            exibirToast(
                `Não foi possível atualizar o roteiro de ${codigoNormalizado} na árvore. ${mensagem} Consulte de novo para ver o que está no ERP.`,
                "erro",
                montarRetornoErro(mensagem, error)
            );
        }
    }

    /*
     * Corrida entre consultas: escolhemos BLOQUEAR -- enquanto uma
     * consulta carrega, Enter e o botão não disparam outra (o botão já
     * ficava desabilitado; o Enter passava). Ainda assim cada resposta
     * confere se é da consulta mais recente antes de mexer na tela
     * (consultaAtualRef), o que cobre dois Enter no mesmo instante e as
     * leituras que chegam depois (descrições, conferência, releituras).
     */
    /*
     * Conferência com o ERP de uma consulta. Separada da consulta para o
     * "Tentar de novo" do painel refazer só ela, sem recarregar a árvore.
     * `consulta` é a da árvore na tela: resposta de uma consulta velha é
     * descartada, igual às outras leituras.
     */
    function conferirNoErp(tree: RoteiroTreeNode, consulta: number) {
        setValidacaoErp({ estado: "validando" });

        validarEstruturaNoErp(tree)
            .then((resultadoErp) => {
                if (consultaAtualRef.current !== consulta) return;
                setValidacaoErp({ estado: "pronto", resultado: resultadoErp });
            })
            .catch((erroErp) => {
                if (consultaAtualRef.current !== consulta) return;
                console.error(erroErp);
                setValidacaoErp({
                    estado: "erro",
                    mensagem:
                        erroErp instanceof Error ? erroErp.message : "Erro de comunicação com o ERP.",
                });
            });
    }

    async function handleBuscar(codigoInformado: string = codigoPai) {
        const codigo = codigoInformado.trim();

        if (!codigo) {
            setErroCampo("Informe o código do item pai.");
            return;
        }

        if (loading) return;

        consultouDaUrlRef.current = true;

        /* Busca do "Localizar" ainda no debounce é da árvore anterior. */
        if (timerLocalizarRef.current) clearTimeout(timerLocalizarRef.current);

        const consulta = ++consultaAtualRef.current;

        try {
            setLoading(true);
            setCodigoPai(codigo);
            setErroCampo("");
            setErroConsulta(null);
            setProgresso(null);
            setResultado(null);
            setValidacaoErp({ estado: "inativo" });
            /* Volta no padrao, nao em branco: cada consulta nova comeca
               filtrada em Fabricado, igual a primeira. */
            setTiposSelecionados([TIPO_FILTRO_PADRAO]);
            setExpandidos(new Set());
            setDetalhesAbertos(new Set());
            setDestaque(null);
            setTermoLocalizar("");
            setTermoLocalizarAplicado("");
            setIndiceLocalizado(0);
            setMostrarSemRoteiro(false);
            setMostrarComAtencao(false);
            setFiltrosAbertos(false);
            setModalSemRoteiroOpen(false);
            setModalComAtencaoOpen(false);
            setLegendaAberta(false);
            setAtencaoModalItem(null);
            setItemCadastroOperacao(null);
            setRoteiroEdicao(null);
            setRoteiroExclusao(null);
            setRoteiroCompletoExclusao(null);
            setRetornoErpModal(null);
            const origem: OrigemEstrutura = ciber ? "ciber" : "3dx";
            gravarCodigoNaUrl(codigo, origem);

            const dados = await buscarEstruturaComRoteiros(
                codigo,
                (andamento) => {
                    if (consultaAtualRef.current === consulta) setProgresso(andamento);
                },
                origem
            );

            /* Uma consulta mais nova já assumiu a tela: esta não mexe em nada. */
            if (consultaAtualRef.current !== consulta) return;

            setResultado(dados);
            setOrigemConsulta(origem);

            /*
             * Item sem descrição ou sem tipo no 3DX: completa com o
             * cadastro do ERP, sem segurar a árvore. Grava no próprio nó,
             * então árvore, tabelas e modais passam a mostrar o mesmo. O
             * tipo vai para `tipoErp`; o `tipoint` bruto fica como veio.
             */
            const paraCompletar = codigosParaCompletarNoErp(dados.tree);

            if (paraCompletar.size > 0) {
                buscarDadosItensNoErp(paraCompletar).then((dadosErp) => {
                    if (consultaAtualRef.current !== consulta || dadosErp.size === 0) return;

                    function completar(node: RoteiroTreeNode): RoteiroTreeNode {
                        const erp = dadosErp.get(node.codigoNormalizado);

                        return {
                            ...node,
                            descricaoNormalizada:
                                node.descricaoNormalizada || erp?.descricao || "",
                            tipoErp: String(node.tipoint ?? "").trim()
                                ? node.tipoErp
                                : erp?.tipo || node.tipoErp,
                            children: node.children.map(completar),
                        };
                    }

                    setResultado((prev) => (prev ? { ...prev, tree: completar(prev.tree) } : prev));
                });
            }

            /* Sem await: a árvore aparece já, a conferência chega depois.
               Ciber não tem 3DX para conferir com o ERP. */
            if (origem === "3dx") conferirNoErp(dados.tree, consulta);
        } catch (error) {
            console.error(error);

            if (consultaAtualRef.current !== consulta) return;

            setErroConsulta({
                mensagem:
                    error instanceof Error
                        ? error.message
                        : "Erro ao consultar estrutura e roteiros.",
                codigo,
            });
        } finally {
            if (consultaAtualRef.current === consulta) {
                setLoading(false);
                setProgresso(null);
            }
        }
    }

    /*
     * Abrir a tela com ?codigo= consulta sozinho, uma vez. O ref segura
     * as voltas seguintes do efeito (a própria consulta regrava a URL, e
     * o handleBuscar muda a cada render).
     */
    const handleBuscarRef = useRef(handleBuscar);

    useEffect(() => {
        handleBuscarRef.current = handleBuscar;
    });

    useEffect(() => {
        if (consultouDaUrlRef.current || !codigoDaUrl) return;

        /* Fora do corpo do efeito: a consulta mexe em estado logo de
           cara. O ref só vira dentro do quadro -- no StrictMode o efeito
           monta, desmonta (cancelando o quadro) e monta de novo. */
        const quadro = requestAnimationFrame(() => {
            consultouDaUrlRef.current = true;
            void handleBuscarRef.current(codigoDaUrl);
        });

        return () => cancelAnimationFrame(quadro);
    }, [codigoDaUrl]);

    async function confirmarExclusaoOperacao() {
        if (!roteiroExclusao) return;

        const { item, roteiro } = roteiroExclusao;

        try {
            setDeletando(true);

            const retornoExclusaoOperacao = await deletarOperacaoRoteiro({
                codItem: item.codigoNormalizado,
                alternativo: alternativoParaNumero(roteiro.ALTERNATIVO),
                seq: Number(roteiro.SEQ),
            });

            setResultado((prev) => {
                if (!prev) return prev;

                /* Pelo código, não pelo id: o mesmo item aparece em vários
                   conjuntos, e todas as ocorrências têm o mesmo roteiro. */
                function removerOperacao(node: RoteiroTreeNode): RoteiroTreeNode {
                    const mesmoItem = node.codigoNormalizado === item.codigoNormalizado;

                    return {
                        ...node,
                        roteiros: mesmoItem
                            ? node.roteiros.filter((r) => {
                                const mesmaSeq = Number(r.SEQ) === Number(roteiro.SEQ);
                                const mesmoAlternativo =
                                    alternativoParaNumero(r.ALTERNATIVO) ===
                                    alternativoParaNumero(roteiro.ALTERNATIVO);

                                return !(mesmaSeq && mesmoAlternativo);
                            })
                            : node.roteiros,
                        children: node.children.map(removerOperacao),
                    };
                }

                return {
                    ...prev,
                    tree: removerOperacao(prev.tree),
                };
            });

            exibirToast(
                "Operação deletada com sucesso.",
                "sucesso",
                retornoExclusaoOperacao ?? {
                    success: true,
                    message: "Operação deletada com sucesso.",
                    item: item.codigoNormalizado,
                    alternativo: alternativoParaNumero(roteiro.ALTERNATIVO),
                    seq: Number(roteiro.SEQ),
                }
            );

            setRoteiroExclusao(null);

            /* Confirma com o ERP o que ficou (a remoção local é só para a
               tela responder na hora). */
            void atualizarRoteirosDoItem(item.codigoNormalizado);
        } catch (error) {
            console.error(error);

            const mensagem =
                error instanceof Error
                    ? error.message
                    : "Erro ao deletar operação do roteiro.";

            exibirToast(mensagem, "erro", montarRetornoErro(mensagem, error));
        } finally {
            setDeletando(false);
        }
    }

    async function confirmarExclusaoRoteiroCompleto() {
        if (!roteiroCompletoExclusao) return;

        const item = roteiroCompletoExclusao;

        try {
            setDeletando(true);

            const retornoExclusaoRoteiroCompleto = await deletarRoteiroCompleto({
                codItem: item.codigoNormalizado,
            });

            setResultado((prev) => {
                if (!prev) return prev;

                /* Todas as ocorrências do código, não só a clicada. */
                function removerRoteiroCompleto(node: RoteiroTreeNode): RoteiroTreeNode {
                    const mesmoItem = node.codigoNormalizado === item.codigoNormalizado;

                    return {
                        ...node,
                        roteiros: mesmoItem ? [] : node.roteiros,
                        children: node.children.map(removerRoteiroCompleto),
                    };
                }

                return {
                    ...prev,
                    tree: removerRoteiroCompleto(prev.tree),
                };
            });

            exibirToast(
                "Roteiro completo deletado com sucesso.",
                "sucesso",
                retornoExclusaoRoteiroCompleto ?? {
                    success: true,
                    message: "Roteiro completo deletado com sucesso.",
                    item: item.codigoNormalizado,
                    totalOperacoes: item.roteiros.length,
                }
            );

            setRoteiroCompletoExclusao(null);

            void atualizarRoteirosDoItem(item.codigoNormalizado);
        } catch (error) {
            console.error(error);

            const mensagem =
                error instanceof Error
                    ? error.message
                    : "Erro ao deletar roteiro completo.";

            exibirToast(mensagem, "erro", montarRetornoErro(mensagem, error));
        } finally {
            setDeletando(false);
        }
    }

    const tiposDisponiveis = useMemo(() => {
        const tipos = coletarTiposItens(resultado?.tree ?? null);

        /*
         * Tipo marcado continua na lista mesmo que a estrutura consultada
         * nao tenha nenhum item dele -- do contrario o filtro ficaria
         * ligado sem checkbox para desligar, escondendo a arvore inteira.
         */
        for (const tipo of tiposSelecionados) {
            if (!tipos.has(tipo)) tipos.set(tipo, formatarTipo(tipo));
        }

        return Array.from(tipos.entries()).sort((a, b) =>
            a[1].localeCompare(b[1], "pt-BR")
        );
    }, [resultado, tiposSelecionados]);

    const arvoreExibida = useMemo(() => {
        if (!resultado?.tree) return null;

        let tree: RoteiroTreeNode | null = resultado.tree;

        if (tiposSelecionados.length > 0) {
            tree = filtrarPorTipo(tree, tiposSelecionados);
        }

        if (tree && mostrarSemRoteiro) {
            tree = filtrarSemRoteiro(tree);
        }

        if (tree && mostrarComAtencao) {
            tree = filtrarComAtencao(tree);
        }

        return tree;
    }, [resultado, mostrarSemRoteiro, mostrarComAtencao, tiposSelecionados]);

    const totalItensFiltrado = useMemo(() => {
        return contarItensUnicos(arvoreExibida);
    }, [arvoreExibida]);

    const totalSemRoteiroFiltrado = useMemo(() => {
        return contarItensSemRoteiro(arvoreExibida);
    }, [arvoreExibida]);

    const totalComAtencaoFiltrado = useMemo(() => {
        return contarItensComAtencao(arvoreExibida);
    }, [arvoreExibida]);

    const itensSemRoteiro = useMemo(() => {
        return listarItensSemRoteiroUnicos(arvoreExibida);
    }, [arvoreExibida]);

    const itensComAtencao = useMemo(() => {
        return listarItensComAtencaoUnicos(arvoreExibida);
    }, [arvoreExibida]);

    function toggleTipo(tipo: string, checked: boolean) {
        setTiposSelecionados((prev) => {
            if (checked) return [...prev, tipo];
            return prev.filter((item) => item !== tipo);
        });
    }

    const filtrosAplicados =
        mostrarSemRoteiro || mostrarComAtencao || tiposSelecionados.length > 0;

    const totalItensEstrutura = useMemo(() => {
        return contarItensUnicos(resultado?.tree ?? null);
    }, [resultado]);

    const itensOcultosPelosFiltros = Math.max(totalItensEstrutura - totalItensFiltrado, 0);

    /* "Fabricado · Sem roteiro" -- o que está ligado, em uma linha. */
    const descricaoFiltros = [
        tiposSelecionados
            .map((tipo) => formatarTipo(tipo))
            .sort((a, b) => a.localeCompare(b, "pt-BR"))
            .join(", "),
        mostrarSemRoteiro ? "Sem roteiro" : "",
        mostrarComAtencao ? "Com atenção" : "",
    ]
        .filter(Boolean)
        .join(" · ");

    const divergenciasExibidas =
        validacaoErp.estado === "pronto" ? validacaoErp.resultado.porNo : SEM_DIVERGENCIAS;

    function limparFiltros() {
        setTiposSelecionados([]);
        setMostrarSemRoteiro(false);
        setMostrarComAtencao(false);
    }

    /*
     * "Sem roteiro" e "Com atenção" se excluem (um item com atenção tem
     * roteiro); marcar um desmarca o outro. Ligar qualquer um abre a
     * árvore inteira, como antes -- o que sobra é justamente o que se
     * quer ver.
     */
    function alternarFiltroSemRoteiro(checked: boolean) {
        setMostrarSemRoteiro(checked);
        if (!checked) return;
        setMostrarComAtencao(false);
        setExpandidos(coletarIdsComFilhos(resultado?.tree ?? null));
    }

    function alternarFiltroComAtencao(checked: boolean) {
        setMostrarComAtencao(checked);
        if (!checked) return;
        setMostrarSemRoteiro(false);
        setExpandidos(coletarIdsComFilhos(resultado?.tree ?? null));
    }

    /*
     * Leva até um nó: abre o caminho até ele, destaca e (no efeito
     * abaixo) rola até a linha. Se os filtros escondem o nó, limpa os
     * filtros -- melhor do que um clique que não leva a lugar nenhum.
     */
    function irParaNo(id: string, abrirDetalhes = false) {
        const caminho = caminhoAteNo(resultado?.tree ?? null, id);

        if (!caminho) return;

        if (caminhoAteNo(arvoreExibida, id) === null) {
            limparFiltros();
            exibirToast("Os filtros foram limpos para mostrar o item na árvore.", "info", undefined, 4000);
        }

        setExpandidos((prev) => adicionarAoConjunto(prev, caminho));
        if (abrirDetalhes) setDetalhesAbertos((prev) => adicionarAoConjunto(prev, [id]));
        setDestaque((prev) => ({ id, vez: (prev?.vez ?? 0) + 1 }));
    }

    useEffect(() => {
        if (!destaque) return;

        /* Espera o React pintar os pais recém-abertos. */
        const quadro = requestAnimationFrame(() => {
            const linha = document.querySelector<HTMLElement>(
                `[data-node-id="${CSS.escape(destaque.id)}"]`
            );
            linha?.scrollIntoView({ block: "center", behavior: "smooth" });
        });

        return () => cancelAnimationFrame(quadro);
    }, [destaque]);

    const resultadosLocalizar = useMemo(() => {
        return localizarNaArvore(arvoreExibida, termoLocalizarAplicado);
    }, [arvoreExibida, termoLocalizarAplicado]);

    const indiceLocalizadoAtual =
        resultadosLocalizar.length > 0
            ? Math.min(indiceLocalizado, resultadosLocalizar.length - 1)
            : -1;

    /*
     * Debounce de 400ms no próprio onChange (timer num ref): o termo
     * só é aplicado -- e a árvore só pula para o primeiro resultado --
     * quando a pessoa para de digitar.
     */
    function aplicarTermoLocalizar(valor: string) {
        if (timerLocalizarRef.current) clearTimeout(timerLocalizarRef.current);

        const termo = valor.trim();
        setTermoLocalizarAplicado(termo);
        setIndiceLocalizado(0);

        const primeiro = localizarNaArvore(arvoreExibida, termo)[0];
        if (primeiro) irParaNo(primeiro.id);
    }

    function alterarTermoLocalizar(valor: string) {
        setTermoLocalizar(valor);

        if (timerLocalizarRef.current) clearTimeout(timerLocalizarRef.current);

        timerLocalizarRef.current = setTimeout(() => aplicarTermoLocalizar(valor), 400);
    }

    function irParaResultado(passo: 1 | -1) {
        const total = resultadosLocalizar.length;
        if (total === 0) return;

        const proximo = (indiceLocalizadoAtual + passo + total) % total;
        setIndiceLocalizado(proximo);
        irParaNo(resultadosLocalizar[proximo].id);
    }

    function abrirCadastroOperacao(item: RoteiroTreeNode) {
        setRoteiroEdicao(null);
        /*
         * Procura na árvore COMPLETA, não na filtrada:
         * um filtro ativo pode esconder o pai, e a
         * herança tem que seguir a estrutura real.
         */
        const pai = encontrarPaiNaArvore(resultado?.tree ?? null, item.id);
        setObservacaoHerdada(primeiraObservacaoDoRoteiro(pai));
        setPaiCadastroOperacao(pai);
        setItemCadastroOperacao(item);
    }

    async function copiarCodigosDaLista(codigos: string[]) {
        const ok = await copiarParaAreaDeTransferencia(codigos.join("\n"));

        exibirToast(
            ok
                ? `${codigos.length === 1 ? "1 código copiado" : `${codigos.length} códigos copiados`}.`
                : "O navegador não deixou copiar os códigos.",
            ok ? "sucesso" : "erro",
            undefined,
            3000
        );
    }

    async function exportarEstrutura() {
        if (!arvoreExibida || !resultado) return;

        try {
            setExportando(true);

            await exportarPlanilha({
                nomeArquivo: nomeComData(`roteiro-${resultado.codigo}`),
                nomeAba: "Estrutura",
                cabecalho: CABECALHO_EXPORTACAO,
                linhas: montarLinhasExportacao(arvoreExibida, divergenciasExibidas),
            });
        } catch (error) {
            /* Fechar o "salvar como" sem escolher é desistir, não erro. */
            if (error instanceof DOMException && error.name === "AbortError") return;

            console.error(error);
            exibirToast("Não foi possível gerar a planilha da estrutura.", "erro");
        } finally {
            setExportando(false);
        }
    }

    return (
        <ModoAberturaProvider modo={modoAbertura}>
        <div className={styles.page}>
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
                                    Resultado completo da operação executada
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.modalCloseButton}
                                aria-label="Fechar"
                                onClick={() => setRetornoErpModal(null)}
                            >
                                <X aria-hidden="true" />
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
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Roteiro de Fabricação</h1>
                    <p className={styles.subtitle}>
                        Consulte a estrutura do item no 3DEXPERIENCE, visualize e cadastre
                        os roteiros de fabricação.
                    </p>
                </div>
            </div>

            <div className={styles.searchCard}>
                {/* Pesquisa com os componentes da biblioteca: origem da
                    estrutura, código e botão, todos com a mesma altura. */}
                <div className={styles.searchRow}>
                    {/* "Ciber": peças com item base 2316, sem 3DX -- a
                        estrutura vem do ERP. */}
                    <Field label="Origem da estrutura" className={styles.campoOrigem}>
                        <Dropdown
                            value={ciber ? "ciber" : "3dx"}
                            options={OPCOES_ORIGEM}
                            disabled={loading}
                            onValueChange={(valor) => setCiber(valor === "ciber")}
                        />
                    </Field>

                    <Field label="Código do item pai" htmlFor="codigoPai" className={styles.campoCodigo}>
                        <Input
                            id="codigoPai"
                            value={codigoPai}
                            onChange={(e) => setCodigoPai(e.target.value)}
                            onKeyDown={(e) => {
                                /* Enquanto carrega, Enter não dispara outra
                                   consulta (ver handleBuscar). */
                                if (e.key === "Enter" && !loading) void handleBuscar();
                            }}
                            placeholder="Ex.: 20031933"
                        />
                    </Field>

                    <Button
                        className={styles.botaoConsultar}
                        onClick={() => void handleBuscar()}
                        loading={loading}
                        loadingLabel="Consultando…"
                    >
                        Consultar
                    </Button>
                </div>

                {erroCampo && <div className={styles.errorBox}>{erroCampo}</div>}

                {resultado && (
                    <>
                        <div className={styles.summary}>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>
                                    Item pai{origemConsulta === "ciber" && " · Ciber (estrutura do ERP)"}
                                </span>
                                <strong>{resultado.codigo}</strong>
                            </div>

                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>Total de itens</span>
                                <strong
                                    key={totalItensFiltrado}
                                    className={styles.valueAnimated}
                                >
                                    {totalItensFiltrado}
                                </strong>
                            </div>

                            <div
                                className={`${styles.summaryCard} ${styles.summaryCardClickable}`}
                                onClick={() => {
                                    if (itensSemRoteiro.length > 0) {
                                        setModalSemRoteiroOpen(true);
                                    }
                                }}
                            >
                                <span className={styles.summaryLabel}>Sem roteiro</span>
                                <strong
                                    key={totalSemRoteiroFiltrado}
                                    className={`${styles.warningText} ${styles.valueAnimated}`}
                                >
                                    {totalSemRoteiroFiltrado}
                                </strong>
                            </div>

                            <div
                                className={`${styles.summaryCard} ${styles.summaryCardClickable}`}
                                onClick={() => {
                                    if (itensComAtencao.length > 0) {
                                        setModalComAtencaoOpen(true);
                                    }
                                }}
                            >
                                <span className={styles.summaryLabel}>Com atenção</span>
                                <strong
                                    key={totalComAtencaoFiltrado}
                                    className={`${styles.attentionText} ${styles.valueAnimated}`}
                                >
                                    {totalComAtencaoFiltrado}
                                </strong>
                            </div>
                        </div>

                        <div className={styles.filtersCard}>
                            <button
                                type="button"
                                className={styles.filtersHeader}
                                onClick={() => setFiltrosAbertos((prev) => !prev)}
                            >
                                <div>
                                    <strong>Filtros da estrutura</strong>
                                    <span>
                                        {filtrosAplicados
                                            ? descricaoFiltros
                                            : "Nenhum filtro aplicado"}
                                        {itensOcultosPelosFiltros > 0 && (
                                            <span className={styles.filtrosOcultos}>
                                                {" "}
                                                ·{" "}
                                                {itensOcultosPelosFiltros === 1
                                                    ? "1 item oculto pelos filtros"
                                                    : `${itensOcultosPelosFiltros} itens ocultos pelos filtros`}
                                            </span>
                                        )}
                                    </span>
                                </div>

                                <span className={styles.filtersChevron}>
                                    {filtrosAbertos ? "▾" : "▸"}
                                </span>
                            </button>

                            {filtrosAbertos && (
                                <div className={styles.filtersBody}>
                                    <Checkbox
                                        label="Mostrar apenas itens sem roteiro"
                                        checked={mostrarSemRoteiro}
                                        onChange={(e) => alternarFiltroSemRoteiro(e.target.checked)}
                                    />

                                    <Checkbox
                                        label="Mostrar apenas itens com atenção"
                                        checked={mostrarComAtencao}
                                        onChange={(e) => alternarFiltroComAtencao(e.target.checked)}
                                    />

                                    <div className={styles.filterSelectGroup}>
                                        <label className={styles.filterSelectLabel}>
                                            Tipo do item
                                        </label>

                                        <div className={styles.tipoCheckboxList}>
                                            {tiposDisponiveis.map(([tipoKey, tipoLabel]) => (
                                                <Checkbox
                                                    key={tipoKey}
                                                    label={tipoLabel}
                                                    checked={tiposSelecionados.includes(tipoKey)}
                                                    onChange={(e) =>
                                                        toggleTipo(tipoKey, e.target.checked)
                                                    }
                                                />
                                            ))}
                                        </div>

                                        {filtrosAplicados && (
                                            <button
                                                type="button"
                                                className={styles.clearFilterButton}
                                                onClick={limparFiltros}
                                            >
                                                Limpar filtros
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <section className={styles.leftPanel}>
                <div className={styles.panelHeader}>
                    <h2>Estrutura com Roteiros</h2>

                    {resultado && !loading && (
                        <ConferenciaErp
                            validacao={validacaoErp}
                            onIrParaNo={(id) => irParaNo(id)}
                            onTentarDeNovo={() => conferirNoErp(resultado.tree, consultaAtualRef.current)}
                        />
                    )}
                </div>

                {/*
                    Quatro situações diferentes, cada uma com a sua mensagem:
                    antes todas mostravam "Informe um código...", inclusive
                    durante a carga e depois de um erro.
                */}
                {loading ? (
                    <Loader centered label={textoDoProgresso(progresso)} />
                ) : erroConsulta ? (
                    <EmptyState
                        title="Não foi possível carregar a estrutura"
                        description={`${erroConsulta.codigo}: ${erroConsulta.mensagem}`}
                        action={
                            <Button
                                variant="secondary"
                                onClick={() => void handleBuscar(erroConsulta.codigo)}
                            >
                                Tentar de novo
                            </Button>
                        }
                    />
                ) : !resultado ? (
                    <EmptyState
                        title="Nenhuma estrutura carregada"
                        description="Informe um código do item pai para carregar a estrutura."
                    />
                ) : !arvoreExibida ? (
                    <EmptyState
                        title="Nenhum item corresponde aos filtros"
                        description={`Filtros ativos: ${descricaoFiltros || "nenhum"}.`}
                        action={
                            <Button variant="secondary" onClick={limparFiltros}>
                                Limpar filtros
                            </Button>
                        }
                    />
                ) : (
                    <>
                        <div className={styles.ferramentasArvore}>
                            <div className={styles.ferramentasGrupo}>
                                <button
                                    type="button"
                                    className={styles.ferramentaBotao}
                                    onClick={() =>
                                        setExpandidos(coletarIdsComFilhos(resultado.tree))
                                    }
                                >
                                    <ChevronsUpDown aria-hidden="true" />
                                    Expandir tudo
                                </button>

                                <button
                                    type="button"
                                    className={styles.ferramentaBotao}
                                    onClick={() => setExpandidos(new Set())}
                                >
                                    <ChevronsDownUp aria-hidden="true" />
                                    Recolher tudo
                                </button>
                            </div>

                            <div className={styles.localizarArvore}>
                                <input
                                    type="search"
                                    className={styles.localizarInput}
                                    placeholder="Localizar na estrutura (código ou descrição)"
                                    aria-label="Localizar na estrutura por código ou descrição"
                                    value={termoLocalizar}
                                    onChange={(e) => alterarTermoLocalizar(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key !== "Enter") return;

                                        e.preventDefault();

                                        /* Enter antes do debounce: aplica já, em
                                           vez de andar nos resultados antigos. */
                                        if (termoLocalizar.trim() !== termoLocalizarAplicado) {
                                            aplicarTermoLocalizar(termoLocalizar);
                                        } else {
                                            irParaResultado(e.shiftKey ? -1 : 1);
                                        }
                                    }}
                                />

                                {termoLocalizarAplicado && (
                                    <span className={styles.localizarContador} aria-live="polite">
                                        {resultadosLocalizar.length === 0
                                            ? "Nenhum"
                                            : `${indiceLocalizadoAtual + 1} de ${resultadosLocalizar.length}`}
                                    </span>
                                )}

                                <IconButton
                                    size="small"
                                    icon={<ChevronUp />}
                                    label="Resultado anterior"
                                    disabled={resultadosLocalizar.length === 0}
                                    onClick={() => irParaResultado(-1)}
                                />
                                <IconButton
                                    size="small"
                                    icon={<ChevronDown />}
                                    label="Próximo resultado"
                                    disabled={resultadosLocalizar.length === 0}
                                    onClick={() => irParaResultado(1)}
                                />
                            </div>

                            {/* A legenda abre num modal: como faixa fixa acima da
                                árvore, ocupava espaço de quem já sabe as cores. */}
                            <button
                                type="button"
                                className={styles.ferramentaBotao}
                                onClick={() => setLegendaAberta(true)}
                            >
                                <CircleHelp aria-hidden="true" />
                                Legenda
                            </button>

                            <button
                                type="button"
                                className={styles.ferramentaBotao}
                                disabled={exportando}
                                title="Planilha da estrutura exibida, uma linha por operação"
                                onClick={() => void exportarEstrutura()}
                            >
                                <Download aria-hidden="true" />
                                {exportando ? "Gerando…" : "Exportar planilha"}
                            </button>
                        </div>

                        <div className={styles.treeWrapper}>
                            <TreeNode
                                node={arvoreExibida}
                                raiz
                                expandidos={expandidos}
                                detalhesAbertos={detalhesAbertos}
                                destacadoId={destaque?.id ?? null}
                                onAlternarExpandido={(id) =>
                                    setExpandidos((prev) => alternarNoConjunto(prev, id))
                                }
                                onAlternarDetalhes={(id) =>
                                    setDetalhesAbertos((prev) => alternarNoConjunto(prev, id))
                                }
                                divergenciasErp={divergenciasExibidas}
                                onCreateRoteiro={abrirCadastroOperacao}
                                onEditRoteiro={(item, roteiro) => {
                                    /*
                                     * A observação do pai também vale na edição: o
                                     * botão "Importar OBS Pai" fica à mão para
                                     * levá-la a uma operação que já existe. O
                                     * cabeçalho mostra a hierarquia nos dois modos.
                                     */
                                    const pai = encontrarPaiNaArvore(resultado?.tree ?? null, item.id);
                                    setObservacaoHerdada(primeiraObservacaoDoRoteiro(pai));
                                    setPaiCadastroOperacao(pai);
                                    setItemCadastroOperacao(item);
                                    setRoteiroEdicao(roteiro);
                                }}
                                onDeleteRoteiro={(item, roteiro) => {
                                    setRoteiroExclusao({ item, roteiro });
                                }}
                                onDeleteRoteiroCompleto={(item) => {
                                    setRoteiroCompletoExclusao(item);
                                }}
                                onOpenAtencao={(item) => {
                                    setAtencaoModalItem(item);
                                }}
                            />
                        </div>
                    </>
                )}
            </section>

            {/*
                Listas do resumo: cada linha leva ao item na árvore (fecha o
                modal, abre o caminho, rola e destaca) e tem a ação direta
                ao lado. Modal da biblioteca: fecha com Esc e prende o foco.
            */}
            <Modal
                open={legendaAberta}
                size="small"
                title="Legenda da estrutura"
                description="O que cada cor e cada marcação da árvore quer dizer."
                onClose={() => setLegendaAberta(false)}
                footer={
                    <Button variant="secondary" onClick={() => setLegendaAberta(false)}>
                        Fechar
                    </Button>
                }
            >
                {/* As badges são as mesmas da árvore, para reconhecer de olho.
                    Agrupadas pelo que significam, cada uma alinhada à sua explicação. */}
                <div className={styles.legenda}>
                    <section className={styles.legendaGrupo}>
                        <h4 className={styles.legendaTitulo}>Roteiro do item</h4>
                        <dl className={styles.legendaLista}>
                            <dt><span className={styles.badgeWarning}>Sem roteiro</span></dt>
                            <dd>Item fabricado sem nenhuma operação. Clique na etiqueta para cadastrar.</dd>

                            <dt><span className={styles.badgeSuccess}>2 operações</span></dt>
                            <dd>Quantas operações tem o roteiro padrão. Com &quot;+1 alt&quot;, também tem alternativo.</dd>

                            <dt><span className={styles.badgeSoAlternativo}>2 op · Alt 1</span></dt>
                            <dd>Só tem roteiro alternativo, sem o padrão.</dd>
                        </dl>
                    </section>

                    <section className={styles.legendaGrupo}>
                        <h4 className={styles.legendaTitulo}>Pontos de atenção</h4>
                        <dl className={styles.legendaLista}>
                            <dt><span className={styles.badgeAttention}>Atenção</span></dt>
                            <dd>A revisão do roteiro no ERP é diferente da revisão do 3DX.</dd>

                            <dt><span className={styles.badgeErp}>Não tem no ERP</span></dt>
                            <dd>O item não está, ou está vencido, na estrutura do ERP debaixo deste pai.</dd>
                        </dl>
                    </section>

                    <section className={styles.legendaGrupo}>
                        <h4 className={styles.legendaTitulo}>Tipo do item</h4>
                        <dl className={styles.legendaLista}>
                            <dt><span className={styles.nodeType}>Tipo: Fabricado</span></dt>
                            <dd>
                                Tipo do item no 3DX; &quot;(ERP)&quot; quando veio do cadastro do ERP. O filtro abre
                                mostrando só Fabricado.
                            </dd>
                        </dl>
                    </section>
                </div>
            </Modal>

            <Modal
                open={modalSemRoteiroOpen}
                size="large"
                title="Itens sem roteiro"
                description="Itens únicos sem roteiro conforme os filtros aplicados. Clique numa linha para ir até o item na árvore."
                onClose={() => setModalSemRoteiroOpen(false)}
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() =>
                                void copiarCodigosDaLista(
                                    itensSemRoteiro.map((item) => item.codigoNormalizado)
                                )
                            }
                        >
                            <Copy aria-hidden="true" size={16} />
                            Copiar códigos
                        </Button>
                        <Button variant="secondary" onClick={() => setModalSemRoteiroOpen(false)}>
                            Fechar
                        </Button>
                    </>
                }
            >
                <div className={styles.modalTabelaRolavel}>
                    <table className={`${styles.modalTable} ${styles.modalTableNavegavel}`}>
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Revisão</th>
                                <th>Tipo</th>
                                <th>Descrição</th>
                                <th aria-label="Ações" />
                            </tr>
                        </thead>

                        <tbody>
                            {itensSemRoteiro.map((item) => (
                                <tr
                                    key={item.codigoNormalizado}
                                    onClick={() => {
                                        setModalSemRoteiroOpen(false);
                                        irParaNo(item.id);
                                    }}
                                >
                                    <td>
                                        <button
                                            type="button"
                                            className={styles.linkCodigo}
                                            title="Mostrar na árvore"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setModalSemRoteiroOpen(false);
                                                irParaNo(item.id);
                                            }}
                                        >
                                            {item.codigoNormalizado}
                                        </button>
                                    </td>
                                    <td>{item.revisao || "-"}</td>
                                    <td>{formatarTipo(tipoBrutoDoItem(item))}</td>
                                    <td>{item.descricaoNormalizada || "Sem descrição"}</td>
                                    <td className={styles.modalTableAcao}>
                                        <button
                                            type="button"
                                            className={styles.botaoCompacto}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setModalSemRoteiroOpen(false);
                                                abrirCadastroOperacao(item);
                                            }}
                                        >
                                            Cadastrar operação
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Modal>

            <Modal
                open={modalComAtencaoOpen}
                size="large"
                title="Itens com atenção"
                description="Itens fabricados com revisão do roteiro no ERP vazia ou diferente da revisão retornada pelo 3DEXPERIENCE. Clique numa linha para ir até o item na árvore."
                onClose={() => setModalComAtencaoOpen(false)}
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() =>
                                void copiarCodigosDaLista(
                                    itensComAtencao.map(({ item }) => item.codigoNormalizado)
                                )
                            }
                        >
                            <Copy aria-hidden="true" size={16} />
                            Copiar códigos
                        </Button>
                        <Button variant="secondary" onClick={() => setModalComAtencaoOpen(false)}>
                            Fechar
                        </Button>
                    </>
                }
            >
                <div className={styles.modalTabelaRolavel}>
                    <table className={`${styles.modalTable} ${styles.modalTableNavegavel}`}>
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Revisão 3DX</th>
                                <th>Revisão ERP</th>
                                <th>Tipo</th>
                                <th>Descrição</th>
                                <th aria-label="Ações" />
                            </tr>
                        </thead>

                        <tbody>
                            {itensComAtencao.map(({ item, revisao3dx, revisoesErp }) => (
                                <tr
                                    key={item.codigoNormalizado}
                                    onClick={() => {
                                        setModalComAtencaoOpen(false);
                                        irParaNo(item.id);
                                    }}
                                >
                                    <td>
                                        <button
                                            type="button"
                                            className={styles.linkCodigo}
                                            title="Mostrar na árvore"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setModalComAtencaoOpen(false);
                                                irParaNo(item.id);
                                            }}
                                        >
                                            {item.codigoNormalizado}
                                        </button>
                                    </td>
                                    <td>{revisao3dx || "-"}</td>
                                    <td>{revisoesErp || "Sem revisão"}</td>
                                    <td>{formatarTipo(tipoBrutoDoItem(item))}</td>
                                    <td>{item.descricaoNormalizada || "Sem descrição"}</td>
                                    <td className={styles.modalTableAcao}>
                                        {/* "Ver": vai até o item já com as
                                            operações abertas, para comparar
                                            as revisões. */}
                                        <button
                                            type="button"
                                            className={styles.botaoCompacto}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setModalComAtencaoOpen(false);
                                                irParaNo(item.id, true);
                                            }}
                                        >
                                            Ver
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Modal>

            {atencaoModalItem && (
                <div
                    className={styles.modalOverlay}
                    onClick={() => setAtencaoModalItem(null)}
                >
                    <div
                        className={`${styles.modalContent} ${styles.deleteModalContent}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <div>
                                <h3 className={styles.modalTitle}>Roteiro com atenção</h3>
                                <p className={styles.modalSubtitle}>
                                    A revisão do roteiro de fabricação no ERP está diferente da revisão retornada pelo item na estrutura no 3DEXPERIENCE.
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.modalCloseButton}
                                aria-label="Fechar"
                                onClick={() => setAtencaoModalItem(null)}
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>

                        <div className={styles.deleteModalBody}>
                            <p className={styles.deleteModalQuestion}>
                                Revise o roteiro de fabricação deste item, pois ele pode estar desatualizado em relação à revisão atual da estrutura.
                            </p>

                            <div className={styles.deleteModalInfoBox}>
                                <span>
                                    <strong>Item:</strong> {atencaoModalItem.codigoNormalizado}
                                </span>

                                <span>
                                    <strong>Revisão 3DX:</strong> {normalizarRevisao(atencaoModalItem.revisao) || "-"}
                                </span>

                                <span>
                                    <strong>Revisão ERP:</strong> {obterRevisoesErpTexto(atencaoModalItem.roteiros)}
                                </span>

                                <span>
                                    <strong>Tipo:</strong> {formatarTipo(tipoBrutoDoItem(atencaoModalItem))}
                                </span>

                                <span>
                                    <strong>Descrição:</strong>{" "}
                                    {atencaoModalItem.descricaoNormalizada || "Sem descrição"}
                                </span>
                            </div>
                        </div>

                        <div className={styles.deleteModalFooter}>
                            <button
                                type="button"
                                className={styles.modalSecondaryButton}
                                onClick={() => setAtencaoModalItem(null)}
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {roteiroExclusao && (
                <div
                    className={styles.modalOverlay}
                    onClick={() => {
                        if (!deletando) setRoteiroExclusao(null);
                    }}
                >
                    <div
                        className={`${styles.modalContent} ${styles.deleteModalContent}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <div>
                                <h3 className={styles.modalTitle}>Confirmar exclusão</h3>
                                <p className={styles.modalSubtitle}>
                                    Esta ação irá deletar somente a operação selecionada.
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.modalCloseButton}
                                aria-label="Fechar"
                                onClick={() => setRoteiroExclusao(null)}
                                disabled={deletando}
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>

                        <div className={styles.deleteModalBody}>
                            <p className={styles.deleteModalQuestion}>
                                Tem certeza que deseja deletar esta operação?
                            </p>

                            <div className={styles.deleteModalInfoBox}>
                                <span>
                                    <strong>Item:</strong>{" "}
                                    {roteiroExclusao.item.codigoNormalizado}
                                </span>

                                <span>
                                    <strong>Roteiro:</strong>{" "}
                                    {obterTipoRoteiro(roteiroExclusao.roteiro)}
                                </span>

                                <span>
                                    <strong>Sequência:</strong> {roteiroExclusao.roteiro.SEQ ?? "-"}
                                </span>

                                <span>
                                    <strong>Operação:</strong>{" "}
                                    {roteiroExclusao.roteiro.COD_OPERACAO ?? "-"} -{" "}
                                    {roteiroExclusao.roteiro.DESC_OPERACAO ?? "-"}
                                </span>

                                <span>
                                    <strong>Centro:</strong>{" "}
                                    {roteiroExclusao.roteiro.COD_CENTRO_TRAB ?? "-"} -{" "}
                                    {roteiroExclusao.roteiro.DESC_CENTRO_TRAB ?? "-"}
                                </span>
                            </div>
                        </div>

                        <div className={styles.deleteModalFooter}>
                            <button
                                type="button"
                                className={styles.modalSecondaryButton}
                                onClick={() => setRoteiroExclusao(null)}
                                disabled={deletando}
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                className={styles.deleteConfirmButton}
                                onClick={confirmarExclusaoOperacao}
                                disabled={deletando}
                            >
                                {deletando ? "Deletando..." : "Sim, deletar operação"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {roteiroCompletoExclusao && (
                <div
                    className={styles.modalOverlay}
                    onClick={() => {
                        if (!deletando) setRoteiroCompletoExclusao(null);
                    }}
                >
                    <div
                        className={`${styles.modalContent} ${styles.deleteModalContent}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <div>
                                <h3 className={styles.modalTitle}>
                                    Confirmar exclusão do roteiro
                                </h3>
                                <p className={styles.modalSubtitle}>
                                    Esta ação irá deletar o roteiro completo do item selecionado.
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.modalCloseButton}
                                aria-label="Fechar"
                                onClick={() => setRoteiroCompletoExclusao(null)}
                                disabled={deletando}
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>

                        <div className={styles.deleteModalBody}>
                            <p className={styles.deleteModalQuestion}>
                                Tem certeza que deseja deletar todas as operações deste roteiro?
                            </p>

                            <div className={styles.deleteModalInfoBox}>
                                <span>
                                    <strong>Item:</strong>{" "}
                                    {roteiroCompletoExclusao.codigoNormalizado}
                                </span>

                                <span>
                                    <strong>Revisão:</strong>{" "}
                                    {roteiroCompletoExclusao.revisao || "-"}
                                </span>

                                <span>
                                    <strong>Descrição:</strong>{" "}
                                    {roteiroCompletoExclusao.descricaoNormalizada ||
                                        "Sem descrição"}
                                </span>

                                <span>
                                    <strong>Total de operações:</strong>{" "}
                                    {roteiroCompletoExclusao.roteiros.length}
                                </span>
                            </div>
                        </div>

                        <div className={styles.deleteModalFooter}>
                            <button
                                type="button"
                                className={styles.modalSecondaryButton}
                                onClick={() => setRoteiroCompletoExclusao(null)}
                                disabled={deletando}
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                className={styles.deleteConfirmButton}
                                onClick={confirmarExclusaoRoteiroCompleto}
                                disabled={deletando}
                            >
                                {deletando ? "Deletando..." : "Sim, deletar roteiro"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <CadastroOperacaoModal
                open={!!itemCadastroOperacao}
                item={itemCadastroOperacao}
                pai={paiCadastroOperacao}
                outrosPais={
                    itemCadastroOperacao && paiCadastroOperacao
                        ? paisDoCodigoNaArvore(
                              resultado?.tree ?? null,
                              itemCadastroOperacao.codigoNormalizado
                          ).filter(
                              (outro) =>
                                  outro.codigoNormalizado !== paiCadastroOperacao.codigoNormalizado
                          )
                        : []
                }
                roteiroEdicao={roteiroEdicao}
                observacaoHerdada={observacaoHerdada}
                onRoteiroSalvo={atualizarRoteirosDoItem}
                onEditarOperacao={setRoteiroEdicao}
                onClose={() => {
                    setItemCadastroOperacao(null);
                    setRoteiroEdicao(null);
                    setObservacaoHerdada("");
                    setPaiCadastroOperacao(null);
                }}
            />
        </div>
        </ModoAberturaProvider>
    );
}