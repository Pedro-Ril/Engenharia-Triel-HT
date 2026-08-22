import "server-only";

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { getUsuarioAutenticado } from "@/lib/auth/autorizacao";
import type { PortalUsuario } from "@/lib/auth/usuarios";

/*
 * Atendente de chamados é um papel independente de
 * eh_administrador (ver db/schema/0011_chamados.sql e o plano
 * de implementação) — alguém pode atender chamados sem ser
 * administrador do portal, e vice-versa administradores sempre
 * atendem tudo, em qualquer setor, sem precisar de cadastro em
 * portal_chamados_atendentes.
 */

export interface AcessoAtendimento {
  usuario: PortalUsuario;
  /* null = administrador — sem restrição de setor. */
  setorIds: string[] | null;
}

async function buscarSetoresAtendidos(usuarioId: string): Promise<string[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);

  const result = await request.query<{ setor_id: string }>(`
    SELECT CONVERT(VARCHAR(36), [setor_id]) AS [setor_id]
    FROM dbo.portal_chamados_atendentes
    WHERE [usuario_id] = @usuarioId;
  `);

  return result.recordset.map((row) => row.setor_id);
}

/*
 * Usado nas rotas que precisam saber EXATAMENTE quais setores a
 * pessoa pode atender (a fila de atendimento, por exemplo).
 * `null` sinaliza "sem restrição" (administrador).
 */
export async function getSetoresQueAtende(
  usuario: PortalUsuario | null
): Promise<string[] | null> {
  if (!usuario) return [];
  if (usuario.ehAdministrador) return null;

  return buscarSetoresAtendidos(usuario.id);
}

/* Equivalente a requireAdmin, mas para o papel de atendente de chamados. */
export async function requireAtendenteChamados(): Promise<AcessoAtendimento> {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    redirect("/login?next=/chamados/atender");
  }

  const setorIds = await getSetoresQueAtende(usuario);

  if (setorIds !== null && setorIds.length === 0) {
    redirect("/acesso-negado");
  }

  return { usuario, setorIds };
}

export interface AcessoChamadoDetalhe {
  podeVer: boolean;
  /* Também controla quem vê notas internas e os controles de status/prioridade/atendente. */
  ehAtendente: boolean;
}

/*
 * Checagem de acesso ao detalhe/thread de UM chamado — usada
 * tanto pela página `/chamados/[numero]` (Server Component)
 * quanto pelas rotas de API GET/POST de mensagens. `nomeConfirmado`
 * só importa quando o chamado foi aberto sem login (ver
 * /chamados/consultar).
 */
export async function verificarAcessoChamado(
  chamado: {
    setorId: string;
    solicitanteUsuarioId: string | null;
    solicitanteNome: string;
  },
  usuario: PortalUsuario | null,
  nomeConfirmado?: string | null
): Promise<AcessoChamadoDetalhe> {
  const setoresAtendidos = await getSetoresQueAtende(usuario);
  const ehAtendente =
    setoresAtendidos === null || setoresAtendidos.includes(chamado.setorId);

  const ehDono = usuario !== null && chamado.solicitanteUsuarioId === usuario.id;

  const nomeBate =
    !chamado.solicitanteUsuarioId &&
    Boolean(nomeConfirmado) &&
    nomeConfirmado!.trim().toLowerCase() === chamado.solicitanteNome.trim().toLowerCase();

  return { podeVer: ehDono || ehAtendente || nomeBate, ehAtendente };
}

/* Equivalente a requireAdminApi, para as rotas de API da fila de atendimento. */
export async function requireAtendenteChamadosApi(): Promise<
  | { acesso: AcessoAtendimento; negado: null }
  | { acesso: null; negado: NextResponse }
> {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return {
      acesso: null,
      negado: NextResponse.json(
        { ok: false, message: "É necessário estar autenticado." },
        { status: 401 }
      ),
    };
  }

  const setorIds = await getSetoresQueAtende(usuario);

  if (setorIds !== null && setorIds.length === 0) {
    return {
      acesso: null,
      negado: NextResponse.json(
        { ok: false, message: "Você não atende nenhum setor de chamados." },
        { status: 403 }
      ),
    };
  }

  return { acesso: { usuario, setorIds }, negado: null };
}
