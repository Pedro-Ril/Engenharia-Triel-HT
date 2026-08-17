import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { registrarAcessoModuloSemFalhar } from "./acesso-modulo";
import { getSessionUsuario } from "./session";
import { getUsuarioBySamAccountName } from "./usuarios";
import type { PortalUsuario } from "./usuarios";

export interface ModuloPermitido {
  id: string;
  chave: string;
  nome: string;
  path: string;
  icone: string | null;
  publicoSemLogin: boolean;
  publicoAutenticado: boolean;
  emDesenvolvimento: boolean;
}

export interface SetorComModulos {
  id: string;
  chave: string;
  nome: string;
  icone: string | null;
  ordem: number;
  modulos: ModuloPermitido[];
}

export interface ModuloComStatusAcesso {
  id: string;
  chave: string;
  nome: string;
  path: string;
  icone: string | null;
  temAcesso: boolean;
}

export interface SetorComStatusAcesso {
  id: string;
  chave: string;
  nome: string;
  icone: string | null;
  ordem: number;
  modulos: ModuloComStatusAcesso[];
}

interface SetorModuloRow {
  setor_id: string;
  setor_chave: string;
  setor_nome: string;
  setor_icone: string | null;
  setor_ordem: number;
  modulo_id: string;
  modulo_chave: string;
  modulo_nome: string;
  modulo_path: string;
  modulo_icone: string | null;
  publico_sem_login: boolean;
  publico_autenticado: boolean;
  em_desenvolvimento: boolean;
}

interface SetorModuloStatusAcessoRow {
  setor_id: string;
  setor_chave: string;
  setor_nome: string;
  setor_icone: string | null;
  setor_ordem: number;
  modulo_id: string;
  modulo_chave: string;
  modulo_nome: string;
  modulo_path: string;
  modulo_icone: string | null;
  tem_acesso: boolean;
}

/*
 * Sessão válida (JWT íntegro) NÃO é o bastante — também
 * confere se o cadastro local ainda existe, está ativo, e se
 * a sessão não foi invalidada manualmente por um admin depois
 * que este token foi emitido (revogação sem precisar esperar
 * o token expirar sozinho). Envolvido em `cache()` para não
 * repetir a mesma consulta quando layout.tsx e a page.tsx
 * chamam isto na mesma renderização (React dedupe por
 * requisição).
 */
export const getUsuarioAutenticado = cache(async (): Promise<
  PortalUsuario | null
> => {
  const sessao = await getSessionUsuario();

  if (!sessao) {
    return null;
  }

  const usuario = await getUsuarioBySamAccountName(sessao.sub);

  if (!usuario || !usuario.ativo) {
    return null;
  }

  if (usuario.sessaoInvalidadaEm) {
    const invalidadaEmSegundos = Math.floor(
      new Date(usuario.sessaoInvalidadaEm).getTime() / 1000
    );

    if (sessao.iat < invalidadaEmSegundos) {
      return null;
    }
  }

  return usuario;
});

/*
 * Só é chamada para usuários não-admin (requireModuloAccess e
 * verificarAcessoModuloApi já liberam admins antes de chegar
 * aqui). Por isso, módulos em_desenvolvimento nunca passam
 * por esta checagem — só administradores podem acessá-los,
 * mesmo que estejam públicos ou com permissão concedida.
 */
export async function podeAcessarModulo(
  usuarioId: string,
  moduloChave: string
): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);
  request.input("moduloChave", sql.VarChar(60), moduloChave);

  const result = await request.query<{ permitido: boolean }>(`
    SELECT CAST(
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM dbo.portal_modulos AS m
          WHERE m.[chave] = @moduloChave
            AND m.[ativo] = 1
            AND m.[em_desenvolvimento] = 0
            AND (m.[publico_autenticado] = 1 OR m.[publico_sem_login] = 1)
        ) THEN 1
        WHEN EXISTS (
          SELECT 1
          FROM dbo.portal_modulos AS m
          INNER JOIN dbo.portal_permissoes AS p
            ON p.[modulo_id] = m.[id]
          WHERE m.[chave] = @moduloChave
            AND m.[ativo] = 1
            AND m.[em_desenvolvimento] = 0
            AND p.[usuario_id] = @usuarioId
        ) THEN 1
        ELSE 0
      END
      AS BIT
    ) AS [permitido];
  `);

  return result.recordset[0]?.permitido ?? false;
}

