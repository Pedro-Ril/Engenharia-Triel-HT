import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import type {
  EventoNvidia,
  PaginaEventosNvidia,
  TipoEventoNvidia,
} from "@/modules/workstations-nvidia/types/workstationsNvidia.types";

export interface NovoEventoNvidia {
  maquinaId: string | null;
  computador: string | null;
  tipo: TipoEventoNvidia;
  descricao: string;
}

export async function registrarEvento(evento: NovoEventoNvidia): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("maquinaId", sql.UniqueIdentifier, evento.maquinaId);
  request.input("computador", sql.NVarChar(100), evento.computador);
  request.input("tipo", sql.NVarChar(40), evento.tipo);
  request.input("descricao", sql.NVarChar(1000), evento.descricao.slice(0, 1000));

  await request.query(`
    INSERT INTO dbo.portal_ws_nvidia_eventos ([maquina_id], [computador], [tipo], [descricao])
    VALUES (@maquinaId, @computador, @tipo, @descricao);
  `);
}

/* Histórico nunca deve derrubar a coleta nem a ação do admin. */
export async function registrarEventoSemFalhar(evento: NovoEventoNvidia): Promise<boolean> {
  try {
    await registrarEvento(evento);
    return true;
  } catch (error) {
    console.error("Erro ao registrar evento de Workstations NVIDIA:", error);
    return false;
  }
}

interface EventoRow {
  id: string;
  maquina_id: string | null;
  computador: string | null;
  tipo: TipoEventoNvidia;
  descricao: string;
  ocorrido_em: string;
}

export const TAMANHO_PAGINA_EVENTOS = 25;

export async function listarEventos(params: {
  maquinaId: string | null;
  pagina: number;
}): Promise<PaginaEventosNvidia> {
  const pagina = Math.max(1, params.pagina);
  const pool = await getSqlServerPool();
  const filtro = params.maquinaId ? "WHERE [maquina_id] = @maquinaId" : "";

  const totalRequest = pool.request();
  if (params.maquinaId) totalRequest.input("maquinaId", sql.UniqueIdentifier, params.maquinaId);
  const totalResult = await totalRequest.query<{ total: number }>(`
    SELECT COUNT(*) AS [total] FROM dbo.portal_ws_nvidia_eventos ${filtro};
  `);

  const request = pool.request();
  if (params.maquinaId) request.input("maquinaId", sql.UniqueIdentifier, params.maquinaId);
  request.input("offset", sql.Int, (pagina - 1) * TAMANHO_PAGINA_EVENTOS);
  request.input("tamanho", sql.Int, TAMANHO_PAGINA_EVENTOS);

  const result = await request.query<EventoRow>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      CONVERT(VARCHAR(36), [maquina_id]) AS [maquina_id],
      [computador],
      [tipo],
      [descricao],
      CONVERT(VARCHAR(33), [ocorrido_em], 126) AS [ocorrido_em]
    FROM dbo.portal_ws_nvidia_eventos
    ${filtro}
    ORDER BY [ocorrido_em] DESC
    OFFSET @offset ROWS FETCH NEXT @tamanho ROWS ONLY;
  `);

  const eventos: EventoNvidia[] = result.recordset.map((row) => ({
    id: row.id.toLowerCase(),
    maquinaId: row.maquina_id ? row.maquina_id.toLowerCase() : null,
    computador: row.computador,
    tipo: row.tipo,
    descricao: row.descricao,
    ocorridoEm: row.ocorrido_em,
  }));

  return {
    eventos,
    total: totalResult.recordset[0]?.total ?? 0,
    pagina,
    tamanhoPagina: TAMANHO_PAGINA_EVENTOS,
  };
}
