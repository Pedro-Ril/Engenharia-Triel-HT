/*
 * Mesma API de estrutura usada em cadastro-roteiro
 * (buscarEstruturaComRoteiros), mas só o item consultado — o
 * terminal de fábrica é uma consulta pontual de um único
 * código, não precisa montar a árvore de estrutura nem buscar
 * roteiro de cada descendente.
 */
const API_STRUCTURE = "http://proserver.trielht.com.br:1001/api/search/structure";
const EMPR_ID_FIXO = 2;

export interface ItemInfoTerminal {
  codigo: string;
  titulo: string;
  descricao: string;
  revisao: string;
  estado: string;
  tipo: string;
}

export async function buscarItemInfo(
  codigoDigitado: string
): Promise<ItemInfoTerminal> {
  const codigo = String(codigoDigitado || "").trim();

  if (!codigo) {
    throw new Error("Informe o código do item.");
  }

  const url = new URL(`${API_STRUCTURE}/${encodeURIComponent(codigo)}`);
  url.searchParams.set("empr_id", String(EMPR_ID_FIXO));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      json?.message ||
        json?.error ||
        `Item não encontrado. HTTP ${response.status}.`
    );
  }

  if (!json?.success || !json?.item) {
    throw new Error("Item não encontrado.");
  }

  return {
    codigo: json.item.codigo || codigo,
    titulo: json.item.titulo || "",
    descricao: json.item.descricao || "",
    revisao: json.item.revisao || "",
    estado: json.item.estado || "",
    tipo: json.item.tipo || "",
  };
}