/*
 * Usado nos layout.tsx dos módulos restritos. Redireciona
 * para /login (sem sessão válida) ou /acesso-negado (sessão
 * válida, mas sem permissão para esta ferramenta específica).
 * Admins (via grupo do AD) sempre passam.
 */
export async function requireModuloAccess(
  moduloChave: string
): Promise<PortalUsuario> {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    redirect(`/login?next=/${moduloChave}`);
  }

  if (usuario.ehAdministrador) {
    await registrarAcessoModuloSemFalhar(usuario.id, moduloChave);
    return usuario;
  }

  const permitido = await podeAcessarModulo(usuario.id, moduloChave);

  if (!permitido) {
    redirect("/acesso-negado");
  }

  await registrarAcessoModuloSemFalhar(usuario.id, moduloChave);

  return usuario;
}

/*
 * Equivalente a requireModuloAccess, mas para rotas de API —
 * essas não podem usar redirect() (é para Server
 * Components/Actions). Devolve uma NextResponse pronta para
 * ser retornada quando o acesso é negado; do contrário,
 * `negado` vem null e a rota segue normalmente. Esta é a
 * segunda camada de defesa: o layout do módulo já bloqueia a
 * navegação pela UI, mas a própria rota confere de novo, caso
 * seja chamada diretamente.
 */
export async function verificarAcessoModuloApi(moduloChave: string): Promise<
  | { usuario: PortalUsuario; negado: null }
  | { usuario: null; negado: NextResponse }
> {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return {
      usuario: null,
      negado: NextResponse.json(
        { ok: false, message: "É necessário estar autenticado." },
        { status: 401 }
      ),
    };
  }

  if (usuario.ehAdministrador) {
    return { usuario, negado: null };
  }

  const permitido = await podeAcessarModulo(usuario.id, moduloChave);

  if (!permitido) {
    return {
      usuario: null,
      negado: NextResponse.json(
        {
          ok: false,
          message: "Você não tem permissão para acessar esta ferramenta.",
        },
        { status: 403 }
      ),
    };
  }

  return { usuario, negado: null };
}

export async function requireAdmin(): Promise<PortalUsuario> {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    redirect("/login?next=/admin/permissoes");
  }

  if (!usuario.ehAdministrador) {
    redirect("/acesso-negado");
  }

  return usuario;
}

/* Equivalente a requireAdmin, para rotas de API (ver verificarAcessoModuloApi). */
export async function requireAdminApi(): Promise<
  | { usuario: PortalUsuario; negado: null }
  | { usuario: null; negado: NextResponse }
> {
  const usuario = await getUsuarioAutenticado();

  if (!usuario) {
    return {
      usuario: null,
      negado: NextResponse.json(
        { ok: false, message: "É necessário estar autenticado." },
        { status: 401 }
      ),
    };
  }

  if (!usuario.ehAdministrador) {
    return {
      usuario: null,
      negado: NextResponse.json(
        { ok: false, message: "Apenas administradores podem acessar isto." },
        { status: 403 }
      ),
    };
  }

  return { usuario, negado: null };
}

/*
 * Base para o menu lateral e para a home: setores + módulos
 * que o usuário atual pode ver. `usuario === null` representa
 * um visitante (sem login) — só enxerga o que for
 * publico_sem_login. Também em `cache()` pelo mesmo motivo
 * acima.
 */
