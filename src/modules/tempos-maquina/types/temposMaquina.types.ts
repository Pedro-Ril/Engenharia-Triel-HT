import type { PerfilCadastrado } from "@/lib/tempos-maquina/tipos";

/* Espelho do que src/lib/tempos-maquina/cadastro.ts devolve (eng_tempos_*). */

export type MetodoTempo = PerfilCadastrado["metodo"];

export type PerfilTempoCadastro = {
  id: string;
  nome: string;
  metodo: MetodoTempo;
  ativo: boolean;
  observacao: string | null;
  parametros: PerfilCadastrado;
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
  escolha_espessura: "Escolha da tabela pela espessura",
};

/* O que o Roteiro de Fabricação recebe (GET /api/cadastro-roteiro/tempos): só o que está ativo. */
export type ConfigTemposRoteiro = {
  /* Os ativos e os que uma escolha por espessura ativa usa (ativo = false). */
  perfis: { id: string; nome: string; ativo: boolean; parametros: PerfilCadastrado }[];
  /* COD_RECURSO (maiúsculo) -> perfil ativo. */
  maquinas: { codRecurso: string; perfilId: string }[];
  materiais: Omit<MaterialTempo, "id">[];
};
