"use client";

import { useMemo, useRef, useState } from "react";
import styles from "./cadastro-roteiro.module.css";
import {
    buscarEstruturaComRoteiros,
    buscarRoteirosDoItem,
    deletarOperacaoRoteiro,
    deletarRoteiroCompleto,
} from "@/modules/cadastro-roteiro/services/cadastroRoteiro.service";
import CadastroOperacaoModal from "@/modules/cadastro-roteiro/components/CadastroOperacaoModal";
import {
    RoteiroItem,
    RoteiroTreeNode,
} from "@/modules/cadastro-roteiro/types/cadastroRoteiro.types";
import AbrirPdfItemButton from "@/modules/cadastro-roteiro/components/AbrirPdfItemButton";
import Abrir3DPlayButton from "@/modules/cadastro-roteiro/components/Abrir3DPlayButton";

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

function obterTipoItem(node: RoteiroTreeNode): string {
    return normalizarTipo(node.tipoint);
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
        tipos.set(tipoKey, formatarTipo(node.tipoint));
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
    return (
        <div
            key={`${roteiro.COD_ITEM}-${roteiro.ALTERNATIVO}-${roteiro.SEQ}-${index}`}
            className={styles.roteiroCard}
        >
            <span>
                <strong>Seq:</strong> {roteiro.SEQ ?? "-"}
            </span>

            <span>
                <strong>Operação:</strong> {roteiro.COD_OPERACAO ?? "-"} -{" "}
                {roteiro.DESC_OPERACAO ?? "-"}
            </span>

            <span>
                <strong>Centro:</strong> {roteiro.COD_CENTRO_TRAB ?? "-"} -{" "}
                {roteiro.DESC_CENTRO_TRAB ?? "-"}
            </span>

            <span>
                <strong>Unidade:</strong> {roteiro.COD_UNID_MED ?? "-"} -{" "}
                {roteiro.DESC_UNID_MED ?? "-"}
            </span>

            <span>
                <strong>Início:</strong> {roteiro.DT_INICIO ?? "-"}
            </span>

            <span>
                <strong>Fim:</strong> {roteiro.DT_FIM ?? "-"}
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

            <span>
                <strong>Tempo:</strong> {roteiro.TEMPO ?? "-"}
            </span>

            <span>
                <strong>Obs:</strong> {roteiro.OBSERVACAO ?? "-"}
            </span>

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

function TreeNode({
    node,
    initialExpanded = false,
    onCreateRoteiro,
    onEditRoteiro,
    onDeleteRoteiro,
    onDeleteRoteiroCompleto,
    onOpenAtencao,
}: {
    node: RoteiroTreeNode;
    initialExpanded?: boolean;
    onCreateRoteiro: (item: RoteiroTreeNode) => void;
    onEditRoteiro: (item: RoteiroTreeNode, roteiro: RoteiroItem) => void;
    onDeleteRoteiro: (item: RoteiroTreeNode, roteiro: RoteiroItem) => void;
    onDeleteRoteiroCompleto: (item: RoteiroTreeNode) => void;
    onOpenAtencao: (item: RoteiroTreeNode) => void;
}) {
    const [expanded, setExpanded] = useState(
        node.nivel === 0 || initialExpanded
    );

    const [showDetails, setShowDetails] = useState(false);

    const hasChildren = node.children.length > 0;
    const tipoItem = obterTipoItem(node);
    const semRoteiro = tipoItem === "fabricado" && node.roteiros.length === 0;
    const comAtencao =
        tipoItem === "fabricado" && !semRoteiro && roteiroComAtencao(node);
    const qtdOperacoesPadrao = contarOperacoesPadrao(node.roteiros);

    return (
        <div className={styles.treeNode}>
            <div
                className={[
                    styles.treeRow,
                    semRoteiro ? styles.treeRowWarning : "",
                    comAtencao ? styles.treeRowAttention : "",
                ].join(" ")}
                onClick={() => setShowDetails((prev) => !prev)}
            >
                <button
                    type="button"
                    className={styles.expandButton}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (hasChildren) setExpanded((prev) => !prev);
                    }}
                >
                    {hasChildren ? (expanded ? "▾" : "▸") : "•"}
                </button>

                <div className={styles.treeContent}>
                    <div className={styles.nodeTopLine}>
                        <strong className={styles.nodeCode}>
                            {node.codigoNormalizado || "-"}{" "}
                            {node.revisao ? `| ${node.revisao}` : ""}
                        </strong>

                        <span className={semRoteiro ? styles.badgeWarning : styles.badgeSuccess}>
                            {semRoteiro
                                ? "Sem roteiro"
                                : formatarQtdOperacoes(qtdOperacoesPadrao)}
                        </span>

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

                        {node.tipoint && (
                            <span className={styles.nodeType}>
                                Tipo: {formatarTipo(node.tipoint)}
                            </span>
                        )}
                        <AbrirPdfItemButton
                            codigo={node.codigoNormalizado}
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
                    </div>

                    <span className={styles.nodeDescription}>
                        {node.descricaoNormalizada || "Sem descrição"}
                    </span>

                    {showDetails && node.roteiros.length > 0 && (
                        <RoteirosDoItem
                            item={node}
                            roteiros={node.roteiros}
                            onEditRoteiro={(roteiro) => onEditRoteiro(node, roteiro)}
                            onDeleteRoteiro={(roteiro) => onDeleteRoteiro(node, roteiro)}
                            onDeleteRoteiroCompleto={onDeleteRoteiroCompleto}
                        />
                    )}

                    {showDetails && tipoItem === "fabricado" && (
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
            </div>

            {hasChildren && expanded && (
                <div className={styles.treeChildren}>
                    {node.children.map((child) => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            initialExpanded={initialExpanded}
                            onCreateRoteiro={onCreateRoteiro}
                            onEditRoteiro={onEditRoteiro}
                            onDeleteRoteiro={onDeleteRoteiro}
                            onDeleteRoteiroCompleto={onDeleteRoteiroCompleto}
                            onOpenAtencao={onOpenAtencao}
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
    tipo: "sucesso" | "erro";
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
                    title={toast.retornoErp ? "Clique para ver o retorno completo" : ""}
                >
                    <span>
                        {toast.tipo === "sucesso" ? "✓" : "✕"}&nbsp;&nbsp;{toast.mensagem}
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

export default function CadastroRoteiro() {
    const [codigoPai, setCodigoPai] = useState("");
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState("");
    const [mostrarSemRoteiro, setMostrarSemRoteiro] = useState(false);
    const [mostrarComAtencao, setMostrarComAtencao] = useState(false);
    const [filtrosAbertos, setFiltrosAbertos] = useState(false);
    const [tiposSelecionados, setTiposSelecionados] = useState<string[]>([]);
    const [modalSemRoteiroOpen, setModalSemRoteiroOpen] = useState(false);
    const [modalComAtencaoOpen, setModalComAtencaoOpen] = useState(false);
    const [atencaoModalItem, setAtencaoModalItem] =
        useState<RoteiroTreeNode | null>(null);

    const [itemCadastroOperacao, setItemCadastroOperacao] =
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

    async function atualizarRoteirosDoItem(codItem: string) {
        const codigoNormalizado = String(codItem ?? "").trim();

        if (!codigoNormalizado) return;

        try {
            const roteirosAtualizados = await buscarRoteirosDoItem(codigoNormalizado);

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
            setErro(
                error instanceof Error
                    ? error.message
                    : "Roteiro salvo, mas ocorreu erro ao atualizar o item na estrutura."
            );
        }
    }

    async function handleBuscar() {
        const codigo = codigoPai.trim();

        if (!codigo) {
            setErro("Informe o código do item pai.");
            return;
        }

        try {
            setLoading(true);
            setErro("");
            setResultado(null);
            setTiposSelecionados([]);
            setMostrarSemRoteiro(false);
            setMostrarComAtencao(false);
            setFiltrosAbertos(false);
            setModalSemRoteiroOpen(false);
            setModalComAtencaoOpen(false);
            setAtencaoModalItem(null);
            setItemCadastroOperacao(null);
            setRoteiroEdicao(null);
            setRoteiroExclusao(null);
            setRoteiroCompletoExclusao(null);
            setRetornoErpModal(null);

            const dados = await buscarEstruturaComRoteiros(codigo);
            setResultado(dados);
        } catch (error) {
            console.error(error);
            setErro(
                error instanceof Error
                    ? error.message
                    : "Erro ao consultar estrutura e roteiros."
            );
        } finally {
            setLoading(false);
        }
    }

    async function confirmarExclusaoOperacao() {
        if (!roteiroExclusao) return;

        const { item, roteiro } = roteiroExclusao;

        try {
            setDeletando(true);
            setErro("");

            const retornoExclusaoOperacao = await deletarOperacaoRoteiro({
                codItem: item.codigoNormalizado,
                alternativo: alternativoParaNumero(roteiro.ALTERNATIVO),
                seq: Number(roteiro.SEQ),
            });

            setResultado((prev) => {
                if (!prev) return prev;

                function removerOperacao(node: RoteiroTreeNode): RoteiroTreeNode {
                    const mesmoItem = node.id === item.id;

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
        } catch (error) {
            console.error(error);

            const mensagem =
                error instanceof Error
                    ? error.message
                    : "Erro ao deletar operação do roteiro.";

            setErro(mensagem);
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
            setErro("");

            const retornoExclusaoRoteiroCompleto = await deletarRoteiroCompleto({
                codItem: item.codigoNormalizado,
            });

            setResultado((prev) => {
                if (!prev) return prev;

                function removerRoteiroCompleto(node: RoteiroTreeNode): RoteiroTreeNode {
                    const mesmoItem = node.id === item.id;

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
        } catch (error) {
            console.error(error);

            const mensagem =
                error instanceof Error
                    ? error.message
                    : "Erro ao deletar roteiro completo.";

            setErro(mensagem);
            exibirToast(mensagem, "erro", montarRetornoErro(mensagem, error));
        } finally {
            setDeletando(false);
        }
    }

    const tiposDisponiveis = useMemo(() => {
        return Array.from(coletarTiposItens(resultado?.tree ?? null).entries()).sort(
            (a, b) => a[1].localeCompare(b[1], "pt-BR")
        );
    }, [resultado]);

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

    return (
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
                <div className={styles.searchRow}>
                    <div className={styles.inputGroup}>
                        <label htmlFor="codigoPai" className={styles.label}>
                            Código do item pai
                        </label>

                        <input
                            id="codigoPai"
                            type="text"
                            value={codigoPai}
                            onChange={(e) => setCodigoPai(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleBuscar();
                            }}
                            placeholder="Ex.: 20031933"
                            className={styles.input}
                        />
                    </div>

                    <button
                        type="button"
                        className={styles.searchButton}
                        onClick={handleBuscar}
                        disabled={loading}
                    >
                        {loading ? "Consultando..." : "Consultar"}
                    </button>
                </div>

                {erro && <div className={styles.errorBox}>{erro}</div>}

                {resultado && (
                    <>
                        <div className={styles.summary}>
                            <div className={styles.summaryCard}>
                                <span className={styles.summaryLabel}>Item pai</span>
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
                                            ? "Filtros aplicados"
                                            : "Nenhum filtro aplicado"}
                                    </span>
                                </div>

                                <span className={styles.filtersChevron}>
                                    {filtrosAbertos ? "▾" : "▸"}
                                </span>
                            </button>

                            {filtrosAbertos && (
                                <div className={styles.filtersBody}>
                                    <label className={styles.filterToggle}>
                                        <input
                                            type="checkbox"
                                            checked={mostrarSemRoteiro}
                                            onChange={(e) => setMostrarSemRoteiro(e.target.checked)}
                                        />
                                        <span>Mostrar apenas itens sem roteiro</span>
                                    </label>

                                    <label className={styles.filterToggle}>
                                        <input
                                            type="checkbox"
                                            checked={mostrarComAtencao}
                                            onChange={(e) => setMostrarComAtencao(e.target.checked)}
                                        />
                                        <span>Mostrar apenas itens com atenção</span>
                                    </label>

                                    <div className={styles.filterSelectGroup}>
                                        <label className={styles.filterSelectLabel}>
                                            Tipo do item
                                        </label>

                                        <div className={styles.tipoCheckboxList}>
                                            {tiposDisponiveis.map(([tipoKey, tipoLabel]) => (
                                                <label
                                                    key={tipoKey}
                                                    className={styles.tipoCheckboxItem}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={tiposSelecionados.includes(tipoKey)}
                                                        onChange={(e) =>
                                                            toggleTipo(tipoKey, e.target.checked)
                                                        }
                                                    />
                                                    <span>{tipoLabel}</span>
                                                </label>
                                            ))}
                                        </div>

                                        {filtrosAplicados && (
                                            <button
                                                type="button"
                                                className={styles.clearFilterButton}
                                                onClick={() => {
                                                    setTiposSelecionados([]);
                                                    setMostrarSemRoteiro(false);
                                                    setMostrarComAtencao(false);
                                                }}
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
                </div>

                {!arvoreExibida ? (
                    <div className={styles.emptyState}>
                        Informe um código do item pai para carregar a estrutura.
                    </div>
                ) : (
                    <div className={styles.treeWrapper}>
                        <TreeNode
                            key={`${arvoreExibida.id}-${mostrarSemRoteiro ? "sem-roteiro" : "todos"}-${mostrarComAtencao ? "atencao" : "normal"}`}
                            node={arvoreExibida}
                            initialExpanded={mostrarSemRoteiro || mostrarComAtencao}
                            onCreateRoteiro={(item) => {
                                setRoteiroEdicao(null);
                                setItemCadastroOperacao(item);
                            }}
                            onEditRoteiro={(item, roteiro) => {
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
                )}
            </section>

            {modalSemRoteiroOpen && (
                <div
                    className={styles.modalOverlay}
                    onClick={() => setModalSemRoteiroOpen(false)}
                >
                    <div
                        className={styles.modalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <div>
                                <h3 className={styles.modalTitle}>Itens sem roteiro</h3>
                                <p className={styles.modalSubtitle}>
                                    Lista de itens únicos sem roteiro conforme os filtros
                                    aplicados.
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.modalCloseButton}
                                onClick={() => setModalSemRoteiroOpen(false)}
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.modalTableWrapper}>
                            <table className={styles.modalTable}>
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Revisão</th>
                                        <th>Tipo</th>
                                        <th>Descrição</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {itensSemRoteiro.map((item) => (
                                        <tr key={item.codigoNormalizado}>
                                            <td>{item.codigoNormalizado}</td>
                                            <td>{item.revisao || "-"}</td>
                                            <td>{formatarTipo(item.tipoint)}</td>
                                            <td>{item.descricaoNormalizada || "Sem descrição"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}


            {modalComAtencaoOpen && (
                <div
                    className={styles.modalOverlay}
                    onClick={() => setModalComAtencaoOpen(false)}
                >
                    <div
                        className={styles.modalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <div>
                                <h3 className={styles.modalTitle}>Itens com atenção</h3>
                                <p className={styles.modalSubtitle}>
                                    Lista de itens fabricados com revisão do roteiro no ERP
                                    vazia ou diferente da revisão retornada pelo 3DEXPERIENCE.
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.modalCloseButton}
                                onClick={() => setModalComAtencaoOpen(false)}
                            >
                                ×
                            </button>
                        </div>

                        <div className={styles.modalTableWrapper}>
                            <table className={styles.modalTable}>
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Revisão 3DX</th>
                                        <th>Revisão ERP</th>
                                        <th>Tipo</th>
                                        <th>Descrição</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {itensComAtencao.map(({ item, revisao3dx, revisoesErp }) => (
                                        <tr key={item.codigoNormalizado}>
                                            <td>{item.codigoNormalizado}</td>
                                            <td>{revisao3dx || "-"}</td>
                                            <td>{revisoesErp || "Sem revisão"}</td>
                                            <td>{formatarTipo(item.tipoint)}</td>
                                            <td>{item.descricaoNormalizada || "Sem descrição"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}



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
                                onClick={() => setAtencaoModalItem(null)}
                            >
                                ×
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
                                    <strong>Tipo:</strong> {formatarTipo(atencaoModalItem.tipoint)}
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
                                onClick={() => setRoteiroExclusao(null)}
                                disabled={deletando}
                            >
                                ×
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
                                    <strong>Seq:</strong> {roteiroExclusao.roteiro.SEQ ?? "-"}
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
                                onClick={() => setRoteiroCompletoExclusao(null)}
                                disabled={deletando}
                            >
                                ×
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
                roteiroEdicao={roteiroEdicao}
                onRoteiroSalvo={atualizarRoteirosDoItem}
                onClose={() => {
                    setItemCadastroOperacao(null);
                    setRoteiroEdicao(null);
                }}
            />
        </div>
    );
}