import "server-only";

import { NextResponse } from "next/server";

import { getUsuarioAutenticado, podeAcessarModulo } from "@/lib/auth/autorizacao";
import type { PortalUsuario } from "@/lib/auth/usuarios";

/*
 * As 4 rotas compartilhadas (buscar, validar-dxf, desenho-pdf,
 * dxf-conteudo) servem tanto a tela Agro quanto a VE — quem tem acesso
 * a QUALQUER uma das duas pode chamá-las. As duas rotas de exportação
 * (exportar-agro/exportar-ve) são gated individualmente por módulo, não
 * usam este helper.
 */
export async function verificarAcessoIntegraLantekApi(): Promise<
  | { usuario: PortalUsuario; negado: null }
  | { usuario: null; negado: NextResponse }
> {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return {
      usuario: null,
      negado: NextResponse.json({ error: "É necessário estar autenticado." }, { status: 401 }),
    };
  }

  if (usuario.ehAdministrador) {
    return { usuario, negado: null };
  }

  const [temAgro, temVe] = await Promise.all([
    podeAcessarModulo(usuario.id, "integra-lantek-agro"),
    podeAcessarModulo(usuario.id, "integra-lantek-ve"),
  ]);

  if (!temAgro && !temVe) {
    return {
      usuario: null,
      negado: NextResponse.json({ error: "Você não tem acesso a este recurso." }, { status: 403 }),
    };
  }

  return { usuario, negado: null };
}
