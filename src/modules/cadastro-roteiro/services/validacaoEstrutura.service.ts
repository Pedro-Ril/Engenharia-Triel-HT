import { buscarEstruturaProduto } from "@/modules/consulta-estrutura/services/estruturaProduto.service";
import type { EstruturaApiItem } from "@/modules/consulta-estrutura/types/estruturaProduto.types";

import type { RoteiroTreeNode } from "../types/cadastroRoteiro.types";

/*
 * Confere a estrutura que veio do 3DEXPERIENCE contra a estrutura do
 * ERP -- a mesma que a tela Consulta Estrutura mostra (o fetch é o dela,
 * reaproveitado).
 *
 * Compara LIGAÇÕES, não códigos soltos: um item pode existir em outro
 * ponto da estrutura do ERP e mesmo assim faltar debaixo deste pai.
 *
 * Só se conferem os filhos de item FABRICADO. Item comprado é comprado
 * inteiro e não tem estrutura no ERP; os subcomponentes que o 3DX
 * modela dentro dele (base, lente, metades...) nunca vão estar lá. No
 * item 299752, 6 das 8 "divergências" brutas eram exatamente isso.
 *
 * Só entram itens que têm a propriedade COD no 3DX -- ver
 * temPropriedadeCod abaixo.
 *
 * O sentido contrário (o ERP tem e o 3DX não) não é conferido: lá
 * entra a matéria-prima, que o 3DX não modela, e viraria ruído.
 *
 * Quando a ligação existe, confere também a QUANTIDADE: no 3DX cada
 * instância é uma peça, então o número de vezes que o filho aparece
 * debaixo do pai tem que bater com a QTDE da ligação no ERP (283185 >
 * 283181: 3 instâncias no 3DX, QTDE 1 no Focco). QTDE fracionada (peça
 * em metro, kg...) não é conferida: não se compara com contagem de
 * instâncias.
 */

/* "ausente": a ligação não existe no ERP. "vencida": existe, mas
   fora da validade -- na prática também não está na estrutura atual.
   "quantidade": existe e está válida, mas o 3DX tem outra quantidade. */
export type TipoDivergencia = "ausente" | "vencida" | "quantidade";

/* O que a badge de cada nó precisa: o tipo e, na de quantidade, os dois lados. */
export type DivergenciaNo = {
    tipo: TipoDivergencia;
    qtde3dx?: number;
    qtdeErp?: number;
};

export type DivergenciaEstrutura = {
    codigoPai: string;
    codigoFilho: string;
    descricaoFilho: string;
    tipo: TipoDivergencia;
    /* Quantas vezes a ligação aparece na árvore do 3DX. */
    instancias: number;
    /* Só na de quantidade: peças debaixo do pai no 3DX x QTDE no ERP. */
    qtde3dx?: number;
    qtdeErp?: number;
    /* id do nó da PRIMEIRA ocorrência na árvore: é para onde o banner
       leva quando a pessoa clica na divergência. */
    noId: string;
};

export type ResultadoValidacaoEstrutura = {
    /* id do nó da árvore -> divergência. É o que a badge lê. */
    porNo: Map<string, DivergenciaNo>;
    /* Uma entrada por ligação pai > filho, para o banner. */
    divergencias: DivergenciaEstrutura[];
    /* Ligações de item fabricado que foram de fato conferidas. */
    ligacoesConferidas: number;
};

function normalizar(valor?: string | null): string {
    return String(valor ?? "").trim();
}

/*
 * O item tem a propriedade COD no 3DX, ou seja, foi codificado para o
 * ERP?
 *
 * A API da estrutura (proserver:1001) não devolve o atributo COD em si:
 * o campo `codigo` dela é tirado do TÍTULO do nó, cortando o sufixo de
 * configuração ("304676(Default<As Machined>)" vira "304676"). Por
 * isso um nó nunca codificado chega com `codigo` preenchido do mesmo
 * jeito -- às vezes nem numérico, como "150250_DYNO_parachoque".
 *
 * O que separa os dois casos são os atributos de item do ERP, que são
 * preenchidos junto com o COD: nó codificado traz `tipoint` ou
 * `descricao`, e o não codificado não traz nenhum dos dois. Os dois
 * juntos, e não só um: há item real sem `tipoint` (299301, com
 * estrutura no ERP) e item real sem `descricao` (299908).
 *
 * Conferido em 6 estruturas reais (4.394 nós): só 4 nós não têm
 * nenhum dos dois, e são exatamente os 4 que apareciam como falsa
 * divergência. Se a API passar a devolver o COD, a troca é só aqui.
 */
function temPropriedadeCod(node: RoteiroTreeNode): boolean {
    return Boolean(normalizar(node.tipoint) || normalizar(node.descricao));
}

function ehFabricado(node: RoteiroTreeNode): boolean {
    return normalizar(node.tipoint).toLowerCase() === "fabricado";
}

/* "2.1.3" -> "2.1"; "2" -> "" (filho direto da raiz). */
function ordemDoPai(ordem?: string | null): string {
    const partes = normalizar(ordem).split(".");
    partes.pop();
    return partes.join(".");
}

/*
 * QTDE de cada ligação pai > filho válida no ERP.
 *
 * A estrutura do ERP vem EXPLODIDA a partir da raiz: um pai usado em
 * dois lugares aparece duas vezes, com as mesmas ligações repetidas.
 * Somar tudo dobraria a quantidade -- então soma só as linhas de UMA
 * ocorrência do pai (a primeira), que é a quantidade cadastrada. Mais de
 * uma linha válida para o mesmo filho na mesma ocorrência (sequências
 * diferentes) é quantidade somada, como o ERP consome.
 */
