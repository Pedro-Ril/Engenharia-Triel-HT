import type { Empresa, UnidadeEmpresa } from "../types/adminPermissoes.types";

/*
 * Mesma regra do servidor (buscarEmpresaPorCodigo): empresa ATIVA cujo
 * código bate com o "Código de empresa" do usuário, ignorando espaços e
 * maiúsculas.
 */
export function empresaDoCodigo(
  empresas: Empresa[],
  codigoEmpresa: string | null
): Empresa | null {
  const codigo = codigoEmpresa?.trim().toLowerCase();
  if (!codigo) return null;

  return (
    empresas.find(
      (empresa) => empresa.ativa && empresa.codigo?.trim().toLowerCase() === codigo
    ) ?? null
  );
}

export function unidadesAtivasDaEmpresa(
  unidades: UnidadeEmpresa[],
  empresaId: string | null | undefined
): UnidadeEmpresa[] {
  if (!empresaId) return [];

  return unidades
    .filter((unidade) => unidade.empresaId === empresaId && unidade.ativa)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
