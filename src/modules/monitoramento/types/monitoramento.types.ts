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
