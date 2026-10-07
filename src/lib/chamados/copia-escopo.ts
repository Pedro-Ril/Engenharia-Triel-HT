import "server-only";

import type { PortalUsuario } from "@/lib/auth/usuarios";

import { getSetoresQueAtende } from "./autorizacao-chamados";

/*
 * Quem o solicitante comum pode colocar em cópia num chamado: só gente
 * do próprio setor. A ideia é não vazar o assunto de um chamado para
 * fora da área de quem abriu.
 *
 * "Setor" aqui é o `departamento` que vem do Active Directory, igual
 * exato -- "Engenharia Viaturas" e "Engenharia Agro" são setores
 * diferentes e não se enxergam.
 *
 * Três papéis escapam da regra e colocam qualquer um:
 *  - administrador do portal;
 *  - atendente de chamados (de qualquer setor) -- ele já enxerga o
 *    chamado inteiro de qualquer forma;
 *  - quem está no departamento "Gerencia" do AD.
 */

/* O departamento do AD que identifica a gerência. */
const DEPARTAMENTO_GERENCIA = "gerencia";

/*
 * Compara departamento sem depender de caixa ou espaço sobrando -- o
 * AD não é consistente nisso, e um "TI " não deveria virar um setor
 * diferente de "TI". Não normaliza acento de propósito: isso juntaria
 * nomes que são mesmo distintos.
 */
export function mesmoDepartamento(
  umDepartamento: string | null,
  outroDepartamento: string | null
): boolean {
  const um = (umDepartamento ?? "").trim().toLowerCase();
  const outro = (outroDepartamento ?? "").trim().toLowerCase();

  if (!um || !outro) return false;

  return um === outro;
}

export function ehDaGerencia(usuario: PortalUsuario | null): boolean {
  return (usuario?.departamento ?? "").trim().toLowerCase() === DEPARTAMENTO_GERENCIA;
}

export async function podeColocarQualquerUmEmCopia(
  usuario: PortalUsuario | null
): Promise<boolean> {
  if (!usuario) return false;
  if (usuario.ehAdministrador) return true;
  if (ehDaGerencia(usuario)) return true;

  /* null = administrador; lista não vazia = atendente de algum setor. */
  const setoresAtendidos = await getSetoresQueAtende(usuario);

  return setoresAtendidos === null || setoresAtendidos.length > 0;
}

/*
 * O escopo da busca de pessoas para cópia. É um objeto, e não um
 * "departamento ou null", porque null teria dois sentidos opostos --
 * "pode qualquer um" e "não tem departamento no AD" -- e confundir os
 * dois liberaria geral justamente para quem está sem cadastro.
 */
export type EscopoCopia =
  | { irrestrito: true }
  | { irrestrito: false; departamento: string | null };

export async function escopoDeCopia(usuario: PortalUsuario | null): Promise<EscopoCopia> {
  if (await podeColocarQualquerUmEmCopia(usuario)) return { irrestrito: true };

  const departamento = (usuario?.departamento ?? "").trim();

  return { irrestrito: false, departamento: departamento || null };
}
