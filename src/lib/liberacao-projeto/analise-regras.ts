/*
 * Liberação de Projeto → conferência "código do item = código do desenho"
 * nos itens FABRICADOS da estrutura (ERP). Regras puras, sem servidor:
 * a tela usa ehClienteCiber para nem pedir a análise, e o servidor usa as
 * duas (e confere o Ciber de novo -- a tela não é garantia).
 */

/* Cliente Ciber ("CIBER EQUIPAMENTOS RODOVIÁRIOS LTDA"): a estrutura deles não segue a regra. */
export function ehClienteCiber(cliente: string | null | undefined): boolean {
  return /\bCIBER\b/i.test(String(cliente ?? ""));
}

/* Linha de GET /api/estrutura/{codigo} do ERP (só os campos usados aqui). */
export interface LinhaEstruturaErp {
  NIVEL: number;
  COD_ITEM_PAI: string | null;
  COD_DESENHO_PAI: string | null;
  TP_ITEM_PAI: string | null;
  DESC_TECNICA_PAI: string | null;
  COD_ITEM_FILHO: string | null;
  COD_DESENHO_FILHO: string | null;
  TP_ITEM_FILHO: string | null;
  DESC_TECNICA_FILHO: string | null;
  STATUS_VALIDADE: string | null;
}

export interface DivergenciaDesenho {
  codigoItem: string;
  codigoDesenho: string;
  descricao: string;
  /* Onde o item aparece (códigos dos pais, sem repetir); vazio para o item do projeto. */
  pais: string[];
}

function texto(valor: string | null | undefined): string {
  return String(valor ?? "").trim();
}

function fabricado(tipo: string | null | undefined): boolean {
  return texto(tipo).toUpperCase() === "FABRICADO";
}

function diverge(item: string, desenho: string): boolean {
  return item.toUpperCase() !== desenho.toUpperCase();
}

/*
 * Itens fabricados em que o código do desenho não é igual ao do item
 * (desenho em branco também conta). Só ligações vigentes; cada item
 * aparece uma vez, com os pais onde está. O item do projeto (a raiz)
 * entra pelos dados de pai das linhas de nível 1.
 */
export function encontrarDivergencias(linhas: LinhaEstruturaErp[]): DivergenciaDesenho[] {
  const porItem = new Map<string, DivergenciaDesenho>();

  function anotar(item: string, desenho: string, descricao: string, pai: string | null) {
    const atual = porItem.get(item);
    if (atual) {
      if (pai && !atual.pais.includes(pai)) atual.pais.push(pai);
      return;
    }
    porItem.set(item, { codigoItem: item, codigoDesenho: desenho, descricao, pais: pai ? [pai] : [] });
  }

  for (const linha of linhas) {
    if (texto(linha.STATUS_VALIDADE).toUpperCase() !== "VALIDO") continue;

    if (Number(linha.NIVEL) === 1 && fabricado(linha.TP_ITEM_PAI)) {
      const raiz = texto(linha.COD_ITEM_PAI);
      const desenhoRaiz = texto(linha.COD_DESENHO_PAI);
      if (raiz && diverge(raiz, desenhoRaiz)) anotar(raiz, desenhoRaiz, texto(linha.DESC_TECNICA_PAI), null);
    }

    const item = texto(linha.COD_ITEM_FILHO);
    const desenho = texto(linha.COD_DESENHO_FILHO);
    if (item && fabricado(linha.TP_ITEM_FILHO) && diverge(item, desenho)) {
      anotar(item, desenho, texto(linha.DESC_TECNICA_FILHO), texto(linha.COD_ITEM_PAI) || null);
    }
  }

  return [...porItem.values()].sort((a, b) => a.codigoItem.localeCompare(b.codigoItem, "pt-BR", { numeric: true }));
}
