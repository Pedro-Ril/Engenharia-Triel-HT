"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import styles from "@/app/cadastro-roteiro/cadastro-roteiro.module.css";

import { buscarPaisNoErp } from "../services/cadastroRoteiro.service";
import type { PaiErp } from "../types/cadastroRoteiro.types";
import AbrirPdfItemButton from "./AbrirPdfItemButton";
import Abrir3DPlayButton from "./Abrir3DPlayButton";

/*
 * Implosão do item: "onde ele é usado" no ERP. Aparece no cabeçalho do
 * cadastro quando o item é a raiz da consulta -- pesquisou-se só a peça,
 * e a árvore não tem pai nenhum para mostrar.
 *
 * A lista abre FLUTUANDO por cima do formulário, de propósito: se ela
 * ocupasse espaço no cabeçalho, empurraria o formulário e o modal
 * voltaria a rolar.
 */

/*
 * Item muito usado tem milhares de pais (o "9" tem 4.705 em produção):
 * a lista mostra só os vigentes por padrão, tem busca, e desenha no
 * máximo este tanto -- o resto aparece refinando a busca.
 */
const LIMITE_EXIBIDOS = 100;
const BUSCA_A_PARTIR_DE = 8;

/* Vigente primeiro; depois o código em ordem NUMÉRICA -- o ERP ordena
   como texto ("174194" antes de "78066"). */
function ordenarPais(pais: PaiErp[]): PaiErp[] {
    return [...pais].sort((a, b) => {
        if (a.STATUS_VALIDADE !== b.STATUS_VALIDADE) {
            return a.STATUS_VALIDADE === "VALIDO" ? -1 : 1;
        }

        const porCodigo = String(a.COD_ITEM_PAI).localeCompare(String(b.COD_ITEM_PAI), "pt-BR", {
            numeric: true,
        });

        return porCodigo !== 0 ? porCodigo : Number(a.SEQ_ORD ?? 0) - Number(b.SEQ_ORD ?? 0);
    });
}

type Estado =
    | { estado: "fechado" }
    | { estado: "carregando" }
    | { estado: "ok"; pais: PaiErp[] }
    | { estado: "erro"; mensagem: string };