export const getSetoresComModulosPermitidos = cache(async (
  usuario: PortalUsuario | null
): Promise<SetorComModulos[]> => {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuario?.id ?? null);
  request.input("ehAdministrador", sql.Bit, usuario?.ehAdministrador ?? false);
  request.input("autenticado", sql.Bit, usuario !== null);

  const result = await request.query<SetorModuloRow>(`
    SELECT
      s.[id] AS [setor_id],
      s.[chave] AS [setor_chave],
      s.[nome] AS [setor_nome],
      s.[icone] AS [setor_icone],
      s.[ordem] AS [setor_ordem],
      m.[id] AS [modulo_id],
      m.[chave] AS [modulo_chave],
      m.[nome] AS [modulo_nome],
      m.[path] AS [modulo_path],
      m.[icone] AS [modulo_icone],
      CAST(m.[publico_sem_login] AS BIT) AS [publico_sem_login],
      CAST(m.[publico_autenticado] AS BIT) AS [publico_autenticado],
      CAST(m.[em_desenvolvimento] AS BIT) AS [em_desenvolvimento]
    FROM dbo.portal_modulos_setores AS ms
    INNER JOIN dbo.portal_modulos AS m
      ON m.[id] = ms.[modulo_id]
    INNER JOIN dbo.portal_setores AS s
      ON s.[id] = ms.[setor_id]
    WHERE
      m.[ativo] = 1
      AND s.[ativo] = 1
      AND (
        (@ehAdministrador = 1)
        OR (
          m.[em_desenvolvimento] = 0
          AND (
            m.[publico_sem_login] = 1
            OR (@autenticado = 1 AND m.[publico_autenticado] = 1)
            OR EXISTS (
              SELECT 1
              FROM dbo.portal_permissoes AS p
              WHERE p.[modulo_id] = m.[id]
                AND p.[usuario_id] = @usuarioId
            )
          )
        )
      )
    ORDER BY s.[ordem], m.[ordem];
  `);

  const setoresPorId = new Map<string, SetorComModulos>();

  for (const row of result.recordset) {
    let setor = setoresPorId.get(row.setor_id);

    if (!setor) {
      setor = {
        id: row.setor_id,
        chave: row.setor_chave,
        nome: row.setor_nome,
        icone: row.setor_icone,
        ordem: row.setor_ordem,
        modulos: [],
      };
      setoresPorId.set(row.setor_id, setor);
    }

    setor.modulos.push({
      id: row.modulo_id,
      chave: row.modulo_chave,
      nome: row.modulo_nome,
      path: row.modulo_path,
      icone: row.modulo_icone,
      publicoSemLogin: row.publico_sem_login,
      publicoAutenticado: row.publico_autenticado,
      emDesenvolvimento: row.em_desenvolvimento,
    });
  }

  return Array.from(setoresPorId.values());
});

/*
 * Catálogo completo (todos os setores e módulos ativos, não só
 * os liberados) com um sinalizador `temAcesso` por módulo —
 * usado no modal "ver tudo" da home, para o usuário comparar o
 * que tem e o que não tem liberado. Módulos em_desenvolvimento
 * nunca aparecem aqui, nem para quem teria acesso — são
 * exclusivos do admin em outras telas.
 */
export const getTodosSetoresComStatusAcesso = cache(async (
  usuario: PortalUsuario | null
): Promise<SetorComStatusAcesso[]> => {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuario?.id ?? null);
  request.input("ehAdministrador", sql.Bit, usuario?.ehAdministrador ?? false);
  request.input("autenticado", sql.Bit, usuario !== null);

  const result = await request.query<SetorModuloStatusAcessoRow>(`
    SELECT
      s.[id] AS [setor_id],
      s.[chave] AS [setor_chave],
      s.[nome] AS [setor_nome],
      s.[icone] AS [setor_icone],
      s.[ordem] AS [setor_ordem],
      m.[id] AS [modulo_id],
      m.[chave] AS [modulo_chave],
      m.[nome] AS [modulo_nome],
      m.[path] AS [modulo_path],
      m.[icone] AS [modulo_icone],
      CAST(
        CASE
          WHEN @ehAdministrador = 1 THEN 1
          WHEN m.[publico_sem_login] = 1 THEN 1
          WHEN @autenticado = 1 AND m.[publico_autenticado] = 1 THEN 1
          WHEN EXISTS (
            SELECT 1
            FROM dbo.portal_permissoes AS p
            WHERE p.[modulo_id] = m.[id]
              AND p.[usuario_id] = @usuarioId
          ) THEN 1
          ELSE 0
        END
        AS BIT
      ) AS [tem_acesso]
    FROM dbo.portal_modulos_setores AS ms
    INNER JOIN dbo.portal_modulos AS m
      ON m.[id] = ms.[modulo_id]
    INNER JOIN dbo.portal_setores AS s
      ON s.[id] = ms.[setor_id]
    WHERE
      m.[ativo] = 1
      AND s.[ativo] = 1
      AND m.[em_desenvolvimento] = 0
    ORDER BY s.[ordem], m.[ordem];
  `);

  const setoresPorId = new Map<string, SetorComStatusAcesso>();

  for (const row of result.recordset) {
    let setor = setoresPorId.get(row.setor_id);

    if (!setor) {
      setor = {
        id: row.setor_id,
        chave: row.setor_chave,
        nome: row.setor_nome,
        icone: row.setor_icone,
        ordem: row.setor_ordem,
        modulos: [],
      };
      setoresPorId.set(row.setor_id, setor);
    }

    setor.modulos.push({
      id: row.modulo_id,
      chave: row.modulo_chave,
      nome: row.modulo_nome,
      path: row.modulo_path,
      icone: row.modulo_icone,
      temAcesso: row.tem_acesso,
    });
  }

  return Array.from(setoresPorId.values());
});
