"use client";

/*
 * Campo de busca com lista (o "SearchSelect" do cadastro de operação) e
 * o teclado dele. Saiu de dentro de CadastroOperacaoModal.tsx sem mudar
 * comportamento, para ser usado também na escolha de máquinas e
 * componentes (RecursosConsumosOperacao.tsx).
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as EventoTeclado, Ref } from "react";

import styles from "@/app/cadastro-roteiro/cadastro-roteiro.module.css";

export type SelectOption = {
    codigo: string;
    descricao: string;
    /*
     * O que vai para o campo ao escolher, quando não é "código -
     * descrição". Serve para a lista mostrar um complemento (ex.: no
     * Roteiro, "3 operações no ERP") sem ele virar parte do valor.
     */
    valor?: string;
};

export function formatarOption(option: SelectOption) {
    if (!option.codigo && !option.descricao) return "";
    if (option.codigo === option.descricao) return option.descricao;
    return `${option.codigo} - ${option.descricao}`;
}

// =========================================
// TECLADO DOS CAMPOS DE BUSCA
// =========================================

/*
 * Setas andam pela lista, Enter escolhe, Esc desiste e Tab segue para o
 * proximo campo. Os dois campos de busca do modal usam este mesmo hook
 * para nao divergirem no comportamento.
 *
 * As opcoes continuam sendo <button>, mas saem da ordem de tabulacao
 * (tabIndex -1): antes o Tab entrava na lista aberta em vez de ir para o
 * campo seguinte, que era a maior queixa de quem preenche so no teclado.
 */
export function useTecladoBusca<T>({
    opcoes,
    aberto,
    abrir,
    fechar,
    escolher,
}: {
    opcoes: T[];
    aberto: boolean;
    abrir: () => void;
    fechar: () => void;
    escolher: (opcao: T) => void;
}) {
    const [indiceAtivo, setIndiceAtivo] = useState(0);
    const listaRef = useRef<HTMLDivElement | null>(null);

    /*
     * A lista encolhe conforme a pessoa digita, entao o indice guardado
     * pode acabar fora dela -- o destaque e sempre lido preso ao tamanho
     * atual, em vez de corrigido num efeito.
     */
    const ativo = opcoes.length > 0 ? Math.min(indiceAtivo, opcoes.length - 1) : -1;

    /*
     * A lista abre para cima quando não cabe embaixo. O corpo do modal
     * rola (overflow: auto) e corta o que passa da borda -- e os campos de
     * máquina e componente ficam no fim do formulário, sem espaço abaixo.
     * Mede antes de pintar e ajusta direto no elemento da lista.
     */
    useLayoutEffect(() => {
        const lista = listaRef.current;
        const campo = lista?.parentElement;
        const entrada = campo?.querySelector("input");

        if (!aberto || !lista || !campo || !entrada) return;

        /* Primeiro ancestral que corta o conteúdo; sem ele, a janela. */
        let recorte: DOMRect | null = null;

        for (let el = campo.parentElement; el; el = el.parentElement) {
            if (getComputedStyle(el).overflowY !== "visible") {
                recorte = el.getBoundingClientRect();
                break;
            }
        }

        const limiteTopo = recorte?.top ?? 0;
        const limiteBase = recorte?.bottom ?? window.innerHeight;
        const caixaCampo = campo.getBoundingClientRect();
        const caixaEntrada = entrada.getBoundingClientRect();

        const MARGEM = 8;
        const ALTURA_MAXIMA = 220;
        const espacoAbaixo = limiteBase - caixaEntrada.bottom - MARGEM;
        const espacoAcima = caixaEntrada.top - limiteTopo - MARGEM;
        const alturaDesejada = Math.min(ALTURA_MAXIMA, lista.scrollHeight);
        const paraCima = espacoAbaixo < alturaDesejada && espacoAcima > espacoAbaixo;

        if (paraCima) {
            lista.style.top = "auto";
            lista.style.bottom = `${caixaCampo.bottom - caixaEntrada.top + 4}px`;
        } else {
            lista.style.top = "";
            lista.style.bottom = "";
        }

        lista.style.maxHeight = `${Math.max(
            96,
            Math.min(ALTURA_MAXIMA, paraCima ? espacoAcima : espacoAbaixo)
        )}px`;
    }, [aberto, opcoes.length]);

    function destacar(indice: number, rolar = true) {
        setIndiceAtivo(indice);

        if (!rolar) return;

        const item = listaRef.current?.children[indice] as HTMLElement | undefined;

        item?.scrollIntoView({ block: "nearest" });
    }

    function aoTeclar(evento: EventoTeclado<HTMLInputElement>) {
        if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
            evento.preventDefault();

            if (!aberto) {
                abrir();
                destacar(0);
                return;
            }

            if (opcoes.length === 0) return;

            const passo = evento.key === "ArrowDown" ? 1 : -1;

            /* Da a volta: do fim pro comeco e vice-versa. */
            destacar((ativo + passo + opcoes.length) % opcoes.length);
            return;
        }

        if (evento.key === "Enter") {
            /* Ctrl+Enter é o atalho de salvar do modal, não escolha. */
            if (evento.ctrlKey || evento.metaKey) return;
            if (!aberto || ativo < 0) return;

            /* Sem isto o Enter vazaria para o botao de salvar. */
            evento.preventDefault();
            escolher(opcoes[ativo]);
            return;
        }

        if (evento.key === "Escape") {
            if (!aberto) return;

            /* Fecha so a lista -- o modal continua aberto. */
            evento.preventDefault();
            evento.stopPropagation();
            fechar();
            return;
        }

        /* Tab nao e bloqueado: a lista some e o foco segue sozinho. */
        if (evento.key === "Tab") fechar();
    }

    return { ativo, listaRef, aoTeclar, destacar };
}