function quantidadesNoErp(linhasErp: EstruturaApiItem[]): Map<string, number> {
    const primeiraOcorrencia = new Map<string, string>();
    const quantidades = new Map<string, number>();

    for (const linha of linhasErp) {
        if (normalizar(linha.STATUS_VALIDADE).toUpperCase() !== "VALIDO") continue;

        const chave = `${normalizar(linha.COD_ITEM_PAI)}>${normalizar(linha.COD_ITEM_FILHO)}`;
        const ocorrencia = ordemDoPai(linha.ORDEM_HIERARQUICA);
        const primeira = primeiraOcorrencia.get(chave);

        if (primeira === undefined) primeiraOcorrencia.set(chave, ocorrencia);
        else if (primeira !== ocorrencia) continue;

        quantidades.set(chave, (quantidades.get(chave) ?? 0) + Number(linha.QTDE ?? 0));
    }

    return quantidades;
}

export function compararEstrutura(
    tree: RoteiroTreeNode,
    linhasErp: EstruturaApiItem[]
): ResultadoValidacaoEstrutura {
    const validas = new Set<string>();
    const vencidas = new Set<string>();

    for (const linha of linhasErp) {
        const chave = `${normalizar(linha.COD_ITEM_PAI)}>${normalizar(linha.COD_ITEM_FILHO)}`;
        const status = normalizar(linha.STATUS_VALIDADE).toUpperCase();

        if (status === "VALIDO") validas.add(chave);
        else vencidas.add(chave);
    }

    const qtdeErp = quantidadesNoErp(linhasErp);
    const porNo = new Map<string, DivergenciaNo>();
    const porLigacao = new Map<string, DivergenciaEstrutura>();
    const conferidas = new Set<string>();

    /*
     * Confere a quantidade de cada filho (por código) debaixo DESTE pai:
     * soma as instâncias (nó vindo do ERP, como o da Ciber, já traz a
     * quantidade) e compara com a QTDE da ligação.
     */
    function conferirQuantidades(codigoPai: string, filhos: RoteiroTreeNode[]) {
        const porCodigo = new Map<string, RoteiroTreeNode[]>();

        for (const filho of filhos) {
            const chave = `${codigoPai}>${filho.codigoNormalizado}`;
            if (!validas.has(chave)) continue;

            const grupo = porCodigo.get(chave);
            if (grupo) grupo.push(filho);
            else porCodigo.set(chave, [filho]);
        }

        for (const [chave, grupo] of porCodigo) {
            const noErp = qtdeErp.get(chave);
            if (noErp === undefined || !Number.isInteger(noErp)) continue;

            const no3dx = grupo.reduce((soma, filho) => soma + (filho.quantidade ?? 1), 0);
            if (no3dx === noErp) continue;

            const divergencia: DivergenciaNo = { tipo: "quantidade", qtde3dx: no3dx, qtdeErp: noErp };
            for (const filho of grupo) porNo.set(filho.id, divergencia);

            /* O mesmo pai em vários lugares da árvore repete a mesma divergência: uma entrada só. */
            if (!porLigacao.has(chave)) {
                porLigacao.set(chave, {
                    codigoPai,
                    codigoFilho: grupo[0].codigoNormalizado,
                    descricaoFilho: grupo[0].descricaoNormalizada,
                    tipo: "quantidade",
                    instancias: grupo.length,
                    qtde3dx: no3dx,
                    qtdeErp: noErp,
                    noId: grupo[0].id,
                });
            }
        }
    }

    function percorrer(node: RoteiroTreeNode) {
        const codigoPai = node.codigoNormalizado;
        const conferir = ehFabricado(node);

        if (conferir) conferirQuantidades(codigoPai, node.children.filter(temPropriedadeCod));

        for (const filho of node.children) {
            if (conferir && temPropriedadeCod(filho)) {
                const chave = `${codigoPai}>${filho.codigoNormalizado}`;
                conferidas.add(chave);

                if (!validas.has(chave)) {
                    /* Vencida só se não houver nenhuma versão válida. */
                    const tipo: TipoDivergencia = vencidas.has(chave) ? "vencida" : "ausente";
                    porNo.set(filho.id, { tipo });

                    const existente = porLigacao.get(chave);

                    if (existente) {
                        existente.instancias += 1;
                    } else {
                        porLigacao.set(chave, {
                            codigoPai,
                            codigoFilho: filho.codigoNormalizado,
                            descricaoFilho: filho.descricaoNormalizada,
                            tipo,
                            instancias: 1,
                            noId: filho.id,
                        });
                    }

                    /*
                     * Não desce: a estrutura do ERP vem explodida a partir
                     * da raiz, então se esta ligação falta, nada abaixo do
                     * filho aparece nela -- cada descendente viraria mais
                     * um "Não tem no ERP" repetindo a mesma causa.
                     */
                    continue;
                }
            }

            percorrer(filho);
        }
    }

    percorrer(tree);

    return {
        porNo,
        divergencias: [...porLigacao.values()],
        ligacoesConferidas: conferidas.size,
    };
}

export async function validarEstruturaNoErp(
    tree: RoteiroTreeNode
): Promise<ResultadoValidacaoEstrutura> {
    /*
     * Estrutura inexistente no ERP volta como sucesso com lista vazia --
     * aí toda ligação vira divergência, que é o correto. Falha de
     * comunicação lança, e a tela mostra "não foi possível conferir"
     * em vez de fingir que está tudo certo.
     */
    const erp = await buscarEstruturaProduto(tree.codigoNormalizado);

    return compararEstrutura(tree, erp.data);
}
