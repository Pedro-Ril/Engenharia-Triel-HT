/*
 * Plugins 3DX: o que roda dentro do 3DSpace (jars triel-3dx-core + 1 por plugin) e registra no banco do Portal.
 * Espelha as tabelas da migração 0172_plugins_3dx.sql.
 */

export type ModoPlugin3dx = "DESLIGADO" | "SIMULACAO" | "ATIVO";

/* Dev (dev-plm) e produção gravam no mesmo banco: tudo é separado por ambiente (migração 0173). */
export type Ambiente3dx = "PRODUCAO" | "TESTE";

export const AMBIENTES_3DX: Ambiente3dx[] = ["PRODUCAO", "TESTE"];

export type StatusExecucao3dx =
  | "pendente"
  | "processando"
  | "concluida"
  | "parcial"
  | "falha"
  | "ignorada"
  | "cancelada";

export type GatilhoExecucao3dx = "liberacao" | "duplicacao" | "noturna" | "manual";

export type NivelEvento3dx = "info" | "aviso" | "erro";

export interface NoPlugin3dx {
  no: string;
  /* null = o nó não informou ambiente= no triel-plugins.properties (fica com todos os plugins desligados) */
  ambiente: Ambiente3dx | null;
  versao: string | null;
  jarMd5: string | null;
  coreVersao: string | null;
  modoEmUso: ModoPlugin3dx | null;
  iniciadoEm: string | null;
  ultimoContato: string;
  filaPendente: number | null;
  ultimoErro: string | null;
  ultimoErroEm: string | null;
  /* calculado: sem contato há mais de 3 minutos */
  atrasado: boolean;
  /*
   * Autoteste do núcleo (1.3.0+): as partes internas da Dassault que o plugin usa existem neste 3DSpace?
   * null = núcleo antigo, sem autoteste. "falha" depois de um hotfix = o plugin vai falhar até ser ajustado.
   */
  autoteste: "ok" | "falha" | null;
  /* o que faltou (classe ou classe#método), quando falhou */
  autotesteDetalhe: string | null;
}

export interface EstatisticasPlugin3dx {
  execucoes24h: number;
  itens24h: number;
  falhas24h: number;
  execucoes7d: number;
  itens7d: number;
  falhas7d: number;
  pendentes: number;
  ultimaExecucaoEm: string | null;
}

/* Modo e parâmetros de um plugin num ambiente. */
export interface ConfigAmbiente3dx {
  modo: ModoPlugin3dx;
  parametros: Record<string, unknown>;
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
}

export interface Plugin3dx {
  chave: string;
  nome: string;
  descricao: string | null;
  /* sempre com os dois ambientes, independente do filtro */
  ambientes: Record<Ambiente3dx, ConfigAmbiente3dx>;
  /* estatisticas, nos: já filtrados pelo ambiente pedido (sem filtro = ambos) */
  estatisticas: EstatisticasPlugin3dx;
  nos: NoPlugin3dx[];
}

export interface EventoPlugin3dx {
  id: string;
  pluginChave: string | null;
  ambiente: Ambiente3dx | null;
  no: string | null;
  nivel: NivelEvento3dx;
  mensagem: string;
  detalhe: string | null;
  execucaoId: string | null;
  criadoEm: string;
}

export interface VisaoGeralPlugins3dx {
  plugins: Plugin3dx[];
  eventosRecentes: EventoPlugin3dx[];
}

export interface Execucao3dx {
  id: string;
  pluginChave: string;
  ambiente: Ambiente3dx;
  gatilho: GatilhoExecucao3dx;
  modo: ModoPlugin3dx;
  status: StatusExecucao3dx;
  correlacaoId: string | null;
  objetoNome: string | null;
  objetoRevisao: string | null;
  objetoTitulo: string | null;
  objetoTipo: string | null;
  atorLogin: string | null;
  atorNome: string | null;
  solicitadoPorNome: string | null;
  no: string | null;
  tentativas: number;
  enfileiradoEm: string;
  iniciadoEm: string | null;
  finalizadoEm: string | null;
  duracaoMs: number | null;
  totalItens: number | null;
  totalOk: number | null;
  totalFalhas: number | null;
  resumo: string | null;
  erro: string | null;
}

export interface ItemExecucao3dx {
  id: string;
  ordem: number;
  acao: string;
  sucesso: boolean;
  alvoNome: string | null;
  alvoRevisao: string | null;
  alvoTitulo: string | null;
  alvoTipo: string | null;
  alvoEstado: string | null;
  alvoOwner: string | null;
  valorAntes: string | null;
  valorDepois: string | null;
  mensagem: string | null;
}

export interface DetalheExecucao3dx {
  execucao: Execucao3dx;
  itens: ItemExecucao3dx[];
  eventos: EventoPlugin3dx[];
  relacionadas: Execucao3dx[];
}

