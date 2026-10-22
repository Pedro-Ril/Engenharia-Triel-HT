/*
 * Tempo da operação no padrão BR: vírgula nos decimais, até 6 casas (o
 * que o ERP guarda). Usado no modal de cadastro e nos cards da árvore,
 * para os dois mostrarem o mesmo número do mesmo jeito.
 */

/*
 * Tempo: só número, com vírgula para os decimais (padrão BR) e no máximo
 * 6 casas -- o que o ERP guarda. Ponto vira vírgula; o resto é descartado
 * enquanto a pessoa digita, então "abc" nem entra.
 */
export function mascararTempo(valor: string): string {
    const limpo = String(valor).replace(/\./g, ",").replace(/[^\d,]/g, "");
    const [inteiro, ...resto] = limpo.split(",");

    if (resto.length === 0) return inteiro;

    return `${inteiro || "0"},${resto.join("").slice(0, 6)}`;
}

/* Número do ERP -> texto da tela (2.27 -> "2,27"). */
export function formatarTempo(valor?: number | null): string {
    if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return "";

    return Number(valor).toLocaleString("pt-BR", {
        useGrouping: false,
        maximumFractionDigits: 6,
    });
}

/* Texto da tela -> número do ERP; vazio vira null (sem tempo). */
export function tempoParaNumero(texto: string): number | null {
    const limpo = String(texto ?? "").trim();
    if (!limpo) return null;

    const numero = Number(limpo.replace(",", "."));
    return Number.isFinite(numero) ? numero : null;
}
