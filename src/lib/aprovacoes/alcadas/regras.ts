/*
 * Regras puras das alçadas de aprovação -- sem banco, testadas em
 * regras.test.ts. O acesso a dados fica em fluxo.ts e config.ts.
 */

/* aguardando: o nível ainda não chegou | pendente: é a vez dele | encerrado: o ciclo acabou antes (devolução). */
export type StatusEtapa = "aguardando" | "pendente" | "aprovado" | "devolvido" | "encerrado";

export type AcaoEtapa = "aprovar" | "devolver";

export interface RegraAlcada {
  id: string;
  empresa: number | null;
  setor: string | null;
}

/* O que a solicitação traz para escolher a alçada. */
export interface ContextoAlcada {
  empresa: number | null;
  setor: string | null;
}

function normalizarSetor(setor: string | null): string | null {
  const texto = setor?.trim().toLocaleUpperCase("pt-BR");
  return texto ? texto : null;
}

/*
 * A regra mais específica que casa com a solicitação:
 * empresa + setor > só empresa > só setor > padrão do tipo (nenhum dos
 * dois). Regra com empresa ou setor diferentes da solicitação não casa.
 * Setor compara sem diferenciar maiúsculas e espaços nas pontas.
 */
export function escolherAlcada<R extends RegraAlcada>(regras: R[], contexto: ContextoAlcada): R | null {
  const setor = normalizarSetor(contexto.setor);
  let melhor: R | null = null;
  let melhorPeso = -1;

  for (const regra of regras) {
    const setorRegra = normalizarSetor(regra.setor);

    if (regra.empresa !== null && regra.empresa !== contexto.empresa) continue;
    if (setorRegra !== null && setorRegra !== setor) continue;

    const peso = (regra.empresa !== null ? 2 : 0) + (setorRegra !== null ? 1 : 0);

    if (peso > melhorPeso) {
      melhor = regra;
      melhorPeso = peso;
    }
  }

  return melhor;
}

export interface EtapaEstado {
  id: string;
  ordem: number;
  status: StatusEtapa;
}

export interface TransicaoEtapas {
  /* A etapa que foi decidida agora. */
  decidida: EtapaEstado;
  /* Mudanças de status a gravar (inclui a decidida). */
  mudancas: { id: string; status: StatusEtapa }[];
  /* avancou: subiu para o próximo nível | aprovado: era o último | devolvido: voltou ao solicitante. */
  resultado: "avancou" | "aprovado" | "devolvido";
  proxima: EtapaEstado | null;
}

/*
 * Como a cadeia anda quando a etapa pendente é decidida.
 *
 * - aprovar: a pendente vira aprovada e a próxima "aguardando" (na
 *   ordem) passa a pendente; sem próxima, a solicitação está aprovada.
 * - devolver: a pendente vira devolvida e as que ainda aguardavam são
 *   encerradas -- o reenvio abre um ciclo novo, do nível 1.
 *
 * Recebe só as etapas do ciclo atual. Sem etapa pendente, não há o
 * que decidir (já terminou ou foi devolvida): devolve null.
 */
export function transicionar(etapas: EtapaEstado[], acao: AcaoEtapa): TransicaoEtapas | null {
  const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem);
  const pendente = ordenadas.find((etapa) => etapa.status === "pendente");
  if (!pendente) return null;

  const seguintes = ordenadas.filter((etapa) => etapa.ordem > pendente.ordem && etapa.status === "aguardando");

  if (acao === "devolver") {
    return {
      decidida: pendente,
      mudancas: [
        { id: pendente.id, status: "devolvido" },
        ...seguintes.map((etapa) => ({ id: etapa.id, status: "encerrado" as const })),
      ],
      resultado: "devolvido",
      proxima: null,
    };
  }

  const proxima = seguintes[0] ?? null;

  return {
    decidida: pendente,
    mudancas: [
      { id: pendente.id, status: "aprovado" },
      ...(proxima ? [{ id: proxima.id, status: "pendente" as const }] : []),
    ],
    resultado: proxima ? "avancou" : "aprovado",
    proxima,
  };
}

/* Etapas iniciais de um ciclo: o primeiro nível já pendente, os demais aguardando. */
export function etapasIniciais<N extends { ordem: number }>(niveis: N[]): (N & { status: StatusEtapa })[] {
  return [...niveis]
    .sort((a, b) => a.ordem - b.ordem)
    .map((nivel, indice) => ({ ...nivel, status: indice === 0 ? "pendente" : "aguardando" }));
}

/* ---------------------------------------------------------------
   Sugestão de direcionamento do próximo nível
   --------------------------------------------------------------- */

export interface RegraSugestao {
  id: string;
  empresa: number | null;
  /* Prefixos separados por vírgula ("90.02, 90.90"); null = qualquer centro de custo. */
  centrosCusto: string | null;
  /* null = deixar para todos do nível. */
  usuarioId: string | null;
  ordem: number;
}

export interface ContextoSugestao {
  empresa: number | null;
  /* Centro de custo de cada item da solicitação (um por item, repetidos contam). */
  centrosCustoItens: string[];
}

/* "90.02" e "9002204" comparam pelos dígitos: 90.02 é prefixo de 9002204. */
function soDigitos(valor: string): string {
  return valor.replace(/[^0-9]/g, "");
}

export function lerPrefixos(centrosCusto: string | null): string[] {
  return (centrosCusto ?? "")
    .split(/[,;]/)
    .map(soDigitos)
    .filter(Boolean);
}

/* Mais da metade dos itens está num dos centros de custo (prefixos) da regra. */
export function maioriaNosCentrosDeCusto(centrosCustoItens: string[], prefixos: string[]): boolean {
  if (centrosCustoItens.length === 0 || prefixos.length === 0) return false;
  const dentro = centrosCustoItens.filter((cc) => {
    const digitos = soDigitos(cc);
    return digitos !== "" && prefixos.some((prefixo) => digitos.startsWith(prefixo));
  }).length;
  return dentro * 2 > centrosCustoItens.length;
}

/*
 * A regra de sugestão que vale: a mais específica que casa (empresa +
 * centro de custo > só empresa > só centro de custo > geral); empate, a
 * de menor ordem. Regra de centro de custo só casa quando a maioria dos
 * itens (mais de 50%) está nos centros de custo dela.
 */
export function escolherSugestao<R extends RegraSugestao>(regras: R[], contexto: ContextoSugestao): R | null {
  let melhor: R | null = null;
  let melhorPeso = -1;

  for (const regra of [...regras].sort((a, b) => a.ordem - b.ordem)) {
    if (regra.empresa !== null && regra.empresa !== contexto.empresa) continue;

    const prefixos = lerPrefixos(regra.centrosCusto);
    if (prefixos.length > 0 && !maioriaNosCentrosDeCusto(contexto.centrosCustoItens, prefixos)) continue;

    const peso = (regra.empresa !== null ? 2 : 0) + (prefixos.length > 0 ? 1 : 0);
    if (peso > melhorPeso) {
      melhor = regra;
      melhorPeso = peso;
    }
  }

  return melhor;
}
