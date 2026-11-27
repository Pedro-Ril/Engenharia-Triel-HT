import type {
  Ambiente3dx,
  FiltroStatusExecucao3dx,
  GatilhoExecucao3dx,
  ModoPlugin3dx,
  NivelEvento3dx,
  SituacaoArquivoVisualizacao3dx,
  StatusExecucao3dx,
  StatusVerificacao3dx,
} from "../types/plugins3dx.types";

type VarianteBadge = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

export const MODO: Record<ModoPlugin3dx, { label: string; variante: VarianteBadge; descricao: string }> = {
  DESLIGADO: {
    label: "Desligado",
    variante: "neutral",
    descricao: "Não faz nada e não registra nada.",
  },
  SIMULACAO: {
    label: "Simulação",
    variante: "info",
    descricao: "Não altera nada no 3DEXPERIENCE: só registra aqui o que faria.",
  },
  ATIVO: {
    label: "Ativo",
    variante: "success",
    descricao: "Faz as alterações no 3DEXPERIENCE e registra tudo aqui.",
  },
};

/* Dev (dev-plm) e produção dividem banco e fila: o ambiente aparece em tudo. */
export const AMBIENTE: Record<Ambiente3dx, { label: string; variante: VarianteBadge }> = {
  PRODUCAO: { label: "Produção", variante: "primary" },
  TESTE: { label: "Teste", variante: "info" },
};

/* Verificação do ambiente 3DX: status geral de cada item (versão do 3DSpace, padrão de visualização). */
export const STATUS_VERIFICACAO: Record<StatusVerificacao3dx, { label: string; variante: VarianteBadge }> = {
  ok: { label: "OK", variante: "success" },
  alerta: { label: "Atenção", variante: "warning" },
  erro: { label: "Erro", variante: "danger" },
};

/* Padrão de visualização ("Abrir com"): valor geral do nó e situação de cada arquivo. */
export const SITUACAO_VISUALIZACAO: Record<SituacaoArquivoVisualizacao3dx, { label: string; variante: VarianteBadge }> = {
  aplicado: { label: "Aplicado", variante: "success" },
  perdido: { label: "Perdido: reaplicar", variante: "warning" },
  mudou: { label: "Mudou: analisar no dev", variante: "danger" },
  ausente: { label: "Arquivo ausente", variante: "danger" },
};

/* Nome curto de cada plugin, para tabela, fila e detalhe (o nome completo vem do banco). */
export const NOME_CURTO_PLUGIN: Record<string, string> = {
  "duplicate-title": "Título na duplicação",
  "replace-revision": "Revisão nos conjuntos",
  "drawing-config-link": "Desenho por configuração",
  "maturity-state": "Estado pelo banco",
  "ief-checkin": "Salvamento do conector",
};

export function nomeCurtoPlugin(chave: string): string {
  return NOME_CURTO_PLUGIN[chave] ?? chave;
}

export const STATUS_EXECUCAO: Record<StatusExecucao3dx, { label: string; variante: VarianteBadge }> = {
  pendente: { label: "Na fila", variante: "neutral" },
  processando: { label: "Processando", variante: "info" },
  concluida: { label: "Concluída", variante: "success" },
  parcial: { label: "Parcial", variante: "warning" },
  falha: { label: "Falha", variante: "danger" },
  ignorada: { label: "Ignorada", variante: "neutral" },
  cancelada: { label: "Cancelada", variante: "neutral" },
};

/* Liberação que não se concretizou no 3DX: é uma "ignorada" com motivo próprio, mostrada à parte. */
export const STATUS_BARRADA: { label: string; variante: VarianteBadge; descricao: string } = {
  label: "Barrada",
  variante: "warning",
  descricao: "A liberação não se concretizou no 3DEXPERIENCE (barrada por regra, como filho não liberado, ou cancelada).",
};

/* Rótulo e cor da execução: o status do banco, ou "Barrada" quando é uma liberação que não se concretizou. */
export function situacaoExecucao(execucao: { status: StatusExecucao3dx; barrada?: boolean }): {
  label: string;
  variante: VarianteBadge;
} {
  return execucao.barrada ? STATUS_BARRADA : STATUS_EXECUCAO[execucao.status];
}

