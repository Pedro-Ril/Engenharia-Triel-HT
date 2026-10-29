/*
 * Regras da separação da engenharia Versátil -- puras, sem disco nem
 * banco (testadas em separacao-regras.test.ts). Quem lê a planilha, o
 * disco e grava o registro é separacao.ts.
 *
 * A planilha do projeto ("1111 - CAÇAMBA ... .xls") tem uma aba por
 * "pasta" (CHAPARIA, USINAGEM, ...). Dentro de cada aba, um ou mais
 * blocos: uma linha de título ("LISTA USINAGEM COMUM 969 - ..."), o
 * cabeçalho (com "Nº DA PEÇA") e os itens. Aba com mais de um bloco vira
 * uma subpasta por bloco (USINAGEM\USINAGEM COMUM, USINAGEM\USINAGEM
 * NYLON), como a engenharia já fazia à mão.
 */

export type TipoArquivo = "pdf" | "dxf";

export interface ListaDaAba {
  /* Título do bloco, como está na planilha (null se não tinha). */
  titulo: string | null;
  /* Nome da subpasta tirado do título ("USINAGEM COMUM"). */
  nome: string | null;
  codigos: string[];
  /* Peso unitário (coluna "Peso", kg) de cada código; null se vazio/ilegível ou sem a coluna. */
  pesos: Record<string, number | null>;
}

export interface AbaLida {
  aba: string;
  listas: ListaDaAba[];
}

export type SituacaoItem = "copiar" | "ja_existe" | "nao_encontrado";

export interface ItemPlano {
  aba: string;
  /* Relativa à pasta do projeto, separador "\" (ex.: USINAGEM\USINAGEM COMUM). */
  pastaDestino: string;
  codigo: string;
  tipo: TipoArquivo;
  /* Nome do arquivo na origem (null quando não foi achado). */
  arquivo: string | null;
  situacao: SituacaoItem;
}

export interface PastaPlano {
  caminho: string;
  existe: boolean;
  /* Vai ser criada (não existe e tem pelo menos um arquivo para receber). */
  criar: boolean;
}

/* nome_invalido: o nome da aba some depois de limpo para o Windows (ex.: "..."); sem ele, os arquivos iriam para a raiz do projeto. */
export type MotivoAbaIgnorada = "blacklist" | "sem_cabecalho" | "sem_arquivos" | "nome_invalido";

export interface Plano {
  itens: ItemPlano[];
  pastas: PastaPlano[];
  /* `itens`: quantos códigos a aba tinha (0 na blacklist, que nem é lida a fundo). */
  abasIgnoradas: { aba: string; motivo: MotivoAbaIgnorada; itens: number }[];
}

/* Comparação de nomes de aba/pasta: sem acento, sem diferença de caixa e de espaços. */
export function normalizarNome(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/* "1111 - CAÇAMBA STANDARD 14M3 - SULPASSOS.xls" -> "1111". */
export function numeroDoProjeto(nomeArquivo: string): string | null {
  const nome = nomeArquivo.split(/[\\/]/).pop() ?? "";
  const m = /^\s*(\d+)\s*-/.exec(nome);
  return m ? m[1] : null;
}

/* Pastas da raiz que são do projeto: começam com o número seguido de hífen ("1111 - TESTE"). */
export function pastasDoProjeto(nomesNaRaiz: string[], numero: string): string[] {
  const padrao = new RegExp(`^\\s*0*${numero.replace(/^0+/, "")}\\s*-`);
  return nomesNaRaiz.filter((nome) => padrao.test(nome));
}

/* Nome que o Windows aceita para pasta. */
export function nomeDePastaSeguro(valor: string): string {
  return valor
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

/* "LISTA USINAGEM COMUM 969 - CAÇAMBA ..." -> "USINAGEM COMUM". */
export function nomeDaLista(titulo: string): string | null {
  const limpo = titulo.replace(/\s+/g, " ").trim();
  const comNumero = /^LISTA\s+(.+?)\s+\d+\s*-/i.exec(limpo);
  if (comNumero) return nomeDePastaSeguro(comNumero[1]) || null;
  const semNumero = /^LISTA\s+(.+)$/i.exec(limpo);
  return semNumero ? nomeDePastaSeguro(semNumero[1]) || null : null;
}

function texto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor).replace(/\s+/g, " ").trim();
}

