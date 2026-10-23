import type {
  RegistroValidacao,
  ResultadoArquivo,
} from "../types/validacaoXmlNfe.types";

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

const API = "/api/validacao-xml-nfe/validacoes";

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  try {
    return await response.json();
  } catch {
    return { ok: false, message: `Resposta inválida do servidor (HTTP ${response.status}).` };
  }
}

export async function listarValidacoes(): Promise<ApiEnvelope<RegistroValidacao[]>> {
  try {
    return parseResponse<RegistroValidacao[]>(await fetch(API, { cache: "no-store" }));
  } catch {
    return { ok: false, message: "Sem comunicação com o servidor." };
  }
}

/* Grava a validação feita no navegador, com o XML. */
export async function registrarValidacao(
  resultado: ResultadoArquivo,
  xml: string
): Promise<ApiEnvelope<RegistroValidacao>> {
  const corpo =
    resultado.tipo === "nota"
      ? {
          arquivo: resultado.nota.arquivo,
          numeroNota: resultado.nota.numero || null,
          serie: resultado.nota.serie || null,
          chaveAcesso: resultado.nota.chave || null,
          destinatario: resultado.nota.destinatario.nome || null,
          situacao: resultado.nota.situacao,
          qtdErros: resultado.nota.apontamentos.filter((a) => a.severidade === "erro").length,
          qtdAvisos: resultado.nota.apontamentos.filter((a) => a.severidade === "aviso").length,
          apontamentos: resultado.nota.apontamentos.map(
            (a) => `[${a.origem === "sefaz" ? "SEFAZ" : "Conferência"}] ${a.item ? `Item ${a.item}: ` : ""}${a.mensagem}`
          ),
          xml,
        }
      : {
          arquivo: resultado.falha.arquivo,
          situacao: "falha",
          qtdErros: 1,
          qtdAvisos: 0,
          apontamentos: [resultado.falha.mensagem],
          xml,
        };

  try {
    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });

    return parseResponse<RegistroValidacao>(response);
  } catch {
    return { ok: false, message: "Sem comunicação com o servidor." };
  }
}

export function urlDownloadXml(id: string): string {
  return `${API}/${encodeURIComponent(id)}/xml`;
}
