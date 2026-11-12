"use client";

import { useState } from "react";
import { LayoutGrid, UserRound } from "lucide-react";

import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Stack } from "@/components/ui/Stack";

import {
  concederPermissao,
  revogarPermissao,
} from "../services/adminPermissoes.service";
import type {
  PortalModulo,
  PortalPermissao,
  PortalSetor,
  PortalUsuarioAdmin,
} from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import { executarEmLotes } from "../utils/permissoesFiltros";
import { PermissoesPorModulo } from "./PermissoesPorModulo";
import { PermissoesPorUsuario } from "./PermissoesPorUsuario";

interface PermissoesPainelProps {
  setores: PortalSetor[];
  modulos: PortalModulo[];
  usuarios: PortalUsuarioAdmin[];
  permissoes: PortalPermissao[];
  onPermissaoCriada: (permissao: PortalPermissao) => void;
  onPermissaoRemovida: (permissaoId: string) => void;
  onFeedback: FeedbackHandler;
}

export interface ParPermissao {
  usuario: PortalUsuarioAdmin;
  modulo: PortalModulo;
}

export interface SetorComModulos {
  setor: PortalSetor;
  modulos: PortalModulo[];
}

/* O que as duas visões (por usuário / por módulo) usam para ler e alterar acessos. */
export interface OperacoesPermissoes {
  permissaoDe: (usuarioId: string, moduloId: string) => PortalPermissao | undefined;
  emAndamento: (usuarioId: string, moduloId: string) => boolean;
  /* `resumo` monta a mensagem quando é mais de um acesso de uma vez. */
  conceder: (pares: ParPermissao[], resumo?: (quantidade: number) => string) => Promise<void>;
  revogar: (pares: ParPermissao[], resumo?: (quantidade: number) => string) => Promise<void>;
}

/* Quantas requisições de conceder/revogar ficam em voo ao mesmo tempo numa ação em massa. */
const PARALELISMO = 6;

type Visao = "usuario" | "modulo";

function chave(usuarioId: string, moduloId: string) {
  return `${usuarioId}:${moduloId}`;
}

