"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";

import styles from "@/app/cadastro-roteiro/cadastro-roteiro.module.css";

import { buscarRecursosDoCentro } from "../services/cadastroRoteiro.service";
import type {
    ComponenteEstrutura,
    ConsumoForm,
    RecursoDisponivel,
    RecursoForm,
} from "../types/cadastroRoteiro.types";
import { formatarOption, SearchSelect, type SelectOption } from "./CampoBusca";

/*
 * Recursos (máquinas) e consumos (componentes da estrutura) de UMA
 * operação, como na tela FENG0202 do ERP.
 *
 * - Recurso: só máquinas ativas do centro de trabalho da operação -- a
 *   API recusa máquina de outro centro, então a lista já vem filtrada.
 * - Consumo: só componentes da estrutura do item no ERP. O mesmo código
 *   pode aparecer em mais de uma sequência da estrutura, por isso cada
 *   opção é "código · seq". A API soma o percentual por componente no
 *   alternativo e recusa passar de 100%; aqui só se mostra quanto já é
 *   consumido em outras operações, para a pessoa não descobrir no erro.
 */

/* Consumo de uma operação que está na fila do modal (ainda não no ERP). */
export type ConsumoNaFila = {
    alternativo: number;
    seq: number;
    codItem: string;
    seqOrd: number;
    perConsumo: number;
};

type EstadoRecursos =
    | { estado: "ok"; lista: RecursoDisponivel[] }
    | { estado: "erro"; mensagem: string };

interface Props {
    /* Código do centro escolhido na operação ("" enquanto não há). */
    codCentro: string;
    recursos: RecursoForm[];
    consumos: ConsumoForm[];
    componentes: ComponenteEstrutura[];
    /* A própria operação, para não contar o consumo dela como "de outra". */
    alternativo: number;
    seq: number;
    /* Lendo o roteiro do ERP: os dados ainda não chegaram. */
    carregando: boolean;
    erroErp: string;
    disabled: boolean;
    /*
     * A pessoa escolheu o centro agora: se ele tiver uma máquina só, ela
     * entra sozinha (uma vez por centro -- removida, não volta).
     */
    sugerirMaquinaUnica: boolean;
    /* Consumos das operações na fila: contam no que já foi consumido. */
    consumidosNaFila: ConsumoNaFila[];
    onRecursosChange: (recursos: RecursoForm[]) => void;
    onConsumosChange: (consumos: ConsumoForm[]) => void;
}

function chaveConsumo(codItem: string, seqOrd: number) {
    return `${codItem}·${seqOrd}`;
}

function formatarPercentual(valor: number): string {
    return valor.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 4 });
}

