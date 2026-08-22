import "server-only";

import { NextResponse } from "next/server";

import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import type { PortalUsuario } from "@/lib/auth/usuarios";

import { verificarAcessoChamado } from "./autorizacao-chamados";
import { buscarChamadoPorNumero, type Chamado } from "./chamados";

export function parseNumeroChamado(valor: string): number | null {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

interface ContextoAcaoChamado {
  chamado: Chamado;
  usuario: PortalUsuario | null;
  ehAtendente: boolean;
}

/*
 * Boilerplate comum às rotas de ação de um chamado (aceitar,
 * marcar-resolvido, confirmar-resolucao, reabrir, fechar):
 * localizar o chamado pelo número, checar acesso (dono / nome
 * confirmado / atendente do setor / admin) e devolver o
 * contexto já validado — ou uma resposta de erro pronta.
 */
export async function carregarContextoAcao(
  numeroParam: string,
  nomeConfirmado: string | null
): Promise<
  | { contexto: ContextoAcaoChamado; erro: null }
  | { contexto: null; erro: NextResponse }
> {
  const numero = parseNumeroChamado(numeroParam);

  if (!numero) {
    return {
      contexto: null,
      erro: NextResponse.json(
        { ok: false, message: "Número de chamado inválido." },
        { status: 400 }
      ),
    };
  }

  const chamado = await buscarChamadoPorNumero(numero);

  if (!chamado) {
    return {
      contexto: null,
      erro: NextResponse.json(
        { ok: false, message: "Chamado não encontrado." },
        { status: 404 }
      ),
    };
  }

  const usuario = await getUsuarioAutenticado();
  const { podeVer, ehAtendente } = await verificarAcessoChamado(
    chamado,
    usuario,
    nomeConfirmado
  );

  if (!podeVer) {
    return {
      contexto: null,
      erro: NextResponse.json(
        { ok: false, message: "Você não tem acesso a este chamado." },
        { status: 403 }
      ),
    };
  }

  return { contexto: { chamado, usuario, ehAtendente }, erro: null };
}

export async function lerNomeConfirmado(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "nome" in body) {
      const nome = (body as { nome?: unknown }).nome;
      return typeof nome === "string" ? nome : null;
    }
  } catch {
    /* corpo vazio é válido — a maioria das ações não precisa de nenhum campo. */
  }

  return null;
}
