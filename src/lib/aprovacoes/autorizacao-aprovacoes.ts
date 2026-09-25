import "server-only";

import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import type { PortalUsuario } from "@/lib/auth/usuarios";

import { listarTiposQueAtende } from "./atendentes";
import type { TipoAprovacao } from "./tipos-aprovacao";

const MODULO_PAINEL = "aprovacoes-painel";

/*
 * Duas camadas, na ordem: acesso ao módulo do painel (permissão comum
 * do portal) e depois a capacidade de atender AQUELE tipo de aprovação
 * (portal_aprovacoes_atendentes). Administrador passa pela primeira sem
 * cadastro, mas não pela segunda -- decidir reajuste de alguém exige
 * estar cadastrado como aprovador, de propósito.
 */
export async function requireAtendenteAprovacaoApi(
  tipo: TipoAprovacao
): Promise<
  | { usuario: PortalUsuario; tiposAtendidos: TipoAprovacao[]; negado: null }
  | { usuario: null; tiposAtendidos: null; negado: NextResponse }
> {
  const acesso = await verificarAcessoModuloApi(MODULO_PAINEL);
  if (acesso.negado) return { usuario: null, tiposAtendidos: null, negado: acesso.negado };

  const tiposAtendidos = await listarTiposQueAtende(acesso.usuario.id);

  if (!tiposAtendidos.includes(tipo)) {
    return {
      usuario: null,
      tiposAtendidos: null,
      negado: NextResponse.json(
        {
          ok: false,
          message:
            "Você não está cadastrado como aprovador deste tipo de solicitação — peça ao administrador em Administração → Diretoria → Aprovadores.",
        },
        { status: 403 }
      ),
    };
  }

  return { usuario: acesso.usuario, tiposAtendidos, negado: null };
}

/*
 * Para a fila em si: não nega o acesso, só devolve o que a pessoa
 * atende (lista vazia = vê a tela, com a explicação de que ainda não é
 * aprovadora de nada).
 */
export async function acessoPainelAprovacoes(): Promise<
  | { usuario: PortalUsuario; tiposAtendidos: TipoAprovacao[]; negado: null }
  | { usuario: null; tiposAtendidos: null; negado: NextResponse }
> {
  const acesso = await verificarAcessoModuloApi(MODULO_PAINEL);
  if (acesso.negado) return { usuario: null, tiposAtendidos: null, negado: acesso.negado };

  return {
    usuario: acesso.usuario,
    tiposAtendidos: await listarTiposQueAtende(acesso.usuario.id),
    negado: null,
  };
}
