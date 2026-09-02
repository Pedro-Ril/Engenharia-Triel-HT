import type {
  ApiIntegracaoResponse,
  DxfValidacaoResultado,
  TabelaProcessamentoRow,
  TipoBusca,
} from "@/modules/integra-lantek-agro/types/processamentoOrdens.types";

export async function buscarOrdens(
  tipo: TipoBusca,
  valor: string
): Promise<ApiIntegracaoResponse> {
  const response = await fetch("/api/integra-lantek/buscar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tipo,
      valor,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao buscar dados da integração.");
  }

  return data;
}

export async function validarDxf(
  itens: Array<{
    codigo: string;
    codDesenho?: string | null;
  }>
) {
  const response = await fetch("/api/integra-lantek/validar-dxf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ itens }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao validar arquivos DXF.");
  }

  return data as {
    success: boolean;
    total: number;
    resultados: DxfValidacaoResultado[];
  };
}

export async function exportarPlanilha(rows: TabelaProcessamentoRow[]) {
  const response = await fetch("/api/integra-lantek/exportar-agro", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rows }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao exportar planilha.");
  }

  return data;
}