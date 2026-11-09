import type { PerfilTempo } from "@/lib/tempos-maquina/tipos";

/* Espelho do que src/lib/tempos-maquina/cadastro.ts devolve (eng_tempos_*). */

export type MetodoTempo = PerfilTempo["metodo"];

export type PerfilTempoCadastro = {
  id: string;
  nome: string;
  metodo: MetodoTempo;
  ativo: boolean;
  observacao: string | null;
  parametros: PerfilTempo;
  /* Máquinas do ERP ligadas a este perfil. */
  maquinas: { codRecurso: string; descRecurso: string | null }[];
  atualizadoEm: string;
  atualizadoPor: string | null;
};

export type MaquinaTempo = {
  codRecurso: string;
  descRecurso: string | null;
  perfilId: string;
  perfilNome: string;
  perfilAtivo: boolean;
  atualizadoEm: string;
  atualizadoPor: string | null;
};

export type MaterialTempo = {
  id: string;
  nome: string;
  termos: string;
  densidade: number;
  variante: string | null;
  ordem: number;
  ativo: boolean;
};

export const ROTULO_METODO: Record<MetodoTempo, string> = {
  corte_cnc: "Corte CNC (laser/plasma)",
  tabela_dimensao: "Tabela por dimensão (guilhotina/dobra)",
};