// =========================================
// SEARCH SELECT
// =========================================
export function SearchSelect({
    label,
    required,
    value,
    options,
    placeholder,
    onChange,
    inputRef,
    invalido = false,
    disabled = false,
}: {
    /* Travado enquanto o modal grava ou valida no ERP. */
    disabled?: boolean;
    /* Para o modal pôr o foco aqui (erro de validação, abertura). */
    inputRef?: Ref<HTMLInputElement>;
    /* Borda de erro e aria-invalid. */
    invalido?: boolean;
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
    /* Liga o campo a lista para o leitor de tela (aria-controls). */
    const idLista = useId();

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

    const listaVisivel = !disabled && (opened || !!search) && filteredOptions.length > 0;

    function fecharLista() {
        setOpened(false);
        setSearch("");
    }

    function escolher(option: SelectOption) {
        onChange(option.valor ?? formatarOption(option));
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
                {label}
                {required && <span className={styles.required}>*</span>}
            </label>

            <input
                ref={inputRef}
                type="text"
                className={invalido ? `${styles.formInput} ${styles.formInputInvalido}` : styles.formInput}
                aria-invalid={invalido || undefined}
                placeholder={placeholder || "Pesquisar..."}
                value={search || value}
                disabled={disabled}
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

                    /*
                     * Digitar so filtra: o valor do campo so muda quando uma
                     * opcao e de fato escolhida. Antes o texto solto virava o
                     * valor, entao "cor" passava pela validacao como se fosse
                     * uma operacao do ERP. Apagar tudo continua limpando.
                     */
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
                            key={option.codigo}
                            type="button"
                            tabIndex={-1}
                            role="option"
                            aria-selected={indice === ativo}
                            className={
                                indice === ativo
                                    ? `${styles.searchOption} ${styles.searchOptionAtivo}`
                                    : styles.searchOption
                            }
                            /* Sem isto o input perde o foco antes do clique. */
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => destacar(indice, false)}
                            onClick={() => escolher(option)}
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
