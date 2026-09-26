/* Espelha src/lib/consulta-ultima-revisao/estrutura-3dx.ts. */

export interface NoEstrutura3DX {
  physicalId: string;
  codigo: string;
  descricao: string;
  revisao: string;
  tipoint: string;
  status: string;
  responsavel: string;
  nivel: number;
  /* null = o 3DX não informou; não dá pra afirmar que está desatualizado. */
  ultimaRevisao: boolean | null;
  instanciaNome: string | null;
  filhos: NoEstrutura3DX[];
}

export interface EstruturaUltimaRevisao {
  codigo: string;
  descricao: string;
  revisao: string;
  totalItens: number;
  totalInstancias: number;
  raiz: NoEstrutura3DX;
}
