import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import type { ActiveDirectoryUser } from "./ldap";

export interface PortalUsuario {
  id: string;
  samAccountName: string;
  nomeExibicao: string;
  email: string | null;
  codigoEmpresa: string | null;
  departamento: string | null;
  ehAdministrador: boolean;
  ativo: boolean;
  sessaoInvalidadaEm: string | null;
  ultimoLoginEm: string | null;
  ultimaAtividadeEm: string | null;
}

interface PortalUsuarioRow {
  id: string;
  sam_account_name: string;
  nome_exibicao: string;
  email: string | null;
  codigo_empresa: string | null;
  departamento: string | null;
  eh_administrador: boolean;
  ativo: boolean;
  sessao_invalidada_em: string | null;
  ultimo_login_em: string | null;
  ultima_atividade_em: string | null;
}

function mapRow(row: PortalUsuarioRow): PortalUsuario {
  return {
    id: row.id,
    samAccountName: row.sam_account_name,
    nomeExibicao: row.nome_exibicao,
    email: row.email,
    codigoEmpresa: row.codigo_empresa,
    departamento: row.departamento,
    ehAdministrador: row.eh_administrador,
    ativo: row.ativo,
    sessaoInvalidadaEm: row.sessao_invalidada_em,
    ultimoLoginEm: row.ultimo_login_em,
    ultimaAtividadeEm: row.ultima_atividade_em,
  };
}

const usuarioSelectColumns = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [sam_account_name],
  [nome_exibicao],
  [email],
  [codigo_empresa],
  [departamento],
  CAST([eh_administrador] AS BIT) AS [eh_administrador],
  CAST([ativo] AS BIT) AS [ativo],
  CONVERT(VARCHAR(33), [sessao_invalidada_em], 126) AS [sessao_invalidada_em],
  CONVERT(VARCHAR(33), [ultimo_login_em], 126) AS [ultimo_login_em],
  CONVERT(VARCHAR(33), [ultima_atividade_em], 126) AS [ultima_atividade_em]
`;

/*
 * Cria ou atualiza o cadastro local do usuário a cada login
 * bem-sucedido no AD. `eh_administrador` e `departamento` são
 * recalculados toda vez a partir dos grupos do AD (ver
 * authenticateWithActiveDirectory em ./ldap.ts) — nunca um botão
 * manual na UI. `ativo` nunca é tocado aqui: se um admin
 * desativou o usuário, o login no AD continuar válido não reabre
 * acesso sozinho (ver checagem em src/app/api/auth/login/route.ts).
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

  request.input("departamento", sql.NVarChar(200), diretorioUsuario.departamento);

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
        [departamento] = @departamento,
        [ultimo_login_em] = SYSDATETIME()
    WHEN NOT MATCHED THEN
      INSERT
        ([sam_account_name], [nome_exibicao], [email], [eh_administrador], [departamento], [ultimo_login_em])
      VALUES
        (@samAccountName, @nomeExibicao, @email, @ehAdministrador, @departamento, SYSDATETIME())
    OUTPUT
      CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
      INSERTED.[sam_account_name],
      INSERTED.[nome_exibicao],
      INSERTED.[email],
      INSERTED.[codigo_empresa],
      INSERTED.[departamento],
      CAST(INSERTED.[eh_administrador] AS BIT) AS [eh_administrador],
      CAST(INSERTED.[ativo] AS BIT) AS [ativo],
      CONVERT(VARCHAR(33), INSERTED.[sessao_invalidada_em], 126) AS [sessao_invalidada_em],
      CONVERT(VARCHAR(33), INSERTED.[ultimo_login_em], 126) AS [ultimo_login_em],
      CONVERT(VARCHAR(33), INSERTED.[ultima_atividade_em], 126) AS [ultima_atividade_em];
  `);

  return mapRow(result.recordset[0]);
}

export interface ResultadoUpsertImportado {
  usuario: PortalUsuario;
  criado: boolean;
}

/*
 * Usado pela importação manual de usuários do AD (ver
 * src/lib/auth/importacao-usuarios.ts) — cria o cadastro
 * ANTES do primeiro login, para o admin já poder liberar
 * acesso. Diferente de upsertUsuarioLogin: nunca toca
 * `ultimo_login_em` (a pessoa ainda não logou) nem
 * `ativo`/`sessao_invalidada_em` de quem já existia.
 */