export function PaisNoErp({
    codItem,
    onErro,
}: {
    codItem: string;
    /* Erro ao abrir o 2D/3D de um pai: o modal mostra no rodapé. */
    onErro: (mensagem: string) => void;
}) {
    const [estado, setEstado] = useState<Estado>({ estado: "fechado" });
    const [aberto, setAberto] = useState(false);
    /* Uma consulta por abertura do modal: reabrir a lista não pede de novo. */
    const carregado = useRef<PaiErp[] | null>(null);
    const caixaRef = useRef<HTMLDivElement | null>(null);
    const [busca, setBusca] = useState("");
    const [mostrarVencidos, setMostrarVencidos] = useState(false);

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

    async function alternar() {
        if (aberto) {
            setAberto(false);
            return;
        }

        setAberto(true);

        if (carregado.current) {
            setEstado({ estado: "ok", pais: carregado.current });
            return;
        }

        setEstado({ estado: "carregando" });
        const resultado = await buscarPaisNoErp(codItem);

        if (!resultado.ok) {
            setEstado({ estado: "erro", mensagem: resultado.mensagem });
            return;
        }

        carregado.current = ordenarPais(resultado.pais);
        setEstado({ estado: "ok", pais: carregado.current });
    }

    const todos = useMemo(() => (estado.estado === "ok" ? estado.pais : []), [estado]);
    const validos = todos.filter((p) => p.STATUS_VALIDADE === "VALIDO").length;
    const vencidos = todos.length - validos;

    /* Só vencidos? Aí mostra eles mesmo -- esconder tudo seria pior. */
    const incluirVencidos = mostrarVencidos || validos === 0;

    const filtrados = useMemo(() => {
        const termo = busca.trim().toLowerCase();

        return todos.filter(
            (p) =>
                (incluirVencidos || p.STATUS_VALIDADE === "VALIDO") &&
                (!termo ||
                    String(p.COD_ITEM_PAI).toLowerCase().includes(termo) ||
                    String(p.DESC_TECNICA_PAI ?? "").toLowerCase().includes(termo))
        );
    }, [todos, busca, incluirVencidos]);

    const exibidos = filtrados.slice(0, LIMITE_EXIBIDOS);

    return (
        <div className={styles.paisErp} ref={caixaRef}>
            <button
                type="button"
                className={styles.botaoCompacto}
                aria-expanded={aberto}
                aria-haspopup="dialog"
                onClick={alternar}
            >
                Ver pais no ERP
            </button>

            {aberto && (
                <div className={styles.paisErpPainel} role="dialog" aria-label={`Onde o item ${codItem} é usado no ERP`}>
                    <strong className={styles.paisErpTitulo}>
                        Onde o {codItem} é usado no ERP
                        {estado.estado === "ok" && (
                            <span>
                                {estado.pais.length === 0
                                    ? "nenhum pai"
                                    : `${estado.pais.length.toLocaleString("pt-BR")} pai${estado.pais.length === 1 ? "" : "s"} · ${validos.toLocaleString("pt-BR")} vigente${validos === 1 ? "" : "s"}`}
                            </span>
                        )}
                    </strong>

                    {estado.estado === "carregando" && <p className={styles.recursoAviso}>Consultando o ERP…</p>}

                    {estado.estado === "erro" && <p className={styles.recursoErro}>{estado.mensagem}</p>}

                    {estado.estado === "ok" && estado.pais.length === 0 && (
                        <p className={styles.recursoAviso}>Este item não é usado na estrutura de nenhum outro item no ERP.</p>
                    )}

                    {estado.estado === "ok" && estado.pais.length > 0 && (
                        <div className={styles.paisErpFiltros}>
                            {todos.length > BUSCA_A_PARTIR_DE && (
                                <input
                                    type="search"
                                    className={styles.formInput}
                                    placeholder="Buscar pai por código ou descrição..."
                                    aria-label="Buscar pai"
                                    value={busca}
                                    onChange={(e) => setBusca(e.target.value)}
                                />
                            )}
                            {vencidos > 0 && validos > 0 && (
                                <Checkbox
                                    label={`Mostrar vencidos (${vencidos})`}
                                    checked={mostrarVencidos}
                                    onChange={(e) => setMostrarVencidos(e.target.checked)}
                                />
                            )}
                        </div>
                    )}

                    {estado.estado === "ok" && estado.pais.length > 0 && filtrados.length === 0 && (
                        <p className={styles.recursoAviso}>Nenhum pai com essa busca.</p>
                    )}

                    {exibidos.length > 0 && (
                        <ul className={styles.paisErpLista}>
                            {/* O mesmo pai pode repetir (outra sequência ou outra
                                vigência da estrutura): o índice desempata a chave. */}
                            {exibidos.map((pai, indice) => (
                                <li key={`${pai.COD_ITEM_PAI}-${pai.SEQ_ORD}-${indice}`} className={styles.recursoLinha}>
                                    <span className={styles.recursoNome}>
                                        <strong>{pai.COD_ITEM_PAI}</strong>
                                        {pai.DESC_TECNICA_PAI && <span>{pai.DESC_TECNICA_PAI}</span>}
                                        <small className={styles.paisErpDetalhe}>
                                            seq {pai.SEQ_ORD ?? "-"} · qtde {pai.QTDE ?? "-"}
                                            {pai.STATUS_VALIDADE === "INVALIDO" && pai.DT_FIM && ` · vencido em ${pai.DT_FIM}`}
                                        </small>
                                    </span>
                                    <Badge variant={pai.STATUS_VALIDADE === "VALIDO" ? "success" : "neutral"}>
                                        {pai.STATUS_VALIDADE === "VALIDO" ? "Vigente" : "Vencido"}
                                    </Badge>

                                    {/* O ERP não informa a revisão do pai: o 3D
                                        abre a mais recente no 3DX. */}
                                    <div className={styles.acoesNaLinha}>
                                        <AbrirPdfItemButton codigo={String(pai.COD_ITEM_PAI)} onErro={onErro} />
                                        <Abrir3DPlayButton
                                            item={{ codigoNormalizado: String(pai.COD_ITEM_PAI) }}
                                            onErro={onErro}
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    {filtrados.length > LIMITE_EXIBIDOS && (
                        <p className={styles.recursoAviso}>
                            Mostrando {LIMITE_EXIBIDOS} de {filtrados.length.toLocaleString("pt-BR")}. Refine a busca para ver os outros.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
