import type { PortalModulo, PortalUsuarioAdmin } from "../types/adminPermissoes.types";

/* Valor do filtro de departamento para quem não tem departamento no AD. */
export const SEM_DEPARTAMENTO = "__sem__";

export type FiltroAcesso = "todos" | "com" | "sem";

export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/*
 * Busca por nome, login, e-mail ou departamento. Cada palavra digitada
 * precisa aparecer em algum desses campos ("joao eng" acha o João da
 * Engenharia), sem diferenciar acento nem maiúscula.
 */
export function usuarioCombinaBusca(usuario: PortalUsuarioAdmin, busca: string): boolean {
  const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return true;

  const alvo = normalizarBusca(
    [usuario.nomeExibicao, usuario.samAccountName, usuario.email ?? "", usuario.departamento ?? ""].join(" ")
  );

  return termos.every((termo) => alvo.includes(termo));
}

export function moduloCombinaBusca(modulo: PortalModulo, busca: string): boolean {
  const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return true;

  const alvo = normalizarBusca(`${modulo.nome} ${modulo.path}`);
  return termos.every((termo) => alvo.includes(termo));
}

export function departamentoDoUsuario(usuario: PortalUsuarioAdmin): string {
  return usuario.departamento?.trim() || SEM_DEPARTAMENTO;
}

/* Departamentos distintos, em ordem alfabética; "sem departamento" por último. */
export function listarDepartamentos(usuarios: PortalUsuarioAdmin[]): string[] {
  const departamentos = new Set(usuarios.map(departamentoDoUsuario));
  const comNome = [...departamentos].filter((d) => d !== SEM_DEPARTAMENTO).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return departamentos.has(SEM_DEPARTAMENTO) ? [...comNome, SEM_DEPARTAMENTO] : comNome;
}

export interface FiltrosUsuarios {
  busca: string;
  /* "" = todos os departamentos. */
  departamento: string;
  acesso: FiltroAcesso;
  totalPorUsuario: Map<string, number>;
}

export function filtrarUsuarios(usuarios: PortalUsuarioAdmin[], filtros: FiltrosUsuarios): PortalUsuarioAdmin[] {
  return usuarios.filter((usuario) => {
    if (filtros.departamento && departamentoDoUsuario(usuario) !== filtros.departamento) return false;

    const total = filtros.totalPorUsuario.get(usuario.id) ?? 0;
    if (filtros.acesso === "com" && total === 0) return false;
    if (filtros.acesso === "sem" && total > 0) return false;

    return usuarioCombinaBusca(usuario, filtros.busca);
  });
}

/*
 * Roda as tarefas com no máximo `limite` em paralelo -- conceder acesso a
 * 100 pessoas de uma vez não pode virar 100 requisições simultâneas.
 * Mantém a ordem dos resultados igual à dos itens.
 */
export async function executarEmLotes<T, R>(
  itens: T[],
  limite: number,
  tarefa: (item: T) => Promise<R>
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;

  async function trabalhador() {
    while (proximo < itens.length) {
      const indice = proximo++;
      resultados[indice] = await tarefa(itens[indice]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultados;
}
