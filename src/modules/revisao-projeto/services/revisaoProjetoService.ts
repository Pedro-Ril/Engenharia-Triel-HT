import { AnaliseExcelResponse } from "../types/revisaoProjetoTypes";

export async function analisarEstruturaExcel(
  arquivo: File
): Promise<AnaliseExcelResponse> {
  const formData = new FormData();
  formData.append("arquivo", arquivo);

  console.log("📤 Enviando arquivo para API:", {
    nome: arquivo.name,
    tamanho: arquivo.size,
    tipo: arquivo.type,
  });

  const response = await fetch("/api/revisao-projeto/analisar-excel", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  console.log("📥 RETORNO COMPLETO DA API:", data);

  if (data?.estrutura?.length) {
    console.log("🌳 PRIMEIRA RAIZ:", data.estrutura[0]);

    const itensM2Convertidos: any[] = [];

    function percorrer(nodes: any[]) {
      for (const node of nodes) {
        if (
          node.codigo === "7126509" ||
          node.unidadeOriginal === "M2" ||
          node.unidadeOriginal === "M²" ||
          node.mpConvertidaKg
        ) {
          itensM2Convertidos.push({
            linhaExcel: node.linhaExcel,
            codigo: node.codigo,
            descricao: node.descricao,
            quantidade: node.quantidade,
            unidade: node.unidade,
            quantidadeOriginal: node.quantidadeOriginal,
            unidadeOriginal: node.unidadeOriginal,
            pesoKg: node.pesoKg,
            mpConvertidaKg: node.mpConvertidaKg,
            pesoKgPaiImediato: node.pesoKgPaiImediato,
            codigoPaiImediato: node.codigoPaiImediato,
            descricaoPaiImediato: node.descricaoPaiImediato,
          });
        }

        if (node.filhos?.length) {
          percorrer(node.filhos);
        }
      }
    }

    percorrer(data.estrutura);

    console.table(itensM2Convertidos);
  }

  if (!response.ok || !data.success) {
    throw new Error(data?.message || "Erro ao analisar estrutura.");
  }

  return data;
}