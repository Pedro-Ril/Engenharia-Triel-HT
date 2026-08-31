import { NextResponse } from "next/server";

import { verificarAcessoModuloApi } from "@/lib/auth/autorizacao";
import { comMetricasApi } from "@/lib/monitoramento/metricas";
import { listarTerminais } from "@/lib/tv/terminais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Versão restrita de GET /api/admin/tv/terminais pra usuários comuns
 * com acesso ao módulo tv-corporativa (ver requireModuloAccess no
 * layout de /tv-corporativa) — só os terminais da própria empresa do
 * usuário (snapshot em portal_tv_terminais.empresa, comparado contra
 * PortalUsuario.codigoEmpresa); admin continua vendo todos, igual ao
 * painel administrativo. Usuário sem empresa cadastrada não vê nada
 * (em vez de acidentalmente ver tudo).
 */
async function handleGET() {
  const acesso = await verificarAcessoModuloApi("tv-corporativa");
  if (acesso.negado) return acesso.negado;

  try {
    if (!acesso.usuario.ehAdministrador && !acesso.usuario.codigoEmpresa) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const terminais = acesso.usuario.ehAdministrador
      ? await listarTerminais()
      : await listarTerminais(acesso.usuario.codigoEmpresa ?? undefined);

    return NextResponse.json({ ok: true, data: terminais });
  } catch (error) {
    console.error("Erro ao listar terminais de TV (restrito):", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os terminais." },
      { status: 500 }
    );
  }
}

export const GET = comMetricasApi("tv-corporativa/terminais", handleGET);
