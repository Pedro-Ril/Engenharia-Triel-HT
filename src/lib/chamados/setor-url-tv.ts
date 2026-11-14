/*
 * ?setor= do BI de chamados na TV (/chamados/dashboard/tv): aceita um
 * endereço fácil de digitar na TV -- o nome do setor (?setor=ti,
 * ?setor=manutencao) -- além do id (links antigos continuam valendo) e da
 * chave cadastrada. Sem diferenciar maiúsculas, acentos nem espaço/hífen.
 * Função pura (sem banco) para dar para testar.
 */

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SetorParaUrl {
  id: string;
  chave: string;
  nome: string;
}

/* "Manutenção Elétrica" -> "manutencao-eletrica". */
export function normalizarTextoUrl(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* Ordem: id exato, chave cadastrada, nome do setor. null = não achou. */
export function encontrarSetorDaUrl(valor: string, setores: SetorParaUrl[]): SetorParaUrl | null {
  const bruto = valor.trim();
  if (!bruto) return null;

  if (PADRAO_UUID.test(bruto)) {
    return setores.find((setor) => setor.id.toLowerCase() === bruto.toLowerCase()) ?? null;
  }

  const alvo = normalizarTextoUrl(bruto);
  if (!alvo) return null;

  return (
    setores.find((setor) => normalizarTextoUrl(setor.chave) === alvo) ??
    setores.find((setor) => normalizarTextoUrl(setor.nome) === alvo) ??
    null
  );
}
