import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import type {
  RegistroValidacao,
  SituacaoRegistro,
} from "@/modules/validacao-xml-nfe/types/validacaoXmlNfe.types";

/*
 * Histórico das validações de XML de NF-e. A conferência roda no
 * navegador (ver modules/validacao-xml-nfe/utils/validar-nfe.ts); aqui
 * só se guarda o que ela concluiu, com o XML junto -- é ele que vale
 * como prova, e dá para baixar e conferir de novo.
 */

const LIMITE_HISTORICO = 50;

type LinhaRegistro = {
  id: string;
  usuario_nome: string;
  arquivo: string;
  numero_nota: string | null;
  serie: string | null;
  chave_acesso: string | null;
  destinatario: string | null;
  situacao: SituacaoRegistro;
  qtd_erros: number;
  qtd_avisos: number;
  apontamentos: string | null;
  criado_em: string;
};

function paraRegistro(linha: LinhaRegistro): RegistroValidacao {
  let apontamentos: string[] = [];

  try {
    const lidos: unknown = JSON.parse(linha.apontamentos ?? "[]");
    if (Array.isArray(lidos)) apontamentos = lidos.map((a) => String(a));
  } catch {
    /* Registro antigo ou corrompido: mostra sem os apontamentos. */
  }

  return {
    id: linha.id,
    usuarioNome: linha.usuario_nome,
    arquivo: linha.arquivo,
    numeroNota: linha.numero_nota,
    serie: linha.serie,
    chaveAcesso: linha.chave_acesso,
    destinatario: linha.destinatario,
    situacao: linha.situacao,
    qtdErros: linha.qtd_erros,
    qtdAvisos: linha.qtd_avisos,
    apontamentos,
    criadoEm: linha.criado_em,
  };
}

const COLUNAS = `
  CONVERT(VARCHAR(36), [id]) AS [id],
  [usuario_nome], [arquivo], [numero_nota], [serie], [chave_acesso], [destinatario],
  [situacao], [qtd_erros], [qtd_avisos], [apontamentos],
  CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
`;

export async function registrarValidacao(params: {
  usuarioId: string;
  usuarioNome: string;
  arquivo: string;
  numeroNota: string | null;
  serie: string | null;
  chaveAcesso: string | null;
  destinatario: string | null;
  situacao: SituacaoRegistro;
  qtdErros: number;
  qtdAvisos: number;
  apontamentos: string[];
  xml: string;
}): Promise<RegistroValidacao> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, params.usuarioId);
  request.input("usuarioNome", sql.NVarChar(200), params.usuarioNome);
  request.input("arquivo", sql.NVarChar(260), params.arquivo);
  request.input("numeroNota", sql.NVarChar(20), params.numeroNota);
  request.input("serie", sql.NVarChar(10), params.serie);
  request.input("chaveAcesso", sql.NVarChar(44), params.chaveAcesso);
  request.input("destinatario", sql.NVarChar(200), params.destinatario);
  request.input("situacao", sql.VarChar(10), params.situacao);
  request.input("qtdErros", sql.Int, params.qtdErros);
  request.input("qtdAvisos", sql.Int, params.qtdAvisos);
  request.input("apontamentos", sql.NVarChar(sql.MAX), JSON.stringify(params.apontamentos));
  request.input("xml", sql.NVarChar(sql.MAX), params.xml);

  const result = await request.query<LinhaRegistro>(`
    DECLARE @novo TABLE ([id] UNIQUEIDENTIFIER);

    INSERT INTO dbo.fin_validacao_xml_nfe
      ([usuario_id], [usuario_nome], [arquivo], [numero_nota], [serie], [chave_acesso],
       [destinatario], [situacao], [qtd_erros], [qtd_avisos], [apontamentos], [xml])
    OUTPUT INSERTED.[id] INTO @novo
    VALUES
      (@usuarioId, @usuarioNome, @arquivo, @numeroNota, @serie, @chaveAcesso,
       @destinatario, @situacao, @qtdErros, @qtdAvisos, @apontamentos, @xml);

    SELECT ${COLUNAS}
    FROM dbo.fin_validacao_xml_nfe
    WHERE [id] = (SELECT TOP 1 [id] FROM @novo);
  `);

  return paraRegistro(result.recordset[0]);
}

/* As últimas validações de todo mundo -- sem o XML, que pode ser grande. */
export async function listarUltimasValidacoes(): Promise<RegistroValidacao[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<LinhaRegistro>(`
    SELECT TOP (${LIMITE_HISTORICO}) ${COLUNAS}
    FROM dbo.fin_validacao_xml_nfe
    ORDER BY [criado_em] DESC;
  `);

  return result.recordset.map(paraRegistro);
}

export async function buscarXmlDaValidacao(
  id: string
): Promise<{ arquivo: string; xml: string } | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const result = await request.query<{ arquivo: string; xml: string }>(`
    SELECT [arquivo], [xml]
    FROM dbo.fin_validacao_xml_nfe
    WHERE [id] = @id;
  `);

  return result.recordset[0] ?? null;
}