export function PermissoesPainel({
  setores,
  modulos,
  usuarios,
  permissoes,
  onPermissaoCriada,
  onPermissaoRemovida,
  onFeedback,
}: PermissoesPainelProps) {
  const [visao, setVisao] = useState<Visao>("usuario");
  const [chavesEmAndamento, setChavesEmAndamento] = useState<Set<string>>(() => new Set());

  /* Administradores já têm acesso a tudo -- não entram na lista. */
  const usuariosAtivos = usuarios
    .filter((usuario) => usuario.ativo && !usuario.ehAdministrador)
    .sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao, "pt-BR"));

  /*
   * Só faz sentido conceder acesso individual a módulos que
   * não são públicos — módulos públicos já liberam sozinhos.
   */
  const modulosRestritos = modulos.filter(
    (modulo) => modulo.ativo && !modulo.publicoSemLogin && !modulo.publicoAutenticado
  );
  const idsRestritos = new Set(modulosRestritos.map((modulo) => modulo.id));

  const setoresComModulos: SetorComModulos[] = setores
    .map((setor) => ({
      setor,
      modulos: modulosRestritos
        .filter((modulo) => modulo.setorIds.includes(setor.id))
        .sort((a, b) => a.ordem - b.ordem),
    }))
    .filter((grupo) => grupo.modulos.length > 0);

  const permissaoPorChave = new Map<string, PortalPermissao>();
  const totalPorUsuario = new Map<string, number>();
  const totalPorModulo = new Map<string, number>();

  for (const permissao of permissoes) {
    permissaoPorChave.set(chave(permissao.usuarioId, permissao.moduloId), permissao);

    /* Contadores só olham módulos restritos ativos -- os mesmos que aparecem na tela. */
    if (idsRestritos.has(permissao.moduloId)) {
      totalPorUsuario.set(permissao.usuarioId, (totalPorUsuario.get(permissao.usuarioId) ?? 0) + 1);
      totalPorModulo.set(permissao.moduloId, (totalPorModulo.get(permissao.moduloId) ?? 0) + 1);
    }
  }

  function marcarEmAndamento(chaves: string[], ligado: boolean) {
    setChavesEmAndamento((atual) => {
      const proximo = new Set(atual);
      for (const item of chaves) {
        if (ligado) proximo.add(item);
        else proximo.delete(item);
      }
      return proximo;
    });
  }

  async function aplicar(
    tipo: "conceder" | "revogar",
    pares: ParPermissao[],
    resumo?: (quantidade: number) => string
  ) {
    /* Ignora o que já está no estado pedido (ex: "marcar todos" com metade já marcada). */
    const alvos = pares
      .map((par) => ({ par, existente: permissaoPorChave.get(chave(par.usuario.id, par.modulo.id)) }))
      .filter(({ par, existente }) =>
        (tipo === "conceder" ? !existente : Boolean(existente)) &&
        !chavesEmAndamento.has(chave(par.usuario.id, par.modulo.id))
      );

    if (alvos.length === 0) return;

    const chaves = alvos.map(({ par }) => chave(par.usuario.id, par.modulo.id));
    marcarEmAndamento(chaves, true);

    try {
      const resultados = await executarEmLotes(alvos, PARALELISMO, async ({ par, existente }) => {
        try {
          if (tipo === "conceder") {
            const resultado = await concederPermissao({ usuarioId: par.usuario.id, moduloId: par.modulo.id });
            if (resultado.ok && resultado.data) {
              onPermissaoCriada(resultado.data);
              return { ok: true, message: undefined };
            }
            return { ok: false, message: resultado.message };
          }

          const resultado = await revogarPermissao(existente!.id);
          if (resultado.ok) {
            onPermissaoRemovida(existente!.id);
            return { ok: true, message: undefined };
          }
          return { ok: false, message: resultado.message };
        } catch {
          return { ok: false, message: "Falha de comunicação com o servidor." };
        }
      });

      const sucesso = resultados.filter((resultado) => resultado.ok).length;
      const primeiraFalha = resultados.find((resultado) => !resultado.ok)?.message ?? "Tente novamente em instantes.";

      if (alvos.length === 1) {
        const { usuario, modulo } = alvos[0].par;

        if (tipo === "conceder") {
          onFeedback(
            sucesso ? "success" : "danger",
            sucesso ? "Acesso concedido" : "Não foi possível conceder o acesso",
            sucesso ? `${usuario.nomeExibicao} agora tem acesso a "${modulo.nome}".` : primeiraFalha
          );
        } else {
          onFeedback(
            sucesso ? "success" : "danger",
            sucesso ? "Acesso revogado" : "Não foi possível revogar o acesso",
            sucesso ? `${usuario.nomeExibicao} perdeu o acesso a "${modulo.nome}".` : primeiraFalha
          );
        }
        return;
      }

      const verbo = tipo === "conceder" ? "concedidos" : "revogados";

      if (sucesso === alvos.length) {
        onFeedback(
          "success",
          tipo === "conceder" ? "Acessos concedidos" : "Acessos revogados",
          resumo?.(sucesso) ?? `${sucesso} acessos ${verbo}.`
        );
      } else {
        onFeedback(
          "danger",
          "Nem todos os acessos foram alterados",
          `${sucesso} de ${alvos.length} ${verbo}. ${primeiraFalha}`
        );
      }
    } finally {
      marcarEmAndamento(chaves, false);
    }
  }

  const operacoes: OperacoesPermissoes = {
    permissaoDe: (usuarioId, moduloId) => permissaoPorChave.get(chave(usuarioId, moduloId)),
    emAndamento: (usuarioId, moduloId) => chavesEmAndamento.has(chave(usuarioId, moduloId)),
    conceder: (pares, resumo) => aplicar("conceder", pares, resumo),
    revogar: (pares, resumo) => aplicar("revogar", pares, resumo),
  };

  if (modulosRestritos.length === 0) {
    return (
      <p>
        Nenhum módulo restrito cadastrado — todos os módulos ativos estão
        marcados como públicos. Ajuste isso na aba &quot;Setores e
        módulos&quot; para liberar acesso individual por usuário.
      </p>
    );
  }

  if (usuariosAtivos.length === 0) {
    return (
      <p>
        Nenhum usuário disponível para receber permissões — administradores
        já têm acesso a tudo automaticamente e não aparecem aqui.
      </p>
    );
  }

  return (
    <Stack gap={16}>
      <SegmentedTabs<Visao>
        itens={[
          { valor: "usuario", label: "Por usuário", icon: <UserRound size={15} /> },
          { valor: "modulo", label: "Por módulo", icon: <LayoutGrid size={15} /> },
        ]}
        ativo={visao}
        onSelecionar={setVisao}
      />

      {visao === "usuario" ? (
        <PermissoesPorUsuario
          usuarios={usuariosAtivos}
          setoresComModulos={setoresComModulos}
          totalModulos={modulosRestritos.length}
          totalPorUsuario={totalPorUsuario}
          operacoes={operacoes}
        />
      ) : (
        <PermissoesPorModulo
          usuarios={usuariosAtivos}
          setores={setores}
          setoresComModulos={setoresComModulos}
          totalPorUsuario={totalPorUsuario}
          totalPorModulo={totalPorModulo}
          operacoes={operacoes}
        />
      )}
    </Stack>
  );
}
