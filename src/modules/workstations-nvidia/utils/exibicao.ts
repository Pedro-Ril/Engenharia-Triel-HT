import type {
  StatusMaquinaNvidia,
  TipoEventoNvidia,
} from "../types/workstationsNvidia.types";

type VarianteBadge = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

export const STATUS_MAQUINA: Record<
  StatusMaquinaNvidia,
  { label: string; variante: VarianteBadge; descricao: string }
> = {
  conforme: {
    label: "Conforme",
    variante: "success",
    descricao: "O perfil oficial está aplicado.",
  },
  perfil_desatualizado: {
    label: "Perfil desatualizado",
    variante: "warning",
    descricao: "Está conforme com um perfil antigo — o GPO ainda não copiou o perfil oficial atual.",
  },
  estado_antigo: {
    label: "Script parado",
    variante: "warning",
    descricao: "O estado.json foi lido, mas o script não roda há mais tempo do que o limite configurado.",
  },
  divergente: {
    label: "Divergente",
    variante: "warning",
    descricao: "O script encontrou divergências e não reaplicou (modo somente verificação).",
  },
  adiado: {
    label: "Adiado",
    variante: "info",
    descricao: "O Profile Inspector estava aberto na máquina; o script tenta de novo na próxima execução.",
  },
  falha: {
    label: "Falha",
    variante: "danger",
    descricao: "O script tentou reaplicar o perfil e não conseguiu.",
  },
  erro: {
    label: "Erro no script",
    variante: "danger",
    descricao: "O script relatou um erro na última execução.",
  },
  sem_contato: {
    label: "Sem contato",
    variante: "danger",
    descricao: "O portal não conseguiu ler o estado.json na última coleta.",
  },
  nunca_coletada: {
    label: "Aguardando coleta",
    variante: "neutral",
    descricao: "O portal ainda não leu esta máquina.",
  },
};

export const TIPO_EVENTO: Record<TipoEventoNvidia, { label: string; variante: VarianteBadge }> = {
  driver_alterado: { label: "Driver alterado", variante: "info" },
  reaplicado: { label: "Reaplicado", variante: "success" },
  falha_reaplicacao: { label: "Falha ao reaplicar", variante: "danger" },
  erro_script: { label: "Erro no script", variante: "danger" },
  sem_contato: { label: "Sem contato", variante: "danger" },
  contato_restabelecido: { label: "Contato restabelecido", variante: "success" },
  perfil_publicado: { label: "Perfil publicado", variante: "primary" },
  maquina_adicionada: { label: "Máquina adicionada", variante: "neutral" },
  maquina_removida: { label: "Máquina removida", variante: "neutral" },
};

export function formatarDataHora(iso: string | null): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function formatarTempoRelativo(iso: string | null): string {
  if (!iso) return "nunca";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;

  const minutos = Math.floor((Date.now() - data.getTime()) / 60000);
  if (minutos < 1) return "agora há pouco";
  if (minutos < 60) return `há ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;

  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

/* Nomes amigáveis para os valores mais comuns do modo de energia (SettingID 274197361). */
const VALORES_MODO_ENERGIA: Record<string, string> = {
  "0": "Adaptativo",
  "1": "Preferir desempenho máximo",
  "5": "Normal",
};

export function descreverValorConfiguracao(configuracaoId: string, valor: string | null): string {
  if (valor === null) return "ausente";
  if (configuracaoId === "274197361" && VALORES_MODO_ENERGIA[valor]) {
    return `${valor} — ${VALORES_MODO_ENERGIA[valor]}`;
  }
  return valor;
}
