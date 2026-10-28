import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

/*
 * Registro do "Roteiro continua válido" (Cadastro de Roteiro): quem
 * decidiu que a revisão nova do 3DX não muda o roteiro, quando, e o
 * comentário da revisão naquele momento. O ERP em si só recebe a
 * revisão nova nas operações -- a decisão fica registrada aqui.
 */

export interface DadosValidacaoRevisao {
  codItem: string;
  revisaoAnterior: string;
  revisaoNova: string;
  comentarioRevisao: string | null;
  operacoes: number;
}

export async function registrarValidacaoRevisao(
  dados: DadosValidacaoRevisao,
  usuario: { id: string; nomeExibicao: string }
): Promise<void> {
  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("codItem", sql.NVarChar(50), dados.codItem)
    .input("revisaoAnterior", sql.NVarChar(100), dados.revisaoAnterior)
    .input("revisaoNova", sql.NVarChar(20), dados.revisaoNova)
    .input("comentario", sql.NVarChar(2000), dados.comentarioRevisao)
    .input("operacoes", sql.Int, dados.operacoes)
    .input("usuarioId", sql.UniqueIdentifier, usuario.id)
    .input("usuarioNome", sql.NVarChar(200), usuario.nomeExibicao)
    .query(`
      INSERT INTO dbo.portal_roteiro_validacoes_revisao
        ([cod_item], [revisao_anterior], [revisao_nova], [comentario_revisao], [operacoes], [usuario_id], [usuario_nome])
      VALUES (@codItem, @revisaoAnterior, @revisaoNova, @comentario, @operacoes, @usuarioId, @usuarioNome);
    `);
}
