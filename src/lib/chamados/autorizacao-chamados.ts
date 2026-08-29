import "server-only";

import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { getUsuarioAutenticado, motivoLoginSuffix } from "@/lib/auth/autorizacao";
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
    redirect(`/login?next=/chamados/atender${await motivoLoginSuffix()}`);
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
  /* Dono real: sessão do solicitante OU nome confirmado corretamente (chamado anônimo). */
  ehDono: boolean;
  /*
   * true quando o acesso foi negado por excesso de tentativas de
   * nome contra este chamado — permite mostrar uma mensagem
   * diferente de "número/nome errados".
   */
  bloqueadoPorTentativas: boolean;
}

const LIMITE_TENTATIVAS_NOME = 8;
const JANELA_TENTATIVAS_MINUTOS = 15;

/*
 * Acesso a um chamado aberto sem login depende de acertar o
 * nome do solicitante — número de chamado é sequencial e nome é
 * baixa entropia, então sem isso alguém poderia tentar vários
 * nomes contra o mesmo chamado até acertar. Só concede acesso
 * (contarTentativasFalhasRecentes) e só grava tentativa
 * (registrarTentativaNome) quando alguém de fato tentou o
 * caminho "nome confirmado" — sessão de dono/atendente nunca
 * passa por aqui.
 */
async function contarTentativasFalhasRecentes(chamadoId: string): Promise<number> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("chamadoId", sql.UniqueIdentifier, chamadoId);
  request.input("minutos", sql.Int, JANELA_TENTATIVAS_MINUTOS);

  const result = await request.query<{ total: number }>(`
    SELECT COUNT(*) AS [total]
    FROM dbo.portal_chamados_tentativas_nome
    WHERE [chamado_id] = @chamadoId
      AND [sucesso] = 0
      AND [tentado_em] >= DATEADD(MINUTE, -@minutos, SYSDATETIME());
  `);

  return result.recordset[0]?.total ?? 0;
}

async function registrarTentativaNome(chamadoId: string, sucesso: boolean): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();

    request.input("chamadoId", sql.UniqueIdentifier, chamadoId);
    request.input("sucesso", sql.Bit, sucesso);

    await request.query(`
      INSERT INTO dbo.portal_chamados_tentativas_nome ([chamado_id], [sucesso])
      VALUES (@chamadoId, @sucesso);
    `);
  } catch (error) {
    console.error("Erro ao registrar tentativa de acesso por nome:", error);
  }
}

/*
 * Checagem de acesso ao detalhe/thread de UM chamado — usada
 * tanto pela página `/chamados/[numero]` (Server Component)
 * quanto pelas rotas de API GET/POST de mensagens e pelas ações
 * (aceitar/reabrir/etc, via carregarContextoAcao). `nomeConfirmado`
 * só importa quando o chamado foi aberto sem login (ver
 * /chamados/consultar).
 */
export async function verificarAcessoChamado(
  chamado: {
    id: string;
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

  const ehDonoPorSessao = usuario !== null && chamado.solicitanteUsuarioId === usuario.id;

  const tentandoPorNome =
    !chamado.solicitanteUsuarioId && !ehDonoPorSessao && !ehAtendente && Boolean(nomeConfirmado);

  if (!tentandoPorNome) {
    const ehDono = ehDonoPorSessao;
    return { podeVer: ehDono || ehAtendente, ehAtendente, ehDono, bloqueadoPorTentativas: false };
  }

  const falhasRecentes = await contarTentativasFalhasRecentes(chamado.id);

  if (falhasRecentes >= LIMITE_TENTATIVAS_NOME) {
    return { podeVer: false, ehAtendente: false, ehDono: false, bloqueadoPorTentativas: true };
  }

  const nomeBate =
    nomeConfirmado!.trim().toLowerCase() === chamado.solicitanteNome.trim().toLowerCase();

  await registrarTentativaNome(chamado.id, nomeBate);

  return { podeVer: nomeBate, ehAtendente: false, ehDono: nomeBate, bloqueadoPorTentativas: false };
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
