/*
 * Carrega o OpenCascade (occt-import-js) sob demanda.
 *
 * São ~7,6 MB de WebAssembly -- não pode entrar no bundle da página,
 * senão todo mundo paga por um download que só interessa a quem abre
 * um STEP. Por isso o .js vem por <script> de /occt (arquivos estáticos
 * copiados do pacote, ver public/occt) e não por import: assim o
 * bundler não tenta resolver as dependências de Node que o código
 * gerado pelo Emscripten carrega consigo.
 *
 * A instância é guardada depois do primeiro uso -- abrir o segundo
 * arquivo não baixa nada de novo.
 */

export interface MalhaOcct {
  name?: string;
  color?: [number, number, number];
  attributes: {
    position: { array: number[] };
    normal?: { array: number[] };
  };
  index: { array: number[] };
}

export interface ResultadoOcct {
  success: boolean;
  root?: { name?: string; meshes?: number[]; children?: unknown[] };
  meshes: MalhaOcct[];
}

interface InstanciaOcct {
  ReadStepFile: (conteudo: Uint8Array, params: unknown) => ResultadoOcct;
  ReadIgesFile: (conteudo: Uint8Array, params: unknown) => ResultadoOcct;
  ReadBrepFile: (conteudo: Uint8Array, params: unknown) => ResultadoOcct;
}

type FabricaOcct = (config?: {
  locateFile?: (arquivo: string) => string;
}) => Promise<InstanciaOcct>;

declare global {
  interface Window {
    occtimportjs?: FabricaOcct;
  }
}

const CAMINHO_BASE = "/occt";

let instancia: InstanciaOcct | null = null;
let carregando: Promise<InstanciaOcct> | null = null;

function carregarScript(): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const existente = document.querySelector<HTMLScriptElement>(
      `script[src="${CAMINHO_BASE}/occt-import-js.js"]`
    );

    if (existente) {
      if (window.occtimportjs) {
        resolver();
        return;
      }

      existente.addEventListener("load", () => resolver());
      existente.addEventListener("error", () =>
        rejeitar(new Error("Falha ao carregar o leitor de STEP/IGES."))
      );
      return;
    }

    const script = document.createElement("script");
    script.src = `${CAMINHO_BASE}/occt-import-js.js`;
    script.async = true;
    script.onload = () => resolver();
    script.onerror = () => rejeitar(new Error("Falha ao carregar o leitor de STEP/IGES."));
    document.head.appendChild(script);
  });
}

export async function obterOcct(): Promise<InstanciaOcct> {
  if (instancia) return instancia;
  if (carregando) return carregando;

  carregando = (async () => {
    await carregarScript();

    const fabrica = window.occtimportjs;
    if (!fabrica) {
      throw new Error("O leitor de STEP/IGES não ficou disponível.");
    }

    /* locateFile diz onde está o .wasm, que o .js busca em tempo de execução. */
    instancia = await fabrica({
      locateFile: (arquivo: string) => `${CAMINHO_BASE}/${arquivo}`,
    });

    return instancia;
  })();

  try {
    return await carregando;
  } catch (erro) {
    /* Deixa tentar de novo num próximo arquivo em vez de travar para sempre. */
    carregando = null;
    throw erro;
  }
}

export function lerArquivoCad(
  occt: InstanciaOcct,
  extensao: string,
  conteudo: Uint8Array
): ResultadoOcct {
  if (extensao === ".brep") return occt.ReadBrepFile(conteudo, null);
  if (extensao === ".iges" || extensao === ".igs") return occt.ReadIgesFile(conteudo, null);
  return occt.ReadStepFile(conteudo, null);
}
