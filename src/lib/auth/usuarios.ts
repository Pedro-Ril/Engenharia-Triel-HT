import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import type { ActiveDirectoryUser } from "./ldap";

export interface PortalUsuario {
  id: string;
  samAccountName: string;
  nomeExibicao: string;
  email: string | null;
  codigoEmpresa: string | null;
  ehAdministrador: boolean;
  ativo: boolean;
  sessaoInvalidadaEm: string | null;
  ultimoLoginEm: string | null;
}

interface PortalUsuarioRow {
  id: string;
  sam_account_name: string;
  nome_exibicao: string;
  email: string | null;
  codigo_empresa: string | null;
  eh_administrador: boolean;
  ativo: boolean;
  sessao_invalidada_em: string | null;
  ultimo_login_em: string | null;
}

function mapRow(row: PortalUsuarioRow): PortalUsuario {
  return {
    id: row.id,
    samAccountName: row.sam_account_name,
    nomeExibicao: row.nome_exibicao,
    email: row.email,
    codigoEmpresa: row.codigo_empresa,
    ehAdministrador: row.eh_administrador,
    ativo: row.ativo,
    sessaoInvalidadaEm: row.sessao_invalidada_em,
    ultimoLoginEm: row.ultimo_login_em,
  };
}

const usuarioSelectColumns = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [sam_account_name],
  [nome_exibicao],
  [email],
  [codigo_empresa],
  CAST([eh_administrador] AS BIT) AS [eh_administrador],
  CAST([ativo] AS BIT) AS [ativo],
  CONVERT(VARCHAR(33), [sessao_invalidada_em], 126) AS [sessao_invalidada_em],
  CONVERT(VARCHAR(33), [ultimo_login_em], 126) AS [ultimo_login_em]
`;

/*
 * Cria ou atualiza o cadastro local do usuário a cada login
 * bem-sucedido no AD. `eh_administrador` é recalculado toda
 * vez a partir do grupo do AD (ver authenticateWithActiveDirectory
 * em ./ldap.ts) — não é um botão manual na UI. `ativo` nunca é
 * tocado aqui: se um admin desativou o usuário, o login no AD
 * continuar válido não reabre acesso sozinho (ver checagem em
 * src/app/api/auth/login/route.ts).
 */
export async function upsertUsuarioLogin(
  diretorioUsuario: ActiveDirectoryUser
): Promise<PortalUsuario> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  const ehAdministrador = diretorioUsuario.ehAdministrador;

  request.input(
    "samAccountName",
    sql.NVarChar(150),
    diretorioUsuario.samAccountName.toLowerCase()
  );

  request.input(
    "nomeExibicao",
    sql.NVarChar(200),
    diretorioUsuario.nomeExibicao
  );

  request.input("email", sql.NVarChar(256), diretorioUsuario.email);

  request.input("ehAdministrador", sql.Bit, ehAdministrador);

  const result = await request.query<PortalUsuarioRow>(`
    SET XACT_ABORT ON;

    MERGE INTO dbo.portal_usuarios AS destino
    USING (SELECT @samAccountName AS sam_account_name) AS origem
      ON destino.sam_account_name = origem.sam_account_name
    WHEN MATCHED THEN
      UPDATE SET
        [nome_exibicao] = @nomeExibicao,
        [email] = @email,
        [eh_administrador] = @ehAdministrador,
        [ultimo_login_em] = SYSDATETIME()
    WHEN NOT MATCHED THEN
      INSERT
        ([sam_account_name], [nome_exibicao], [email], [eh_administrador], [ultimo_login_em])
      VALUES
        (@samAccountName, @nomeExibicao, @email, @ehAdministrador, SYSDATETIME())
    OUTPUT
      CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
      INSERTED.[sam_account_name],
      INSERTED.[nome_exibicao],
      INSERTED.[email],
      INSERTED.[codigo_empresa],
      CAST(INSERTED.[eh_administrador] AS BIT) AS [eh_administrador],
      CAST(INSERTED.[ativo] AS BIT) AS [ativo],
      CONVERT(VARCHAR(33), INSERTED.[sessao_invalidada_em], 126) AS [sessao_invalidada_em],
      CONVERT(VARCHAR(33), INSERTED.[ultimo_login_em], 126) AS [ultimo_login_em];
  `);

  return mapRow(result.recordset[0]);
}

export async function getUsuarioBySamAccountName(
  samAccountName: string
): Promise<PortalUsuario | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input(
    "samAccountName",
    sql.NVarChar(150),
    samAccountName.toLowerCase()
  );

  const result = await request.query<PortalUsuarioRow>(`
    SELECT ${usuarioSelectColumns}
    FROM dbo.portal_usuarios
    WHERE [sam_account_name] = @samAccountName;
  `);

  const row = result.recordset[0];

  return row ? mapRow(row) : null;
}