export interface PaginaExecucoes3dx {
  execucoes: Execucao3dx[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

export interface FiltrosExecucoes3dx {
  ambiente?: Ambiente3dx | null;
  plugin?: string | null;
  status?: StatusExecucao3dx | null;
  gatilho?: GatilhoExecucao3dx | null;
  busca?: string | null;
  de?: string | null;
  ate?: string | null;
  pagina: number;
}

/* O ambiente diz qual 3DSpace processa (só os nós daquele ambiente pegam o trabalho). */
export type AcaoManual3dx = { ambiente: Ambiente3dx } & (
  | { plugin: "replace-revision"; acao: "reprocessar"; nome: string }
  | { plugin: "drawing-config-link"; acao: "reprocessar"; nome: string }
  | { plugin: "drawing-config-link"; acao: "varredura"; limite: number }
);

export interface Destinatario3dx {
  id: string;
  /* null = aviso geral do ambiente 3DX (evento ambiente_3dx), não de um plugin */
  pluginChave: string | null;
  evento: string;
  /* null = recebe dos dois ambientes */
  ambiente: Ambiente3dx | null;
  usuarioId: string | null;
  usuarioNome: string | null;
  email: string | null;
  nome: string | null;
  emailEfetivo: string | null;
  ativo: boolean;
  criadoEm: string;
}

export interface NovoDestinatario3dx {
  /* null para eventos gerais (EVENTOS_AVISO_3DX[evento].geral) */
  pluginChave: string | null;
  evento: string;
  ambiente?: Ambiente3dx | null;
  usuarioId?: string | null;
  email?: string | null;
  nome?: string | null;
}

/* Eventos que geram aviso por e-mail (a lista de destinatários é por plugin + evento). */
export const EVENTOS_AVISO_3DX: Record<
  string,
  { plugins: string[]; label: string; descricao: string; /* aviso do ambiente, sem plugin */ geral?: boolean }
> = {
  revisao_trocada: {
    plugins: ["replace-revision"],
    label: "Revisão trocada em conjuntos liberados",
    descricao: "Resumo: peça liberada, conjuntos atualizados e revisões que viraram obsoletas.",
  },
  falha: {
    plugins: ["duplicate-title", "replace-revision", "drawing-config-link"],
    label: "Falha do plugin",
    descricao: "Execução terminou em falha ou parcial (algum objeto não foi tratado).",
  },
  ambiente_3dx: {
    plugins: [],
    geral: true,
    label: "Ambiente 3DX (atualização e verificação)",
    descricao:
      "3DEXPERIENCE atualizado (hotfix), padrão de visualização perdido, nó do 3DSpace sem resposta, plugin sem " +
      "contato ou incompatível com a versão da Dassault -- e quando volta ao normal.",
  },
  relatorio_diario: {
    plugins: [],
    geral: true,
    label: "Relatório diário de uso",
    descricao:
      "Todo dia às 7h, o uso do dia anterior: resumo gerencial no e-mail e o detalhado em PDF e Excel anexos. " +
      "Destinatário com ambiente recebe só aquele ambiente; sem ambiente, os dois juntos.",
  },
};

/* Relatório diário (migração 0176): AMBOS = destinatário sem ambiente (produção e teste no mesmo relatório). */
export type EscopoRelatorio3dx = "AMBOS" | Ambiente3dx;

export interface EnvioRelatorio3dx {
  id: string;
  /* AAAA-MM-DD: o dia que o relatório cobre (o envio é no dia seguinte) */
  dataReferencia: string;
  escopo: EscopoRelatorio3dx;
  situacao: "pendente" | "enviado" | "falha";
  tentativas: number;
  destinatarios: string[];
  totalExecucoes: number | null;
  erro: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface EnviosRelatorio3dx {
  /* hora local em que o agendador manda o relatório do dia anterior */
  horaEnvio: number;
  envios: EnvioRelatorio3dx[];
}

/*
 * Nota de uma versão (migração 0174). Gravada pelo próprio jar na subida do nó: componente "core" (núcleo) ou a
 * chave do plugin. A lista vem da versão mais nova para a mais antiga em cada componente.
 */
export interface Versao3dx {
  componente: string;
  versao: string;
  lancadaEm: string | null;
  notas: string;
  registradoNo: string | null;
  registradoAmbiente: Ambiente3dx | null;
  registradoEm: string;
}

/*
 * Verificação do ambiente 3DX (migração 0175): o Portal confere cada nó do 3DSpace pela rede, sem login.
 *  - versao3dx: build do 3DSpace (muda quando a Dassault é atualizada);
 *  - visualizacao: padrão de visualização do "Abrir com" (4 arquivos estáticos).
 * status: ok | alerta (ex.: padrão perdido -- reaplicar o script) | erro (nó sem resposta, ou a Dassault mudou o
 * arquivo e precisa de análise no dev-plm).
 */
export type StatusVerificacao3dx = "ok" | "alerta" | "erro";
export type SituacaoArquivoVisualizacao3dx = "aplicado" | "perdido" | "mudou" | "ausente";

export interface ArquivoVisualizacao3dx {
  /* a partir de <contexto>/webapps/ */
  caminho: string;
  descricao: string;
  situacao: SituacaoArquivoVisualizacao3dx;
  mensagem: string | null;
}

export interface VerificacaoItem3dx {
  status: StatusVerificacao3dx;
  /* versao3dx: o build (ex.: 6.428.4.26105); visualizacao: aplicado | perdido | mudou */
  valor: string | null;
  mensagem: string | null;
  verificadoEm: string;
  /* desde quando está neste status/valor (ex.: quando a versão mudou) */
  mudouEm: string;
}

export interface Servidor3dx {
  id: string;
  nome: string;
  ambiente: Ambiente3dx;
  urlBase: string;
  ativo: boolean;
  /* null = ainda não verificado */
  versao3dx: VerificacaoItem3dx | null;
  visualizacao: (VerificacaoItem3dx & { arquivos: ArquivoVisualizacao3dx[] }) | null;
}

export interface VerificacaoAmbiente3dx {
  servidores: Servidor3dx[];
  intervaloMinutos: number;
  ultimaVerificacaoEm: string | null;
}
