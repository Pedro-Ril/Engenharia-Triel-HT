import type {
  ApiIntegracaoResponse,
  LinhaExportacao,
  TipoBusca,
  ValidacaoStepResposta,
} from "@/modules/integra-tubest/types/integraTubest.types";

interface Envelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseEnvelope<T>(response: Response, erroPadrao: string): Promise<T> {
  const corpo = (await response.json().catch(() => null)) as Envelope<T> | null;

  if (!response.ok || !corpo?.ok) {
    throw new Error(corpo?.message || erroPadrao);
  }

  return corpo.data as T;
}

export async function buscarOrdens(
  tipo: TipoBusca,
  valor: string
): Promise<ApiIntegracaoResponse> {
  const response = await fetch("/api/integra-tubest/buscar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, valor }),
  });

  return parseEnvelope<ApiIntegracaoResponse>(response, "Erro ao buscar dados da integração.");
}

export async function validarStep(codigos: string[]): Promise<ValidacaoStepResposta> {
  const response = await fetch("/api/integra-tubest/validar-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigos }),
  });

  return parseEnvelope<ValidacaoStepResposta>(response, "Erro ao conferir os arquivos STEP.");
}

/*
 * Devolve o arquivo em memória — quem escolhe onde salvar é a pessoa,
 * no diálogo do navegador. Erro vem como JSON, sucesso como binário.
 */
export async function gerarPlanilha(
  linhas: LinhaExportacao[],
  opcoes: { separarPorMp: boolean; nomeBase: string; numeroCarro: string }
): Promise<Blob> {
  const response = await fetch("/api/integra-tubest/exportar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ linhas, ...opcoes }),
  });

  if (!response.ok) {
    const corpo = (await response.json().catch(() => null)) as Envelope<never> | null;
    throw new Error(corpo?.message || "Erro ao gerar a planilha de importação.");
  }

  return response.blob();
}
