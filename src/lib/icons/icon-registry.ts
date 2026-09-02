import * as LucideIcons from "lucide-react";
import { Folder } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/*
 * Catálogo de ícones oferecido na tela de administração (seletor
 * visual, não é mais possível digitar o nome). O banco continua
 * guardando só o nome (string) — este mapa resolve esse nome para o
 * componente lucide-react real.
 *
 * Antes disso era uma lista curada de ~68 ícones escolhidos à mão —
 * ficava sem espaço pra ícones específicos de módulos novos (ex:
 * "Scale" pro Semáforo da Balança só coube por sorte). Em vez de
 * manter essa lista crescendo módulo a módulo, expõe o catálogo
 * INTEIRO da biblioteca (quase 2 mil ícones): a biblioteca já
 * exporta cada ícone sob 3 nomes (`Nome`, `NomeIcon`, `LucideNome`,
 * todos apontando pro mesmo componente) — o filtro abaixo mantém só
 * a forma "Nome" (PascalCase puro), descartando os apelidos
 * duplicados e os poucos exports que não são ícones
 * (`createLucideIcon`, o mapa `icons`, etc.).
 */
const REGISTRO_ICONES: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(LucideIcons).filter(
    ([nome, valor]) =>
      typeof valor === "object" || typeof valor === "function"
        ? /^[A-Z][A-Za-z0-9]*$/.test(nome) &&
          !nome.endsWith("Icon") &&
          !nome.startsWith("Lucide") &&
          nome !== "Icon"
        : false
  )
) as Record<string, LucideIcon>;

export interface OpcaoIcone {
  nome: string;
  Icon: LucideIcon;
}

export const ICONES_PORTAL: OpcaoIcone[] = Object.entries(REGISTRO_ICONES)
  .map(([nome, Icon]) => ({ nome, Icon }))
  .sort((a, b) => a.nome.localeCompare(b.nome));

export function resolverIcone(nomeIcone: string | null): LucideIcon {
  if (!nomeIcone) {
    return Folder;
  }

  return REGISTRO_ICONES[nomeIcone] ?? Folder;
}
