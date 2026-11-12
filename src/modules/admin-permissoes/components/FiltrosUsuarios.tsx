"use client";

import { useState } from "react";

import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Stack } from "@/components/ui/Stack";

import type { PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import {
  SEM_DEPARTAMENTO,
  filtrarUsuarios,
  listarDepartamentos,
  type FiltroAcesso,
} from "../utils/permissoesFiltros";

/*
 * Busca e filtros de usuário da aba Permissões (lista da esquerda e os
 * modais de "copiar acessos" e "adicionar pessoas"). Filtro todo no
 * navegador: a lista inteira já está carregada, então não há requisição
 * por tecla nem necessidade de debounce.
 */
export function useFiltroUsuarios(
  usuarios: PortalUsuarioAdmin[],
  totalPorUsuario: Map<string, number>,
  inicial?: { departamento?: string; acesso?: FiltroAcesso }
) {
  const [busca, setBusca] = useState("");
  const [departamento, setDepartamento] = useState(inicial?.departamento ?? "");
  const [acesso, setAcesso] = useState<FiltroAcesso>(inicial?.acesso ?? "todos");

  return {
    busca,
    setBusca,
    departamento,
    setDepartamento,
    acesso,
    setAcesso,
    departamentos: listarDepartamentos(usuarios),
    filtrados: filtrarUsuarios(usuarios, { busca, departamento, acesso, totalPorUsuario }),
  };
}

export type FiltroUsuarios = ReturnType<typeof useFiltroUsuarios>;

export function rotuloDepartamento(departamento: string | null | undefined): string {
  return !departamento?.trim() || departamento === SEM_DEPARTAMENTO ? "Sem departamento" : departamento;
}

const OPCOES_ACESSO: { value: FiltroAcesso; label: string }[] = [
  { value: "todos", label: "Com e sem acesso" },
  { value: "com", label: "Com algum acesso" },
  { value: "sem", label: "Sem nenhum acesso" },
];

interface FiltrosUsuariosProps {
  filtro: FiltroUsuarios;
  mostrarAcesso?: boolean;
  autoFocus?: boolean;
}

export function FiltrosUsuarios({ filtro, mostrarAcesso = false, autoFocus = false }: FiltrosUsuariosProps) {
  return (
    <Stack gap={8}>
      <Input
        type="search"
        aria-label="Buscar usuário"
        placeholder="Buscar por nome, login ou departamento"
        autoFocus={autoFocus}
        value={filtro.busca}
        onChange={(event) => filtro.setBusca(event.target.value)}
      />

      <Dropdown
        value={filtro.departamento}
        onValueChange={filtro.setDepartamento}
        options={[
          { value: "", label: "Todos os departamentos" },
          ...filtro.departamentos.map((departamento) => ({
            value: departamento,
            label: rotuloDepartamento(departamento),
          })),
        ]}
      />

      {mostrarAcesso && (
        <Dropdown
          value={filtro.acesso}
          onValueChange={(valor) => filtro.setAcesso(valor as FiltroAcesso)}
          options={OPCOES_ACESSO}
        />
      )}
    </Stack>
  );
}
