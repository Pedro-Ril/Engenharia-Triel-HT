export type NivelLog = "info" | "aviso" | "erro";

export interface LogSistema {
  id: string;
  nivel: NivelLog;
  origem: string;
  mensagem: string;
  detalhes: string | null;
  metodo: string | null;
  caminho: string | null;
  ipOrigem: string | null;
  criadoEm: string;
}

export interface AcessoModulo {
  id: string;
  usuarioId: string;
  nomeExibicao: string;
  samAccountName: string;
  moduloChave: string;
  moduloNome: string;
  acessadoEm: string;
}

export interface TabelaBanco {
  nome: string;
  linhas: number;
  tamanhoMB: number;
}

export interface EstatisticasPool {
  conectado: boolean;
  saudavel: boolean;
  tamanho: number;
  disponiveis: number;
  emUso: number;
  pendentes: number;
}

export interface EstatisticasBanco {
  servidor: string;
  banco: string;
  versaoSqlServer: string;
  tamanhoBancoMB: number;
  conexoesAtivas: number;
  horasAtivoServidor: number;
  pool: EstatisticasPool;
  tabelas: TabelaBanco[];
}

export interface EstatisticasSistema {
  uptimeSegundos: number;
  memoriaUsadaMB: number;
  memoriaTotalMB: number;
  nodeVersion: string;
  ambiente: string;
  pid: number;
}

export type TipoEventoAtividade =
  | "login_sucesso"
  | "login_falha"
  | "chamado_bloqueio_nome"
  | "terminal_busca_falha";

export interface EventoAtividade {
  tipo: TipoEventoAtividade;
  titulo: string;
  descricao: string | null;
  criadoEm: string;
}

export interface ResultadoAtividade {
  itens: EventoAtividade[];
  total: number;
}

export interface ResumoMonitoramento {
  banco: EstatisticasBanco;
  sistema: EstatisticasSistema;
  logsPorNivel: Record<NivelLog, number>;
}

export type ServicoExterno = "active_directory" | "erp_materia_prima" | "email" | "erp_estrutura";

export interface StatusServicoExterno {
  servico: ServicoExterno;
  status: "online" | "offline" | "sem_dados";
  latenciaMediaMs: number | null;
  totalChamadas24h: number;
  taxaSucesso24h: number | null;
  ultimaChamadaEm: string | null;
  ultimaFalhaEm: string | null;
  ultimaFalhaMensagem: string | null;
}

export interface ResumoRotaRequisicoes {
  rota: string;
  totalChamadas: number;
  taxaErro: number;
  latenciaMediaMs: number;
}

export interface ResumoRequisicoes {
  totalChamadas24h: number;
  taxaErro24h: number;
  latenciaMedia24hMs: number;
  porRota: ResumoRotaRequisicoes[];
}

export interface ResumoApis {
  chamadasExternas: StatusServicoExterno[];
  requisicoes: ResumoRequisicoes;
}
