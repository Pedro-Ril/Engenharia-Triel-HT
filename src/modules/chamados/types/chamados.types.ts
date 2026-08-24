export type StatusChamado =
  | "aberto"
  | "em_andamento"
  | "aguardando_confirmacao"
  | "resolvido"
  | "fechado";
export type PrioridadeChamado = "baixa" | "media" | "alta" | "urgente";
export type AutorTipoMensagem = "solicitante" | "atendente" | "sistema";

export interface SetorChamado {
  id: string;
  nome: string;
}

export interface CategoriaChamado {
  id: string;
  setorId: string;
  setorNome: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export interface ChamadoAnexo {
  id: string;
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  criadoEm: string;
}

export interface ChamadoMensagem {
  id: string;
  autorNome: string;
  autorTipo: AutorTipoMensagem;
  interno: boolean;
  texto: string;
  criadoEm: string;
  anexos: ChamadoAnexo[];
}

export interface ChamadoResumo {
  id: string;
  numero: number;
  setorId: string;
  setorNome: string;
  titulo: string;
  status: StatusChamado;
  prioridade: PrioridadeChamado;
  solicitanteNome: string;
  atendenteNome: string | null;
  empresa: string | null;
  solicitanteDepartamento: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  publico: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Chamado extends ChamadoResumo {
  solicitanteUsuarioId: string | null;
  solicitanteContato: string | null;
  atendenteUsuarioId: string | null;
  resolvidoEm: string | null;
  fechadoEm: string | null;
  mensagens: ChamadoMensagem[];
  ehAtendente: boolean;
}

export interface ChamadosAtendente {
  id: string;
  usuarioId: string;
  usuarioNome: string;
  setorId: string;
  setorNome: string;
}

export interface SetorAceiteChamados {
  id: string;
  nome: string;
  aceitaChamados: boolean;
}

export interface TotaisPorStatus {
  total: number;
  aberto: number;
  emAndamento: number;
  aguardandoConfirmacao: number;
  resolvido: number;
  fechado: number;
}

export interface ContagemPrioridade {
  prioridade: PrioridadeChamado;
  total: number;
}

export interface ContagemSetor {
  setorId: string;
  setorNome: string;
  total: number;
}

export interface ContagemDia {
  dia: string;
  total: number;
}

export interface ContagemAtendente {
  atendenteNome: string;
  total: number;
}

export interface ContagemEmpresa {
  empresa: string;
  total: number;
}

export interface ContagemDepartamento {
  departamento: string;
  total: number;
}

export interface ContagemCategoria {
  categoria: string;
  total: number;
}

export interface EstatisticasChamados {
  totais: TotaisPorStatus;
  tempoMedioResolucaoHoras: number | null;
  porPrioridade: ContagemPrioridade[];
  porSetor: ContagemSetor[];
  porDia: ContagemDia[];
  porAtendente: ContagemAtendente[];
  porEmpresa: ContagemEmpresa[];
  porDepartamento: ContagemDepartamento[];
  porCategoria: ContagemCategoria[];
}