export function RecursosConsumosOperacao({
    codCentro,
    recursos,
    consumos,
    componentes,
    alternativo,
    seq,
    carregando,
    erroErp,
    disabled,
    sugerirMaquinaUnica,
    consumidosNaFila,
    onRecursosChange,
    onConsumosChange,
}: Props) {
    /*
     * Máquinas por centro, guardadas pelo código: trocar de centro e
     * voltar não pede a lista de novo. O estado "carregando" é derivado
     * (centro escolhido sem entrada no mapa), sem setState síncrono no
     * efeito.
     */
    const [porCentro, setPorCentro] = useState<Record<string, EstadoRecursos>>({});
    const pedidos = useRef(new Set<string>());

    useEffect(() => {
        if (!codCentro || pedidos.current.has(codCentro)) return;

        pedidos.current.add(codCentro);

        buscarRecursosDoCentro(codCentro)
            .then((lista) =>
                setPorCentro((atual) => ({ ...atual, [codCentro]: { estado: "ok", lista } }))
            )
            .catch((erro) => {
                /* Libera para tentar de novo ao reabrir o centro. */
                pedidos.current.delete(codCentro);
                setPorCentro((atual) => ({
                    ...atual,
                    [codCentro]: {
                        estado: "erro",
                        mensagem: erro instanceof Error ? erro.message : "Erro ao carregar as máquinas.",
                    },
                }));
            });
    }, [codCentro]);

    const estadoRecursos = codCentro ? porCentro[codCentro] : undefined;
    const carregandoRecursos = Boolean(codCentro) && !estadoRecursos;

    /* Centro para o qual a máquina única já foi sugerida. */
    const sugeridoPara = useRef("");

    useEffect(() => {
        /*
         * O modal desliga a sugestão ao passar para a próxima operação (e
         * ao abrir): é a deixa para esquecer o centro já sugerido. Sem
         * isto o ref guardava o centro da 1ª operação para sempre, e a
         * 2ª operação no mesmo centro vinha sem a máquina.
         */
        if (!sugerirMaquinaUnica) {
            sugeridoPara.current = "";
            return;
        }

        if (!codCentro || sugeridoPara.current === codCentro) return;
        if (estadoRecursos?.estado !== "ok") return;

        sugeridoPara.current = codCentro;

        if (estadoRecursos.lista.length !== 1 || recursos.length > 0) return;

        const unica = estadoRecursos.lista[0];
        onRecursosChange([
            {
                codRecurso: String(unica.COD_RECURSO),
                descricao: String(unica.DESC_RECURSO ?? ""),
                preferencial: true,
            },
        ]);
    }, [sugerirMaquinaUnica, codCentro, estadoRecursos, recursos.length, onRecursosChange]);

    const opcoesRecursos: SelectOption[] = useMemo(() => {
        if (estadoRecursos?.estado !== "ok") return [];

        const escolhidos = new Set(recursos.map((r) => r.codRecurso.toUpperCase()));

        return estadoRecursos.lista
            .filter((r) => !escolhidos.has(String(r.COD_RECURSO).toUpperCase()))
            .map((r) => ({ codigo: String(r.COD_RECURSO), descricao: String(r.DESC_RECURSO ?? "") }));
    }, [estadoRecursos, recursos]);

    /* Só componente vigente da estrutura, e ainda não escolhido. */
    const componentesVigentes = useMemo(
        () => componentes.filter((c) => c.vigente),
        [componentes]
    );

    /* Opção -> componente pelo rótulo exibido ("código · seq N - descrição"),
       que é único por código + sequência. */
    const { opcoesConsumos, componentePorRotulo } = useMemo(() => {
        const escolhidos = new Set(consumos.map((c) => chaveConsumo(c.codItem, c.seqOrd)));
        const mapa = new Map<string, ComponenteEstrutura>();
        const opcoes: SelectOption[] = [];

        for (const c of componentesVigentes) {
            if (escolhidos.has(chaveConsumo(c.cod_item, c.seq_ord))) continue;

            const opcao = { codigo: `${c.cod_item} · seq ${c.seq_ord}`, descricao: String(c.descricao ?? "") };
            opcoes.push(opcao);
            mapa.set(formatarOption(opcao), c);
        }

        return { opcoesConsumos: opcoes, componentePorRotulo: mapa };
    }, [componentesVigentes, consumos]);

    function adicionarRecurso(valor: string) {
        if (!valor || estadoRecursos?.estado !== "ok") return;

        const escolhido = opcoesRecursos.find((o) => formatarOption(o) === valor);
        if (!escolhido) return;

        onRecursosChange([
            ...recursos,
            /* A tela do ERP grava sempre como preferencial. */
            { codRecurso: escolhido.codigo, descricao: escolhido.descricao, preferencial: true },
        ]);
    }

    function adicionarConsumo(valor: string) {
        if (!valor) return;

        const componente = componentePorRotulo.get(valor);
        if (!componente) return;

        onConsumosChange([
            ...consumos,
            {
                codItem: componente.cod_item,
                descricao: String(componente.descricao ?? ""),
                seqOrd: componente.seq_ord,
                /* A tela grava 100% em 99,98% dos casos. */
                perConsumo: "100",
            },
        ]);
    }

    /* Quanto do componente já é consumido em OUTRAS operações do mesmo
       alternativo -- no ERP e na fila deste modal. A API recusa a soma
       passando de 100%. */
    function consumoEmOutras(codItem: string, seqOrd: number): { total: number; onde: string } {
        const componente = componentes.find((c) => c.cod_item === codItem && c.seq_ord === seqOrd);
        const noErp = (componente?.consumidoEm ?? [])
            .filter((c) => c.alternativo === alternativo && c.seq !== seq)
            .map((c) => ({ seq: c.seq, per: c.per_consumo, fila: false }));
        const naFila = consumidosNaFila
            .filter(
                (c) =>
                    c.codItem === codItem &&
                    c.seqOrd === seqOrd &&
                    c.alternativo === alternativo &&
                    c.seq !== seq
            )
            .map((c) => ({ seq: c.seq, per: c.perConsumo, fila: true }));
        const outras = [...noErp, ...naFila];

        return {
            total: outras.reduce((soma, c) => soma + c.per, 0),
            onde: outras
                .map((c) => `seq ${c.seq}${c.fila ? " na fila" : ""} (${formatarPercentual(c.per)}%)`)
                .join(", "),
        };
    }

    /*
     * "Consumir pendentes": todo componente vigente que ainda tem o que
     * consumir (nem 100% somando ERP e fila) e não está nesta operação,
     * com o que sobra. É o caso típico da última operação do roteiro.
     */
    const pendentes = componentesVigentes
        .filter((c) => !consumos.some((x) => x.codItem === c.cod_item && x.seqOrd === c.seq_ord))
        .map((c) => ({ componente: c, sobra: 100 - consumoEmOutras(c.cod_item, c.seq_ord).total }))
        .filter((p) => p.sobra > 0.0001);

    function consumirPendentes() {
        onConsumosChange([
            ...consumos,
            ...pendentes.map(({ componente, sobra }) => ({
                codItem: componente.cod_item,
                descricao: String(componente.descricao ?? ""),
                seqOrd: componente.seq_ord,
                perConsumo: formatarPercentual(Math.round(sobra * 10000) / 10000),
            })),
        ]);
    }

    const bloqueado = disabled || carregando || Boolean(erroErp);

    return (
        <div className={styles.formFaixaRecursos}>
            <fieldset className={styles.formFieldset}>
                <legend>Recursos (máquinas)</legend>

                {!codCentro ? (
                    <p className={styles.recursoAviso}>Escolha o centro de trabalho para listar as máquinas.</p>
                ) : carregando || carregandoRecursos ? (
                    <p className={styles.recursoAviso}>Carregando…</p>
                ) : estadoRecursos?.estado === "erro" ? (
                    <p className={styles.recursoErro}>{estadoRecursos.mensagem}</p>
                ) : (
                    <SearchSelect
                        label="Adicionar máquina"
                        value=""
                        disabled={bloqueado}
                        options={opcoesRecursos}
                        placeholder={
                            opcoesRecursos.length === 0 && recursos.length === 0
                                ? "Nenhuma máquina ativa neste centro"
                                : "Pesquisar máquina..."
                        }
                        onChange={adicionarRecurso}
                    />
                )}

                {recursos.length > 0 && (
                    <ul className={styles.recursoLista}>
                        {recursos.map((recurso) => (
                            <li key={recurso.codRecurso} className={styles.recursoLinha}>
                                <span className={styles.recursoNome}>
                                    <strong>{recurso.codRecurso}</strong>
                                    {recurso.descricao && <span>{recurso.descricao}</span>}
                                </span>

                                <Checkbox
                                    label="Preferencial"
                                    checked={recurso.preferencial}
                                    disabled={bloqueado}
                                    onChange={(e) =>
                                        onRecursosChange(
                                            recursos.map((r) =>
                                                r.codRecurso === recurso.codRecurso
                                                    ? { ...r, preferencial: e.target.checked }
                                                    : r
                                            )
                                        )
                                    }
                                />

                                <IconButton
                                    icon={<Trash2 size={15} />}
                                    label={`Remover a máquina ${recurso.codRecurso}`}
                                    variant="danger"
                                    size="small"
                                    disabled={bloqueado}
                                    onClick={() =>
                                        onRecursosChange(recursos.filter((r) => r.codRecurso !== recurso.codRecurso))
                                    }
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </fieldset>

            <fieldset className={styles.formFieldset}>
                <legend className={styles.legendaComAcao}>
                    Consumos
                    {!carregando && !erroErp && pendentes.length > 0 && (
                        <button
                            type="button"
                            className={styles.botaoCompacto}
                            disabled={bloqueado}
                            title={`Adiciona com o percentual que sobra: ${pendentes
                                .map((p) => `${p.componente.cod_item} (${formatarPercentual(p.sobra)}%)`)
                                .join(", ")}`}
                            onClick={consumirPendentes}
                        >
                            Consumir pendentes ({pendentes.length})
                        </button>
                    )}
                </legend>

                {carregando ? (
                    <p className={styles.recursoAviso}>Lendo o roteiro e a estrutura no ERP…</p>
                ) : erroErp ? (
                    <p className={styles.recursoErro}>{erroErp}</p>
                ) : componentesVigentes.length === 0 ? (
                    <p className={styles.recursoAviso}>O item não tem componentes na estrutura do ERP.</p>
                ) : (
                    <SearchSelect
                        label="Adicionar componente"
                        value=""
                        disabled={bloqueado}
                        options={opcoesConsumos}
                        placeholder="Pesquisar componente..."
                        onChange={adicionarConsumo}
                    />
                )}

                {consumos.length > 0 && (
                    <ul className={styles.recursoLista}>
                        {consumos.map((consumo) => {
                            const outras = consumoEmOutras(consumo.codItem, consumo.seqOrd);

                            return (
                                <li key={chaveConsumo(consumo.codItem, consumo.seqOrd)} className={styles.recursoLinha}>
                                    <span className={styles.recursoNome}>
                                        <strong>
                                            {consumo.codItem} · seq {consumo.seqOrd}
                                        </strong>
                                        {consumo.descricao && <span>{consumo.descricao}</span>}
                                        {outras.total > 0 && (
                                            <small className={styles.recursoDica}>
                                                Já consumido em {outras.onde} — sobra até {formatarPercentual(Math.max(0, 100 - outras.total))}%.
                                            </small>
                                        )}
                                    </span>

                                    <label className={styles.consumoPercentual}>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            className={styles.formInput}
                                            aria-label={`Percentual de consumo de ${consumo.codItem}`}
                                            value={consumo.perConsumo}
                                            disabled={bloqueado}
                                            onChange={(e) =>
                                                onConsumosChange(
                                                    consumos.map((c) =>
                                                        c.codItem === consumo.codItem && c.seqOrd === consumo.seqOrd
                                                            ? { ...c, perConsumo: e.target.value }
                                                            : c
                                                    )
                                                )
                                            }
                                        />
                                        %
                                    </label>

                                    <IconButton
                                        icon={<Trash2 size={15} />}
                                        label={`Remover o consumo de ${consumo.codItem}`}
                                        variant="danger"
                                        size="small"
                                        disabled={bloqueado}
                                        onClick={() =>
                                            onConsumosChange(
                                                consumos.filter(
                                                    (c) => !(c.codItem === consumo.codItem && c.seqOrd === consumo.seqOrd)
                                                )
                                            )
                                        }
                                    />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </fieldset>
        </div>
    );
}