/* Cabeçalho da coluna do código: "Nº DA PEÇA" (abas de separação) ou "Código" (aba original). */
function ehCabecalhoCodigo(valor: unknown): boolean {
  const n = normalizarNome(texto(valor)).replace(/[º°.]/g, "").replace(/\s+/g, " ");
  return /^N( O)? ?DA PECA$/.test(n) || n === "NO DA PECA" || n === "CODIGO";
}

/* Coluna do peso unitário: "Peso" (não "Peso total"). */
function ehCabecalhoPeso(valor: unknown): boolean {
  return normalizarNome(texto(valor)) === "PESO";
}

/* Peso da célula: número, ou texto com vírgula ("0,12922"). */
export function lerPeso(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const t = texto(valor).replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/* Código de item: começa com dígito; nada de "Peso total" e afins. */
function ehCodigo(valor: string): boolean {
  return /^[0-9][0-9A-Za-z._-]*$/.test(valor);
}

/*
 * Lê uma aba já convertida em linhas (sheet_to_json com header: 1).
 * Devolve os blocos (listas) com os códigos. Aba sem nenhum cabeçalho
 * reconhecido devolve listas vazia.
 */
export function lerAba(aba: string, linhas: unknown[][]): AbaLida {
  const listas: ListaDaAba[] = [];
  let tituloPendente: string | null = null;
  let atual: { lista: ListaDaAba; coluna: number; colunaPeso: number; vistos: Set<string> } | null = null;

  for (const linha of linhas) {
    const celulas = linha.map(texto);
    const preenchidas = celulas.filter(Boolean);
    if (preenchidas.length === 0) continue;

    const primeira = preenchidas[0];
    if (/^LISTA\s/i.test(primeira) && preenchidas.length <= 2) {
      tituloPendente = primeira;
      atual = null;
      continue;
    }

    const colunaCodigo = linha.findIndex(ehCabecalhoCodigo);
    if (colunaCodigo >= 0) {
      const lista: ListaDaAba = {
        titulo: tituloPendente,
        nome: tituloPendente ? nomeDaLista(tituloPendente) : null,
        codigos: [],
        pesos: {},
      };
      listas.push(lista);
      atual = { lista, coluna: colunaCodigo, colunaPeso: linha.findIndex(ehCabecalhoPeso), vistos: new Set() };
      tituloPendente = null;
      continue;
    }

    if (!atual) continue;
    const codigo = celulas[atual.coluna] ?? "";
    if (ehCodigo(codigo) && !atual.vistos.has(codigo)) {
      atual.vistos.add(codigo);
      atual.lista.codigos.push(codigo);
      atual.lista.pesos[codigo] = atual.colunaPeso >= 0 ? lerPeso(linha[atual.colunaPeso]) : null;
    }
  }

  return { aba, listas };
}

/*
 * Arquivos da origem que pertencem ao código, na ordem: o principal
 * ("20016668.pdf") e as folhas ("20016668_1.pdf", "_2", ...). Extensão
 * sem diferença de caixa. Cópias do Windows ("20010096 - Copia.dxf")
 * não casam.
 */
export function arquivosDoCodigo(nomesNaOrigem: string[], codigo: string, tipo: TipoArquivo): string[] {
  const esc = codigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const principal = new RegExp(`^${esc}\\.${tipo}$`, "i");
  const folha = new RegExp(`^${esc}_(\\d+)\\.${tipo}$`, "i");
  const achados = nomesNaOrigem.filter((n) => principal.test(n));
  const folhas = nomesNaOrigem
    .map((n) => ({ n, m: folha.exec(n) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
    .map((x) => x.n);
  return [...achados.slice(0, 1), ...folhas];
}

/*
 * O plano da separação. `existentesNoDestino` traz, por pasta relativa
 * (normalizada), os nomes de arquivo que já existem lá; pasta ausente
 * do mapa = pasta que não existe.
 */
export function montarPlano(params: {
  abas: AbaLida[];
  blacklist: string[];
  abasComDxf: string[];
  arquivosPdf: string[];
  arquivosDxf: string[];
  existentesNoDestino: Map<string, Set<string>>;
}): Plano {
  const bloqueadas = new Set(params.blacklist.map(normalizarNome));
  const comDxf = new Set(params.abasComDxf.map(normalizarNome));
  const itens: ItemPlano[] = [];
  const pastas: PastaPlano[] = [];
  const abasIgnoradas: Plano["abasIgnoradas"] = [];
  const chave = (caminho: string) => normalizarNome(caminho);

  for (const aba of params.abas) {
    if (bloqueadas.has(normalizarNome(aba.aba))) {
      abasIgnoradas.push({ aba: aba.aba, motivo: "blacklist", itens: 0 });
      continue;
    }
    if (aba.listas.length === 0) {
      abasIgnoradas.push({ aba: aba.aba, motivo: "sem_cabecalho", itens: 0 });
      continue;
    }

    const pastaAba = nomeDePastaSeguro(aba.aba);
    if (!pastaAba) {
      abasIgnoradas.push({ aba: aba.aba, motivo: "nome_invalido", itens: 0 });
      continue;
    }
    const tipos: TipoArquivo[] = comDxf.has(normalizarNome(aba.aba)) ? ["pdf", "dxf"] : ["pdf"];
    const subpastas = aba.listas.length > 1;
    const pastasDaAba: { caminho: string; temArquivo: boolean }[] = [];
    const itensDaAba: ItemPlano[] = [];

    aba.listas.forEach((lista, indice) => {
      const nomeSub = lista.nome ?? `LISTA ${indice + 1}`;
      const caminho = subpastas ? `${pastaAba}\\${nomeSub}` : pastaAba;
      const existentes = params.existentesNoDestino.get(chave(caminho));
      let temArquivo = false;

      for (const codigo of lista.codigos) {
        for (const tipo of tipos) {
          const nomes = arquivosDoCodigo(tipo === "pdf" ? params.arquivosPdf : params.arquivosDxf, codigo, tipo);
          if (nomes.length === 0) {
            itensDaAba.push({ aba: aba.aba, pastaDestino: caminho, codigo, tipo, arquivo: null, situacao: "nao_encontrado" });
            continue;
          }
          temArquivo = true;
          for (const arquivo of nomes) {
            const jaExiste = existentes?.has(arquivo.toLowerCase()) ?? false;
            itensDaAba.push({ aba: aba.aba, pastaDestino: caminho, codigo, tipo, arquivo, situacao: jaExiste ? "ja_existe" : "copiar" });
          }
        }
      }
      pastasDaAba.push({ caminho, temArquivo });
    });

    /* Aba sem nenhum arquivo (ex.: COMPRADOS): não vira pasta e os itens não contam como "não encontrados". */
    const algumArquivo = pastasDaAba.some((p) => p.temArquivo);
    if (!algumArquivo) {
      abasIgnoradas.push({ aba: aba.aba, motivo: "sem_arquivos", itens: aba.listas.reduce((n, l) => n + l.codigos.length, 0) });
      continue;
    }
    itens.push(...itensDaAba);

    if (subpastas) {
      const existe = params.existentesNoDestino.has(chave(pastaAba));
      pastas.push({ caminho: pastaAba, existe, criar: !existe && algumArquivo });
    }
    for (const p of pastasDaAba) {
      const existe = params.existentesNoDestino.has(chave(p.caminho));
      pastas.push({ caminho: p.caminho, existe, criar: !existe && p.temArquivo });
    }
  }

  return { itens, pastas, abasIgnoradas };
}
