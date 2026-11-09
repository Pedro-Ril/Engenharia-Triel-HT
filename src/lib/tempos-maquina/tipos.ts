/*
 * Tipos do cálculo automático de tempo do Roteiro de Fabricação (análise
 * em docs/roteiro/calculo-automatico-tempos.md). Tudo em milímetros e
 * minutos. Puro: sem banco, usado no servidor e no navegador.
 */

/* ---------------- Parâmetros por máquina (perfil) ---------------- */

/*
 * Laser e plasma seguem a mesma fórmula (planilha TEMPOS PLASMA CNC);
 * o que muda são os parâmetros. Uma linha da tabela de corte vale para
 * uma espessura numa variante -- no laser a variante é o material
 * (padrão/especial), no plasma a amperagem (80 A / 260 A).
 */
export type LinhaCorteCnc = {
  espessuraMm: number;
  variante: string;
  velocidadeMmMin: number;
  pierceMin: number;
  /* Espera antes do corte, a cada entrada (laser). Plasma: 0. */
  esperaMin: number;
  /* Entradas entre uma limpeza de bico e outra (laser); null = não limpa. */
  piercesPorLimpeza: number | null;
  /* Furo/oblongo com diâmetro (ou largura) até este valor não corta nesta linha. */
  diametroMinimoFuroMm: number | null;
};

export type PerfilCorteCnc = {
  metodo: "corte_cnc";
  /* Chapa padrão da programação: a peça leva a fração da chapa nos tempos por chapa. */
  chapaPadrao: { larguraMm: number; comprimentoMm: number };
  velocidadeVazioMmMin: number;
  /* Entrada + saída do corte, por entrada (laser 5 mm, plasma 4,5 mm). */
  entradaSaidaMm: number;
  /* Aproximação da tocha, por entrada (plasma 0,086 min); laser 0. */
  aproximacaoPorEntradaMin: number;
  /* Tempos cronometrados por chapa, rateados pela fração da peça (trocar mesa, referenciar...). */
  temposPorChapa: { chave: string; rotulo: string; minutos: number }[];
  /* Limpeza do bico, a cada `piercesPorLimpeza` entradas (laser); null = não tem. */
  limpezaBicoMin: number | null;
  /* Ordem = preferência na escolha automática (ex.: 80 A antes de 260 A). */
  variantes: { chave: string; rotulo: string }[];
  linhas: LinhaCorteCnc[];
};

/*
 * Guilhotina e dobra (planilha TEMPOS CORTE E DOBRA): o tempo base sai
 * de uma tabela largura x comprimento por faixa de espessura.
 */
export type FaixaTabelaDimensao = {
  rotulo: string;
  /* A faixa vale até esta espessura (a primeira que couber). */
  espessuraAteMm: number;
  /* Degraus da tabela, em ordem crescente. Largura = o menor lado da peça. */
  larguras: number[];
  comprimentos: number[];
  /* tempos[índice da largura][índice do comprimento], em minutos. */
  tempos: number[][];
};

export type RegraDobra =
  /* Fator por tipo de perfil (planilha: uma dobra 1,1 ... assoalho aves 3,0). */
  | { regra: "fator"; fatores: { chave: string; rotulo: string; fator: number }[] }
  /* Acréscimo por dobra (app do PCP: 1 + 0,1 x nº de dobras). */
  | { regra: "por_dobra"; acrescimoPorDobra: number };

export type PerfilTabelaDimensao = {
  metodo: "tabela_dimensao";
  faixas: FaixaTabelaDimensao[];
  /* null = corte (guilhotina): o tempo é o da tabela. Com regra = dobradeira. */
  dobra: RegraDobra | null;
};

export type PerfilTempo = PerfilCorteCnc | PerfilTabelaDimensao;

/* ---------------- Dados da peça ---------------- */

export type ContornoInterno =
  | { tipo: "furo"; diametroMm: number }
  /* Oblongo: largura = diâmetro das pontas; comprimento = de ponta a ponta. */
  | { tipo: "oblongo"; larguraMm: number; comprimentoMm: number; retangular?: boolean }
  /* Qualquer outro recorte interno; menorDimensaoMm para a regra do furo mínimo. */
  | { tipo: "recorte"; perimetroMm: number; menorDimensaoMm?: number | null };

export type GeometriaPeca = {
  /* Contorno externo (mm). Obrigatório no corte CNC. */
  perimetroExternoMm: number | null;
  /* Retângulo da peça: largura = menor lado, comprimento = maior (a digitação manual guarda como veio). */
  larguraMm: number | null;
  comprimentoMm: number | null;
  /* Área da peça (mm²): fração da chapa nos tempos por chapa. */
  areaMm2: number | null;
  contornosInternos: ContornoInterno[];
  /* Entradas além dos contornos internos (planilha: "nº de entradas" com o perímetro). */
  entradasAdicionais: number;
};

export type DadosPeca = {
  espessuraMm: number;
  geometria: GeometriaPeca;
  /* Variante da tabela de corte; vazio = a primeira que cortar, na ordem do perfil. */
  variante?: string | null;
  /* Só dobradeira: o tipo de perfil (regra "fator") ou o nº de dobras ("por_dobra"). */
  dobra?: { fator?: string | null; quantidade?: number | null } | null;
};

/* ---------------- Resultado ---------------- */

export type ParcelaTempo = { chave: string; rotulo: string; minutos: number };

export type ResultadoTempo = {
  ok: boolean;
  /* Minutos por peça (null se não deu para calcular). */
  tempoMin: number | null;
  parcelas: ParcelaTempo[];
  /* O que o cálculo usou, para mostrar na tela (perímetro, velocidade, espessura da tabela...). */
  referencia: { rotulo: string; valor: string }[];
  avisos: string[];
  erros: string[];
};
