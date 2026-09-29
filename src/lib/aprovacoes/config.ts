import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

/*
 * Configuração do módulo, linha única (id = 1), mesmo molde de
 * dbo.portal_chamados_config. Hoje só guarda para onde vai o relatório
 * que o solicitante dispara ao fim da solicitação.
 */
/* Com o que o Painel de Aprovações abre: fila por colaborador ou lista por solicitação. */
export type ModoPainel = "colaborador" | "solicitacao";

const MODOS_PAINEL: ModoPainel[] = ["colaborador", "solicitacao"];

export interface ConfigAprovacoes {
  emailRelatorio: string | null;
  urlPublica: string | null;
  modoPainelPadrao: ModoPainel;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function buscarConfigAprovacoes(): Promise<ConfigAprovacoes> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    email_relatorio: string | null;
    url_publica: string | null;
    modo_painel_padrao: string | null;
    atualizado_em: string | null;
    atualizado_por: string | null;
  }>(`
    SELECT
      [email_relatorio],
      [url_publica],
      [modo_painel_padrao],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.portal_aprovacoes_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  return {
    emailRelatorio: row?.email_relatorio ?? null,
    urlPublica: row?.url_publica ?? null,
    modoPainelPadrao: MODOS_PAINEL.includes(row?.modo_painel_padrao as ModoPainel)
      ? (row?.modo_painel_padrao as ModoPainel)
      : "colaborador",
    atualizadoEm: row?.atualizado_em ?? null,
    atualizadoPor: row?.atualizado_por ?? null,
  };
}

export async function salvarConfigAprovacoes(
  params: {
    emailRelatorio: string | null;
    urlPublica: string | null;
    modoPainelPadrao: ModoPainel;
  },
  atualizadoPor: string
): Promise<ConfigAprovacoes> {
  const email = params.emailRelatorio?.trim() || null;

  if (email && !EMAIL_REGEX.test(email)) {
    throw new ValidationError("Informe um e-mail válido para o relatório.");
  }

  const url = params.urlPublica?.trim().replace(/\/+$/, "") || null;

  if (url && !/^https?:\/\//i.test(url)) {
    throw new ValidationError("A URL pública precisa começar com http:// ou https://.");
  }

  if (!MODOS_PAINEL.includes(params.modoPainelPadrao)) {
    throw new ValidationError("Modo padrão do painel inválido.");
  }

  const pool = await getSqlServerPool();

  await pool
    .request()
    .input("emailRelatorio", sql.NVarChar(200), email)
    .input("urlPublica", sql.NVarChar(300), url)
    .input("modoPainelPadrao", sql.VarChar(20), params.modoPainelPadrao)
    .input("atualizadoPor", sql.NVarChar(200), atualizadoPor)
    .query(`
      UPDATE dbo.portal_aprovacoes_config
      SET [email_relatorio] = @emailRelatorio,
          [url_publica] = @urlPublica,
          [modo_painel_padrao] = @modoPainelPadrao,
          [atualizado_em] = SYSDATETIME(),
          [atualizado_por] = @atualizadoPor
      WHERE [id] = 1;

      IF @@ROWCOUNT = 0
      BEGIN
        INSERT INTO dbo.portal_aprovacoes_config ([id], [email_relatorio], [url_publica], [modo_painel_padrao], [atualizado_em], [atualizado_por])
        VALUES (1, @emailRelatorio, @urlPublica, @modoPainelPadrao, SYSDATETIME(), @atualizadoPor);
      END;
    `);

  return buscarConfigAprovacoes();
}

/*
 * Atrás do proxy reverso que não repassa o Host original, request.url
 * vira "http://localhost:3000" e o link do e-mail sai inutilizável fora
 * do servidor. Mesmo tratamento de origemPublicaEfetivaChamados.
 */
export async function origemPublicaEfetivaAprovacoes(request: Request): Promise<string> {
  const config = await buscarConfigAprovacoes();
  return config.urlPublica || new URL(request.url).origin;
}