export async function upsertUsuarioImportado(
  diretorioUsuario: Pick<
    ActiveDirectoryUser,
    "samAccountName" | "nomeExibicao" | "email" | "ehAdministrador" | "departamento"
  >
): Promise<ResultadoUpsertImportado> {
  const pool = await getSqlServerPool();
  const request = pool.request();

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
  request.input("ehAdministrador", sql.Bit, diretorioUsuario.ehAdministrador);
  request.input("departamento", sql.NVarChar(200), diretorioUsuario.departamento);

  const result = await request.query<PortalUsuarioRow & { acao: string }>(`
    SET XACT_ABORT ON;

    MERGE INTO dbo.portal_usuarios AS destino
    USING (SELECT @samAccountName AS sam_account_name) AS origem
      ON destino.sam_account_name = origem.sam_account_name
    WHEN MATCHED THEN
      UPDATE SET
        [nome_exibicao] = @nomeExibicao,
        [email] = @email,
        [eh_administrador] = @ehAdministrador,
        [departamento] = @departamento
    WHEN NOT MATCHED THEN
      INSERT
        ([sam_account_name], [nome_exibicao], [email], [eh_administrador], [departamento])
      VALUES
        (@samAccountName, @nomeExibicao, @email, @ehAdministrador, @departamento)
    OUTPUT
      $action AS [acao],
      CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
      INSERTED.[sam_account_name],
      INSERTED.[nome_exibicao],
      INSERTED.[email],
      INSERTED.[codigo_empresa],
      INSERTED.[departamento],
      CAST(INSERTED.[eh_administrador] AS BIT) AS [eh_administrador],
      CAST(INSERTED.[ativo] AS BIT) AS [ativo],
      CONVERT(VARCHAR(33), INSERTED.[sessao_invalidada_em], 126) AS [sessao_invalidada_em],
      CONVERT(VARCHAR(33), INSERTED.[ultimo_login_em], 126) AS [ultimo_login_em],
      CONVERT(VARCHAR(33), INSERTED.[ultima_atividade_em], 126) AS [ultima_atividade_em];
  `);

  const row = result.recordset[0];

  return {
    usuario: mapRow(row),
    criado: row.acao === "INSERT",
  };
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

/*
 * Usado por "Atualizar Usuário AD" (ver
 * src/lib/auth/importacao-usuarios.ts) para saber quem já está
 * cadastrado antes de checar cada um no diretório — não filtra
 * por `ativo`, um usuário desativado também deve ter os dados
 * atualizados (caso seja reativado depois).
 */
export async function listarTodosSamAccountNames(): Promise<string[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{ sam_account_name: string }>(`
    SELECT [sam_account_name] FROM dbo.portal_usuarios;
  `);

  return result.recordset.map((row) => row.sam_account_name);
}

/*
 * Atualiza só os campos espelhados do AD para um usuário que já
 * existe no portal — diferente de upsertUsuarioLogin, nunca
 * mexe em `ultimo_login_em` (a pessoa não logou, só um admin
 * pediu pra atualizar os dados) nem cria a linha se ela não
 * existir (isso é papel do "Importar do AD"). Devolve false se
 * o sam_account_name não corresponder a nenhum usuário.
 */
export async function atualizarDadosUsuarioDoAd(
  samAccountName: string,
  dados: Pick<ActiveDirectoryUser, "nomeExibicao" | "email" | "ehAdministrador" | "departamento">
): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("samAccountName", sql.NVarChar(150), samAccountName.toLowerCase());
  request.input("nomeExibicao", sql.NVarChar(200), dados.nomeExibicao);
  request.input("email", sql.NVarChar(256), dados.email);
  request.input("ehAdministrador", sql.Bit, dados.ehAdministrador);
  request.input("departamento", sql.NVarChar(200), dados.departamento);

  const result = await request.query(`
    UPDATE dbo.portal_usuarios
    SET
      [nome_exibicao] = @nomeExibicao,
      [email] = @email,
      [eh_administrador] = @ehAdministrador,
      [departamento] = @departamento
    WHERE [sam_account_name] = @samAccountName;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/*
 * Chamada em toda requisição autenticada (ver validarSessaoUsuario
 * em autorizacao.ts) pra alimentar o "usuários logados agora" da
 * tela de Manutenção. O próprio WHERE já throttla a escrita (só
 * grava se fizer mais de 60s da última vez) — evita um UPDATE por
 * requisição sem precisar ler o valor atual antes.
 */
export async function registrarAtividadeSemFalhar(usuarioId: string): Promise<void> {
  try {
    const pool = await getSqlServerPool();

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, usuarioId)
      .query(`
        UPDATE dbo.portal_usuarios
        SET [ultima_atividade_em] = SYSDATETIME()
        WHERE [id] = @id
          AND ([ultima_atividade_em] IS NULL OR [ultima_atividade_em] < DATEADD(SECOND, -60, SYSDATETIME()));
      `);
  } catch (error) {
    console.error("Erro ao registrar atividade do usuário:", error);
  }
}