/* Opções do filtro de status: os do banco, com "Barrada" logo depois de "Ignorada". */
export const OPCOES_FILTRO_STATUS: { value: FiltroStatusExecucao3dx; label: string }[] = (
  Object.entries(STATUS_EXECUCAO) as [StatusExecucao3dx, { label: string }][]
).flatMap(([valor, info]): { value: FiltroStatusExecucao3dx; label: string }[] =>
  valor === "ignorada"
    ? [
        { value: valor, label: info.label },
        { value: "barrada" as const, label: STATUS_BARRADA.label },
      ]
    : [{ value: valor, label: info.label }]
);

export function rotuloFiltroStatus(status: FiltroStatusExecucao3dx): string {
  return status === "barrada" ? STATUS_BARRADA.label : STATUS_EXECUCAO[status].label;
}

/*
 * Trabalho na fila que espera a hora de rodar (ex.: conferir de novo se a liberação foi gravada):
 * "próxima conferência às 18:20:35". null quando roda assim que um nó estiver livre.
 */
export function proximaTentativa(execucao: { status: StatusExecucao3dx; executarApos: string | null }): string | null {
  if (execucao.status !== "pendente" || !execucao.executarApos) return null;
  const data = new Date(execucao.executarApos);
  if (Number.isNaN(data.getTime()) || data.getTime() <= Date.now()) return null;
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const GATILHO: Record<GatilhoExecucao3dx, string> = {
  liberacao: "Liberação",
  duplicacao: "Duplicação",
  noturna: "Rotina noturna",
  manual: "Manual (Portal)",
  consulta: "Consulta (integrador)",
  salvamento: "Salvamento (conector)",
};

export const NIVEL_EVENTO: Record<NivelEvento3dx, { label: string; variante: VarianteBadge }> = {
  info: { label: "Info", variante: "info" },
  aviso: { label: "Aviso", variante: "warning" },
  erro: { label: "Erro", variante: "danger" },
};

/* Ações registradas pelos plugins em cada item (as "seria_*" são da simulação). */
export const ACAO_ITEM: Record<string, string> = {
  titulo_alterado: "Título alterado",
  seria_titulo_alterado: "Título seria alterado",
  instancia_substituida: "Revisão trocada no conjunto",
  seria_instancia_substituida: "Revisão seria trocada",
  revisao_obsoleta: "Revisão obsoletada",
  seria_revisao_obsoleta: "Revisão seria obsoletada",
  pai_nao_liberado: "Conjunto não liberado (mantido)",
  vinculo_criado: "Vínculo criado",
  seria_vinculo_criado: "Vínculo seria criado",
  estado_corrigido: "Estado entregue do banco",
  seria_estado_corrigido: "Estado seria entregue do banco",
};

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  /* O banco devolve hora local sem fuso (CONVERT 126): o navegador interpreta como hora local, que é o esperado. */
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/* Sem segundos: para textos curtos (quem alterou e quando). */
export function formatarDataHoraCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/* Data de lançamento de uma versão vem como AAAA-MM-DD (sem hora): formata sem passar por Date (evita fuso). */
export function formatarDataLancamento(data: string | null): string {
  if (!data) return "";
  const [ano, mes, dia] = data.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}

/* Versões antigas dos plugins eram só "5", "4": mostra sempre com "v". */
export function rotuloVersao(versao: string): string {
  return `v${versao}`;
}

export function formatarDuracao(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1).replace(".", ",")} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s % 60)} s`;
}

export function rotuloObjeto(nome: string | null, revisao: string | null, titulo: string | null): string {
  const base = [nome, revisao].filter(Boolean).join(" ");
  return titulo && titulo !== nome ? `${base} — ${titulo}` : base || "—";
}

/* Nó do 3DSpace vem como "host:/App/Tomee/Tomee3DSpaceNode1" — mostra só o essencial. */
export function rotuloNo(no: string | null): string {
  if (!no) return "—";
  const [host, base] = no.split(":", 2);
  const pasta = base?.split("/").filter(Boolean).pop();
  return pasta ? `${host} · ${pasta}` : no;
}
