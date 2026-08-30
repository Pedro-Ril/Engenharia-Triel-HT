export interface TerminalTv {
  id: string;
  nome: string | null;
  status: "aguardando_pareamento" | "pareado";
  codigoPareamento: string | null;
  ultimoHeartbeatEm: string | null;
  intervaloAtualizacaoSegundos: number;
  gradeId: string | null;
  caminhoInicial: string | null;
  criadoEm: string;
  revogadoEm: string | null;
  agenteUltimaVerificacaoEm: string | null;
  /* null = terminal nunca reportou (rodando direto no navegador, sem agente nativo). */
  agenteAtualizado: boolean | null;
  agenteIp: string | null;
  agenteCpuPercentual: number | null;
  agenteMemoriaPercentual: number | null;
  agenteProximaVerificacaoEm: string | null;
  agenteSistemaOperacional: string | null;
}

export interface GradeTv {
  id: string;
  nome: string;
  ativa: boolean;
  criadoPor: string | null;
  criadoEm: string;
}

export type TipoConteudoTv = "video" | "foto" | "documento" | "pagina_web";

export interface ItemSlotTv {
  id: string;
  tipoConteudo: TipoConteudoTv;
  midiaId: string | null;
  urlPaginaWeb: string | null;
  duracaoSegundos: number;
  ordem: number;
}

export interface SlotTv {
  id: string;
  nome: string | null;
  diasSemana: string;
  horaInicio: string;
  horaFim: string;
  ordem: number;
  itens: ItemSlotTv[];
}

export interface GradeComSlots extends GradeTv {
  slots: SlotTv[];
}

export type TipoMidiaTv = "video" | "foto" | "documento";

export interface MidiaTv {
  id: string;
  nomeOriginal: string;
  tipoMime: string;
  tipo: TipoMidiaTv;
  tamanhoBytes: number;
  enviadoPor: string | null;
  criadoEm: string;
  emUso: number;
  pastaId: string | null;
  pastaNome: string | null;
}

export interface PastaMidia {
  id: string;
  nome: string;
  criadoEm: string;
  totalMidias: number;
}

export interface ConfigTv {
  diretorioMidias: string | null;
  signalingUrl: string | null;
  urlAgente: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}
