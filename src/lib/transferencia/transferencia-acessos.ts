import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

export type TipoAcessoTransferencia = "pagina" | "download_arquivo" | "download_zip";

interface RegistrarAcessoParams {
  transferenciaId: string;
  tipo: TipoAcessoTransferencia;
  arquivoNomeOriginal?: string | null;
  usuarioId?: string | null;
  usuarioNomeSnapshot?: string | null;
  ip?: string | null;
}

/*
 * Telemetria pro dono acompanhar quem acessou/baixou o que enviou (ver
 * botão "Informações" em Minhas transferências) — falha ao registrar
 * não pode impedir a página pública de carregar nem o download de
 * funcionar, por isso o erro só é logado, nunca propagado.
 */
export async function registrarAcessoTransferencia(params: RegistrarAcessoParams): Promise<void> {
  try {
    const pool = await getSqlServerPool();
    const request = pool.request();

    request.input("transferenciaId", sql.UniqueIdentifier, params.transferenciaId);
    request.input("tipo", sql.VarChar(20), params.tipo);
    request.input("arquivoNomeOriginal", sql.NVarChar(260), params.arquivoNomeOriginal ?? null);
    request.input("usuarioId", sql.UniqueIdentifier, params.usuarioId ?? null);
    request.input("usuarioNomeSnapshot", sql.NVarChar(150), params.usuarioNomeSnapshot ?? null);
    request.input("ip", sql.VarChar(64), params.ip ?? null);

    await request.query(`
      INSERT INTO dbo.portal_transferencia_acessos
        ([transferencia_id], [tipo], [arquivo_nome_original], [usuario_id], [usuario_nome_snapshot], [ip])
      VALUES
        (@transferenciaId, @tipo, @arquivoNomeOriginal, @usuarioId, @usuarioNomeSnapshot, @ip);
    `);
  } catch (error) {
    console.error("Erro ao registrar acesso de transferência:", error);
  }
}

export interface AcessoTransferencia {
  id: string;
  tipo: TipoAcessoTransferencia;
  arquivoNomeOriginal: string | null;
  usuarioNomeSnapshot: string | null;
  ip: string | null;
  criadoEm: string;
}

export interface ResumoAcessosTransferencia {
  totalPagina: number;
  totalDownloads: number;
  eventos: AcessoTransferencia[];
}

/*
 * Usada pelo botão "Informações" em Minhas transferências — a
 * checagem de posse (dono ou admin) é feita por quem chama, na rota
 * de API. Os totais somam TODOS os eventos já registrados (contagem
 * de verdade, não só dos exibidos); a lista detalhada mostra só os
 * 200 mais recentes (mesmo espírito do TOP 50 em
 * listarHistoricoDoUsuario), pra não deixar o painel gigante num link
 * acessado repetidamente.
 */
export async function listarAcessosTransferencia(
  transferenciaId: string
): Promise<ResumoAcessosTransferencia> {
  const pool = await getSqlServerPool();

  const totaisRequest = pool.request();
  totaisRequest.input("transferenciaId", sql.UniqueIdentifier, transferenciaId);
  const totaisResult = await totaisRequest.query<{ tipo: TipoAcessoTransferencia; total: number }>(`
    SELECT [tipo], COUNT(*) AS [total]
    FROM dbo.portal_transferencia_acessos
    WHERE [transferencia_id] = @transferenciaId
    GROUP BY [tipo];
  `);

  const eventosRequest = pool.request();
  eventosRequest.input("transferenciaId", sql.UniqueIdentifier, transferenciaId);
  const eventosResult = await eventosRequest.query<{
    id: string;
    tipo: TipoAcessoTransferencia;
    arquivo_nome_original: string | null;
    usuario_nome_snapshot: string | null;
    ip: string | null;
    criado_em: string;
  }>(`
    SELECT TOP (200)
      CONVERT(VARCHAR(36), [id]) AS [id],
      [tipo],
      [arquivo_nome_original],
      [usuario_nome_snapshot],
      [ip],
      CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
    FROM dbo.portal_transferencia_acessos
    WHERE [transferencia_id] = @transferenciaId
    ORDER BY [criado_em] DESC;
  `);

  let totalPagina = 0;
  let totalDownloads = 0;
  for (const linha of totaisResult.recordset) {
    if (linha.tipo === "pagina") totalPagina = linha.total;
    else totalDownloads += linha.total;
  }

  return {
    totalPagina,
    totalDownloads,
    eventos: eventosResult.recordset.map((row) => ({
      id: row.id,
      tipo: row.tipo,
      arquivoNomeOriginal: row.arquivo_nome_original,
      usuarioNomeSnapshot: row.usuario_nome_snapshot,
      ip: row.ip,
      criadoEm: row.criado_em,
    })),
  };
}
