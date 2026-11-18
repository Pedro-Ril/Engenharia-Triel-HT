import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import type { ConfiguracaoNvidia } from "@/modules/workstations-nvidia/types/workstationsNvidia.types";

export const MARCADOR_COMPUTADOR = "{computador}";
export const CAMINHO_ESTADO_PADRAO = String.raw`\\{computador}\C$\ProgramData\TI\NvidiaProfile\estado.json`;
export const NOME_ARQUIVO_PERFIL = "perfil-padrao.nip";

interface ConfiguracaoRow {
  caminho_estado: string;
  pasta_perfil: string | null;
  coleta_ativa: boolean;
  intervalo_minutos: number;
  horas_sem_contato: number;
  emails_alerta: string | null;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

export async function buscarConfiguracaoNvidia(): Promise<ConfiguracaoNvidia> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<ConfiguracaoRow>(`
    SELECT
      [caminho_estado],
      [pasta_perfil],
      [coleta_ativa],
      [intervalo_minutos],
      [horas_sem_contato],
      [emails_alerta],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em],
      [atualizado_por]
    FROM dbo.portal_ws_nvidia_config
    WHERE [id] = 1;
  `);

  const row = result.recordset[0];

  if (!row) {
    return {
      caminhoEstado: CAMINHO_ESTADO_PADRAO,
      pastaPerfil: null,
      coletaAtiva: true,
      intervaloMinutos: 30,
      horasSemContato: 24,
      emailsAlerta: null,
      atualizadoEm: null,
      atualizadoPor: null,
    };
  }

  return {
    caminhoEstado: row.caminho_estado,
    pastaPerfil: row.pasta_perfil,
    coletaAtiva: row.coleta_ativa,
    intervaloMinutos: row.intervalo_minutos,
    horasSemContato: row.horas_sem_contato,
    emailsAlerta: row.emails_alerta,
    atualizadoEm: row.atualizado_em,
    atualizadoPor: row.atualizado_por,
  };
}

/* Aceita vírgula, ponto e vírgula, espaço ou quebra de linha entre os endereços. */
export function separarEmails(texto: string | null): string[] {
  if (!texto) return [];
  return texto
    .split(/[\s,;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}

const padraoEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SalvarConfiguracaoNvidiaParams {
  caminhoEstado: string;
  pastaPerfil: string | null;
  coletaAtiva: boolean;
  intervaloMinutos: number;
  horasSemContato: number;
  emailsAlerta: string | null;
  atualizadoPor: string;
}

export async function salvarConfiguracaoNvidia(
  params: SalvarConfiguracaoNvidiaParams
): Promise<ConfiguracaoNvidia> {
  if (!params.caminhoEstado.includes(MARCADOR_COMPUTADOR)) {
    throw new ValidationError(
      `O caminho do estado.json precisa ter o marcador ${MARCADOR_COMPUTADOR}, que é trocado pelo nome de cada máquina.`
    );
  }

  if (params.intervaloMinutos < 5 || params.intervaloMinutos > 1440) {
    throw new ValidationError("O intervalo da coleta deve ficar entre 5 e 1440 minutos.");
  }

  if (params.horasSemContato < 1 || params.horasSemContato > 720) {
    throw new ValidationError("As horas sem contato para alertar devem ficar entre 1 e 720.");
  }

  const emails = separarEmails(params.emailsAlerta);
  const invalido = emails.find((email) => !padraoEmail.test(email));
  if (invalido) {
    throw new ValidationError(`O e-mail "${invalido}" não parece válido.`);
  }

  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("caminhoEstado", sql.NVarChar(400), params.caminhoEstado);
  request.input("pastaPerfil", sql.NVarChar(400), params.pastaPerfil);
  request.input("coletaAtiva", sql.Bit, params.coletaAtiva);
  request.input("intervaloMinutos", sql.Int, params.intervaloMinutos);
  request.input("horasSemContato", sql.Int, params.horasSemContato);
  request.input("emailsAlerta", sql.NVarChar(1000), emails.length > 0 ? emails.join("; ") : null);
  request.input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor);

  await request.query(`
    MERGE dbo.portal_ws_nvidia_config AS destino
    USING (SELECT 1 AS [id]) AS origem
      ON destino.[id] = origem.[id]
    WHEN MATCHED THEN UPDATE SET
      [caminho_estado] = @caminhoEstado,
      [pasta_perfil] = @pastaPerfil,
      [coleta_ativa] = @coletaAtiva,
      [intervalo_minutos] = @intervaloMinutos,
      [horas_sem_contato] = @horasSemContato,
      [emails_alerta] = @emailsAlerta,
      [atualizado_em] = SYSDATETIME(),
      [atualizado_por] = @atualizadoPor
    WHEN NOT MATCHED THEN INSERT
      ([id], [caminho_estado], [pasta_perfil], [coleta_ativa], [intervalo_minutos],
       [horas_sem_contato], [emails_alerta], [atualizado_por])
      VALUES (1, @caminhoEstado, @pastaPerfil, @coletaAtiva, @intervaloMinutos,
       @horasSemContato, @emailsAlerta, @atualizadoPor);
  `);

  return buscarConfiguracaoNvidia();
}
