/*
 * Tipos do módulo Workstations NVIDIA — compartilhados entre o servidor
 * (src/lib/workstations-nvidia) e o painel de administração.
 */

/*
 * Situação calculada de cada máquina, em ordem de prioridade (a primeira
 * que se aplica vence) — ver calcularStatusMaquina em
 * src/lib/workstations-nvidia/status.ts.
 */
export type StatusMaquinaNvidia =
  | "nunca_coletada"
  | "sem_contato"
  | "erro"
  | "adiado"
  | "falha"
  | "divergente"
  | "estado_antigo"
  | "perfil_desatualizado"
  | "conforme";

export interface DivergenciaPerfil {
  perfil: string;
  configuracaoId: string;
  configuracao: string;
  esperado: string;
  encontrado: string | null;
}

export interface DivergenciasMaquina {
  encontradas: DivergenciaPerfil[];
  aposReaplicar: DivergenciaPerfil[];
}

export interface MaquinaNvidia {
  id: string;
  computador: string;
  descricao: string | null;
  ativo: boolean;
  status: StatusMaquinaNvidia;

  coletaEm: string | null;
  coletaOk: boolean | null;
  coletaErro: string | null;
  contatoEm: string | null;

  verificadoEm: string | null;
  executadoComo: string | null;
  gpu: string | null;
  driverWindows: string | null;
  driverNvidia: string | null;
  dataDriver: string | null;
  conforme: boolean | null;
  acao: string | null;
  erroScript: string | null;
  perfilHash: string | null;
  divergencias: DivergenciasMaquina | null;
  ultimaReaplicacaoEm: string | null;
  ultimaReaplicacaoSucesso: boolean | null;

  criadoEm: string;
}

export type TipoEventoNvidia =
  | "driver_alterado"
  | "reaplicado"
  | "falha_reaplicacao"
  | "erro_script"
  | "sem_contato"
  | "contato_restabelecido"
  | "perfil_publicado"
  | "maquina_adicionada"
  | "maquina_removida";

export interface EventoNvidia {
  id: string;
  maquinaId: string | null;
  computador: string | null;
  tipo: TipoEventoNvidia;
  descricao: string;
  ocorridoEm: string;
}

export interface PaginaEventosNvidia {
  eventos: EventoNvidia[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

export interface ConfiguracaoNvidia {
  caminhoEstado: string;
  pastaPerfil: string | null;
  coletaAtiva: boolean;
  intervaloMinutos: number;
  horasSemContato: number;
  emailsAlerta: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export interface ConfiguracaoPerfilNip {
  perfil: string;
  executaveis: string[];
  configuracaoId: string;
  configuracao: string;
  valor: string;
  tipo: string;
}

/* Perfil oficial lido da pasta central (pastaPerfil\perfil-padrao.nip). */
export interface PerfilOficialNvidia {
  configurado: boolean;
  caminho: string | null;
  hash: string | null;
  modificadoEm: string | null;
  configuracoes: ConfiguracaoPerfilNip[];
  erro: string | null;
}

export interface ResumoMaquinasNvidia {
  maquinas: MaquinaNvidia[];
  perfil: PerfilOficialNvidia;
  coletaEmAndamento: boolean;
  ultimaColetaGeralEm: string | null;
}

export interface ResultadoColetaNvidia {
  maquinasColetadas: number;
  comSucesso: number;
  semContato: number;
  eventosGerados: number;
}
