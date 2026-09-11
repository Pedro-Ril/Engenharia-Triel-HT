import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

export type TipoDadoCampoEquipamento =
  | "texto"
  | "numero"
  | "data"
  | "booleano"
  | "unica_escolha"
  | "multipla_escolha";

export interface TipoEquipamento {
  id: string;
  nome: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface BlocoTipoEquipamento {
  id: string;
  tipoEquipamentoId: string;
  nome: string;
  ehFixo: boolean;
  ordem: number;
  ativo: boolean;
}

export interface CampoTipoEquipamento {
  id: string;
  tipoEquipamentoId: string;
  blocoId: string;
  blocoNome: string;
  chave: string;
  rotulo: string;
  tipoDado: TipoDadoCampoEquipamento;
  opcoes: string[] | null;
  unidade: string | null;
  obrigatorio: boolean;
  ordem: number;
  ativo: boolean;
  ehSistema: boolean;
  geraPendencia: boolean;
  travaMovimentacao: boolean;
  vemDeIntegracao: boolean;
}

/*
 * Chaves reservadas dos 10 campos fixos do sistema (os inputs que hoje já
 * existem nas telas de entrada/detalhe — cliente, valor, descrição...),
 * semeados automaticamente no bloco fixo de todo tipo de equipamento.
 * Usam o prefixo "sistema" (em vez do nome cru, ex: "modelo") pra nunca
 * colidir com a chave de um campo dinâmico que o admin já tenha criado —
 * chave é única por tipo_equipamento_id, e nomes crus como "modelo" já
 * estavam em uso por campos reais antes desta feature existir.
 */
export const CHAVE_SISTEMA_NOME_CLIENTE = "sistemaNomeCliente";
export const CHAVE_SISTEMA_VALOR = "sistemaValor";
export const CHAVE_SISTEMA_DESCRICAO = "sistemaDescricao";
export const CHAVE_SISTEMA_MARCA = "sistemaMarca";
export const CHAVE_SISTEMA_MODELO = "sistemaModelo";
export const CHAVE_SISTEMA_NUMERO_SERIE = "sistemaNumeroSerie";
export const CHAVE_SISTEMA_CODIGO_EMPRESA = "sistemaCodigoEmpresa";
export const CHAVE_SISTEMA_NUMERO_NF_ENTRADA = "sistemaNumeroNfEntrada";
export const CHAVE_SISTEMA_ERP_CODIGO_ITEM = "sistemaErpCodigoItem";
export const CHAVE_SISTEMA_ID_CONFIGURADO = "sistemaIdConfigurado";
export const CHAVE_SISTEMA_DATA_ENTRADA_NF = "sistemaDataEntradaNf";
export const CHAVE_SISTEMA_OBSERVACOES = "sistemaObservacoes";

/*
 * "Descrição" mapeia pra uma coluna NOT NULL da tabela de equipamentos
 * (é a identidade do registro — título nas listas, PDF, breadcrumb) —
 * diferente dos outros 9 campos de sistema, não pode virar opcional nem
 * ser desativada. NF de entrada já foi assim também, mas passou a poder
 * ficar em branco (a coluna virou nullable) — ver "gera_pendencia" logo
 * abaixo, que é como esse cenário passa a ser sinalizado/filtrado.
 */
export const CHAVES_SISTEMA_SEMPRE_OBRIGATORIAS: string[] = [CHAVE_SISTEMA_DESCRICAO];

/*
 * "gera_pendencia": um campo opcional pode ser marcado pra que, quando o
 * valor fica em branco num equipamento, isso conte como uma pendência
 * exibida/filtrável na lista de estoque (ex: "Sem NF de entrada"). Só
 * faz sentido em campo opcional (obrigatorio=false) — e, por enquanto,
 * só em campo de sistema, já que o valor mora numa coluna dedicada do
 * equipamento (fácil de filtrar); campo dinâmico fica pra uma etapa
 * futura, o valor dele mora no JSON solto de campos_valores.
 */

/*
 * Definição de cada um dos 10 campos fixos do sistema — usada tanto pra
 * semear todos eles na criação do tipo (criarTipoEquipamento) quanto pra
 * restaurar um específico depois de excluído (restaurarCampoSistema).
 * "coluna" é a coluna real de dbo.com_estoque_equipamentos_usados onde o
 * valor mora — usada pra filtro de pendência e pra checar se já tem
 * dado gravado antes de deixar excluir.
 */
interface DefinicaoCampoSistema {
  chave: string;
  rotulo: string;
  tipoDado: TipoDadoCampoEquipamento;
  unidade: string | null;
  obrigatorio: boolean;
  ordem: number;
  coluna: string;
  vemDeIntegracao: boolean;
}

export const DEFINICOES_CAMPOS_SISTEMA: DefinicaoCampoSistema[] = [
  { chave: CHAVE_SISTEMA_NOME_CLIENTE, rotulo: "Cliente", tipoDado: "texto", unidade: null, obrigatorio: false, ordem: 0, coluna: "nome_cliente", vemDeIntegracao: false },
  { chave: CHAVE_SISTEMA_VALOR, rotulo: "Valor", tipoDado: "numero", unidade: "R$", obrigatorio: false, ordem: 1, coluna: "valor", vemDeIntegracao: false },
  { chave: CHAVE_SISTEMA_DESCRICAO, rotulo: "Descrição", tipoDado: "texto", unidade: null, obrigatorio: true, ordem: 2, coluna: "descricao", vemDeIntegracao: false },
  { chave: CHAVE_SISTEMA_MARCA, rotulo: "Marca", tipoDado: "texto", unidade: null, obrigatorio: false, ordem: 3, coluna: "marca", vemDeIntegracao: false },
  { chave: CHAVE_SISTEMA_MODELO, rotulo: "Modelo", tipoDado: "texto", unidade: null, obrigatorio: false, ordem: 4, coluna: "modelo", vemDeIntegracao: false },
  { chave: CHAVE_SISTEMA_NUMERO_SERIE, rotulo: "Número de série", tipoDado: "texto", unidade: null, obrigatorio: false, ordem: 5, coluna: "numero_serie", vemDeIntegracao: false },
  { chave: CHAVE_SISTEMA_CODIGO_EMPRESA, rotulo: "Empresa", tipoDado: "texto", unidade: null, obrigatorio: false, ordem: 6, coluna: "codigo_empresa", vemDeIntegracao: false },
  { chave: CHAVE_SISTEMA_NUMERO_NF_ENTRADA, rotulo: "NF de entrada", tipoDado: "texto", unidade: null, obrigatorio: false, ordem: 7, coluna: "numero_nf_entrada", vemDeIntegracao: false },
  { chave: CHAVE_SISTEMA_ERP_CODIGO_ITEM, rotulo: "Código do item no ERP", tipoDado: "texto", unidade: null, obrigatorio: false, ordem: 8, coluna: "erp_codigo_item", vemDeIntegracao: true },
  { chave: CHAVE_SISTEMA_ID_CONFIGURADO, rotulo: "ID Configurado", tipoDado: "texto", unidade: null, obrigatorio: false, ordem: 9, coluna: "erp_id_item", vemDeIntegracao: true },
  { chave: CHAVE_SISTEMA_DATA_ENTRADA_NF, rotulo: "Data Entrada NF", tipoDado: "data", unidade: null, obrigatorio: false, ordem: 10, coluna: "erp_data_entrada", vemDeIntegracao: true },
  { chave: CHAVE_SISTEMA_OBSERVACOES, rotulo: "Observações livres", tipoDado: "texto", unidade: null, obrigatorio: false, ordem: 11, coluna: "observacoes", vemDeIntegracao: false },
];

/*
 * Colunas cujo valor não é texto — a checagem de "já tem dado gravado
 * antes de excluir/desativar um campo de sistema" (excluirCampoTipo,
 * mais abaixo) não pode comparar essas com `<> ''`: SQL Server não
 * converte '' implicitamente pra DECIMAL/DATE sem erro.
 */
const COLUNAS_SISTEMA_NAO_TEXTO = new Set(["valor", "erp_data_entrada"]);

/* Chave de sistema -> coluna real de com_estoque_equipamentos_usados — usado pro filtro de pendência (estoque-equipamentos-usados.ts) e pra checar dado existente antes de excluir um campo de sistema. */
export const COLUNA_EQUIPAMENTO_POR_CHAVE_SISTEMA: Record<string, string> = Object.fromEntries(
  DEFINICOES_CAMPOS_SISTEMA.map((definicao) => [definicao.chave, definicao.coluna])
);

interface TipoEquipamentoRow {
  id: string;
  nome: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

function mapTipoRow(row: TipoEquipamentoRow): TipoEquipamento {
  return {
    id: row.id,
    nome: row.nome,
    ativo: row.ativo,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

export async function listarTiposEquipamento(somenteAtivos = false): Promise<TipoEquipamento[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<TipoEquipamentoRow>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [nome],
      [ativo],
      CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
      CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em]
    FROM dbo.com_estoque_tipos_equipamento
    ${somenteAtivos ? "WHERE [ativo] = 1" : ""}
    ORDER BY [nome];
  `);

  return result.recordset.map(mapTipoRow);
}

export async function buscarTipoEquipamentoPorId(id: string): Promise<TipoEquipamento | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<TipoEquipamentoRow>(`
      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        [nome],
        [ativo],
        CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
        CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em]
      FROM dbo.com_estoque_tipos_equipamento
      WHERE [id] = @id;
    `);

  return result.recordset[0] ? mapTipoRow(result.recordset[0]) : null;
}

const NOME_BLOCO_FIXO = "Recebimento";

/*
 * Cria o tipo e já semeia o bloco fixo "Recebimento" (eh_fixo=1, ordem=0)
 * na mesma transação — todo tipo sempre tem esse bloco pra guardar os
 * campos fixos do sistema (cliente, valor, NF...), sem depender do admin
 * lembrar de criá-lo.
 */
export async function criarTipoEquipamento(nome: string): Promise<TipoEquipamento> {
  const pool = await getSqlServerPool();

  const existente = await pool
    .request()
    .input("nome", sql.NVarChar(150), nome)
    .query<{ total: number }>(
      `SELECT COUNT(*) AS [total] FROM dbo.com_estoque_tipos_equipamento WHERE [nome] = @nome;`
    );

  if (existente.recordset[0].total > 0) {
    throw new ValidationError(`Já existe um tipo de equipamento chamado "${nome}".`);
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  let novoId: string;

  try {
    const result = await new sql.Request(transaction)
      .input("nome", sql.NVarChar(150), nome)
      .query<{ id: string }>(`
        INSERT INTO dbo.com_estoque_tipos_equipamento ([nome])
        OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
        VALUES (@nome);
      `);

    novoId = result.recordset[0].id;

    const blocoResult = await new sql.Request(transaction)
      .input("tipoEquipamentoId", sql.UniqueIdentifier, novoId)
      .input("nome", sql.NVarChar(100), NOME_BLOCO_FIXO)
      .query<{ id: string }>(`
        INSERT INTO dbo.com_estoque_tipos_equipamento_blocos
          ([tipo_equipamento_id], [nome], [eh_fixo], [ordem])
        OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
        VALUES (@tipoEquipamentoId, @nome, 1, 0);
      `);

    const blocoFixoId = blocoResult.recordset[0].id;

    for (const definicao of DEFINICOES_CAMPOS_SISTEMA) {
      await new sql.Request(transaction)
        .input("tipoEquipamentoId", sql.UniqueIdentifier, novoId)
        .input("blocoId", sql.UniqueIdentifier, blocoFixoId)
        .input("chave", sql.VarChar(60), definicao.chave)
        .input("rotulo", sql.NVarChar(150), definicao.rotulo)
        .input("tipoDado", sql.VarChar(20), definicao.tipoDado)
        .input("unidade", sql.NVarChar(20), definicao.unidade)
        .input("obrigatorio", sql.Bit, definicao.obrigatorio)
        .input("ordem", sql.Int, definicao.ordem)
        .input("vemDeIntegracao", sql.Bit, definicao.vemDeIntegracao)
        .query(`
          INSERT INTO dbo.com_estoque_tipos_equipamento_campos
            ([tipo_equipamento_id], [bloco_id], [chave], [rotulo], [tipo_dado], [unidade], [obrigatorio], [ordem], [eh_sistema], [vem_de_integracao])
          VALUES
            (@tipoEquipamentoId, @blocoId, @chave, @rotulo, @tipoDado, @unidade, @obrigatorio, @ordem, 1, @vemDeIntegracao);
        `);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const criado = await buscarTipoEquipamentoPorId(novoId);
  if (!criado) throw new Error("Tipo de equipamento criado mas não encontrado logo em seguida.");
  return criado;
}

export async function atualizarTipoEquipamento(
  id: string,
  dados: { nome?: string; ativo?: boolean }
): Promise<TipoEquipamento> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, id);

  const sets: string[] = [];

  if (dados.nome !== undefined) {
    request.input("nome", sql.NVarChar(150), dados.nome);
    sets.push("[nome] = @nome");
  }

  if (dados.ativo !== undefined) {
    request.input("ativo", sql.Bit, dados.ativo);
    sets.push("[ativo] = @ativo");
  }

  if (sets.length === 0) {
    const atual = await buscarTipoEquipamentoPorId(id);
    if (!atual) throw new ValidationError("Tipo de equipamento não encontrado.");
    return atual;
  }

  sets.push("[atualizado_em] = SYSDATETIME()");

  await request.query(`
    UPDATE dbo.com_estoque_tipos_equipamento
    SET ${sets.join(", ")}
    WHERE [id] = @id;
  `);

  const atualizado = await buscarTipoEquipamentoPorId(id);
  if (!atualizado) throw new ValidationError("Tipo de equipamento não encontrado.");
  return atualizado;
}

/* =========================================================
   BLOCOS (por tipo de equipamento)
   ========================================================= */

interface BlocoRow {
  id: string;
  tipo_equipamento_id: string;
  nome: string;
  eh_fixo: boolean;
  ordem: number;
  ativo: boolean;
}

function mapBlocoRow(row: BlocoRow): BlocoTipoEquipamento {
  return {
    id: row.id,
    tipoEquipamentoId: row.tipo_equipamento_id,
    nome: row.nome,
    ehFixo: row.eh_fixo,
    ordem: row.ordem,
    ativo: row.ativo,
  };
}

export async function listarBlocosDoTipo(
  tipoEquipamentoId: string,
  somenteAtivos = false
): Promise<BlocoTipoEquipamento[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("tipoEquipamentoId", sql.UniqueIdentifier, tipoEquipamentoId)
    .query<BlocoRow>(`
      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        CONVERT(VARCHAR(36), [tipo_equipamento_id]) AS [tipo_equipamento_id],
        [nome],
        [eh_fixo],
        [ordem],
        [ativo]
      FROM dbo.com_estoque_tipos_equipamento_blocos
      WHERE [tipo_equipamento_id] = @tipoEquipamentoId
      ${somenteAtivos ? "AND [ativo] = 1" : ""}
      ORDER BY [ordem], [nome];
    `);

  return result.recordset.map(mapBlocoRow);
}

export async function buscarBlocoPorId(blocoId: string): Promise<BlocoTipoEquipamento | null> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, blocoId)
    .query<BlocoRow>(`
      SELECT
        CONVERT(VARCHAR(36), [id]) AS [id],
        CONVERT(VARCHAR(36), [tipo_equipamento_id]) AS [tipo_equipamento_id],
        [nome],
        [eh_fixo],
        [ordem],
        [ativo]
      FROM dbo.com_estoque_tipos_equipamento_blocos
      WHERE [id] = @id;
    `);

  return result.recordset[0] ? mapBlocoRow(result.recordset[0]) : null;
}

/* Sempre a próxima livre (0 se ainda não há nenhum bloco nesse tipo). */
async function proximaOrdemBloco(tipoEquipamentoId: string): Promise<number> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("tipoEquipamentoId", sql.UniqueIdentifier, tipoEquipamentoId)
    .query<{ maxOrdem: number | null }>(`
      SELECT MAX([ordem]) AS [maxOrdem] FROM dbo.com_estoque_tipos_equipamento_blocos
      WHERE [tipo_equipamento_id] = @tipoEquipamentoId;
    `);

  const maxima = result.recordset[0]?.maxOrdem;
  return maxima === null || maxima === undefined ? 0 : maxima + 1;
}

/* Sempre a próxima livre dentro do bloco (0 se ainda não há nenhum campo lá). */
async function proximaOrdemCampoNoBloco(blocoId: string): Promise<number> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("blocoId", sql.UniqueIdentifier, blocoId)
    .query<{ maxOrdem: number | null }>(`
      SELECT MAX([ordem]) AS [maxOrdem] FROM dbo.com_estoque_tipos_equipamento_campos
      WHERE [bloco_id] = @blocoId;
    `);

  const maxima = result.recordset[0]?.maxOrdem;
  return maxima === null || maxima === undefined ? 0 : maxima + 1;
}

export async function criarBlocoTipo(
  tipoEquipamentoId: string,
  nome: string
): Promise<BlocoTipoEquipamento> {
  const pool = await getSqlServerPool();

  const existente = await pool
    .request()
    .input("tipoEquipamentoId", sql.UniqueIdentifier, tipoEquipamentoId)
    .input("nome", sql.NVarChar(100), nome)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS [total] FROM dbo.com_estoque_tipos_equipamento_blocos
      WHERE [tipo_equipamento_id] = @tipoEquipamentoId AND [nome] = @nome;
    `);

  if (existente.recordset[0].total > 0) {
    throw new ValidationError(`Este tipo de equipamento já tem um bloco chamado "${nome}".`);
  }

  const ordem = await proximaOrdemBloco(tipoEquipamentoId);

  const result = await pool
    .request()
    .input("tipoEquipamentoId", sql.UniqueIdentifier, tipoEquipamentoId)
    .input("nome", sql.NVarChar(100), nome)
    .input("ordem", sql.Int, ordem)
    .query<{ id: string }>(`
      INSERT INTO dbo.com_estoque_tipos_equipamento_blocos
        ([tipo_equipamento_id], [nome], [eh_fixo], [ordem])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@tipoEquipamentoId, @nome, 0, @ordem);
    `);

  const criado = await buscarBlocoPorId(result.recordset[0].id);
  if (!criado) throw new Error("Bloco criado mas não encontrado logo em seguida.");
  return criado;
}

export async function atualizarBlocoTipo(
  blocoId: string,
  dados: { nome?: string; ordem?: number; ativo?: boolean }
): Promise<void> {
  const pool = await getSqlServerPool();
  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, blocoId);

  const sets: string[] = [];

  if (dados.nome !== undefined) {
    request.input("nome", sql.NVarChar(100), dados.nome);
    sets.push("[nome] = @nome");
  }

  if (dados.ordem !== undefined) {
    request.input("ordem", sql.Int, dados.ordem);
    sets.push("[ordem] = @ordem");
  }

  if (dados.ativo !== undefined) {
    request.input("ativo", sql.Bit, dados.ativo);
    sets.push("[ativo] = @ativo");
  }

  if (sets.length === 0) return;

  sets.push("[atualizado_em] = SYSDATETIME()");

  await request.query(`
    UPDATE dbo.com_estoque_tipos_equipamento_blocos
    SET ${sets.join(", ")}
    WHERE [id] = @id;
  `);
}

/*
 * O bloco fixo nunca pode ser excluído (é onde os campos fixos do sistema
 * "aparecem" visualmente) — e um bloco normal só se nenhum campo ou
 * evidência já usar ele, mesma lógica de excluirCampoTipo.
 */
export async function excluirBlocoTipo(blocoId: string): Promise<void> {
  const bloco = await buscarBlocoPorId(blocoId);
  if (!bloco) throw new ValidationError("Bloco não encontrado.");

  if (bloco.ehFixo) {
    throw new ValidationError('O bloco "Recebimento" não pode ser excluído — desative-o se quiser escondê-lo.');
  }

  const pool = await getSqlServerPool();

  const usoResult = await pool
    .request()
    .input("blocoId", sql.UniqueIdentifier, blocoId)
    .query<{ totalCampos: number; totalEvidencias: number }>(`
      SELECT
        (SELECT COUNT(*) FROM dbo.com_estoque_tipos_equipamento_campos WHERE [bloco_id] = @blocoId) AS [totalCampos],
        (SELECT COUNT(*) FROM dbo.com_estoque_equipamentos_usados_evidencias WHERE [bloco_id] = @blocoId) AS [totalEvidencias];
    `);

  const { totalCampos, totalEvidencias } = usoResult.recordset[0];

  if (totalCampos > 0 || totalEvidencias > 0) {
    throw new ValidationError(
      "Já existem campos ou evidências usando este bloco — desative-o em vez de excluir."
    );
  }

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, blocoId)
    .query(`DELETE FROM dbo.com_estoque_tipos_equipamento_blocos WHERE [id] = @id;`);
}

/* =========================================================
   CAMPOS (por bloco, dentro de um tipo de equipamento)
   ========================================================= */

interface CampoRow {
  id: string;
  tipo_equipamento_id: string;
  bloco_id: string;
  bloco_nome: string;
  chave: string;
  rotulo: string;
  tipo_dado: TipoDadoCampoEquipamento;
  opcoes: string | null;
  unidade: string | null;
  obrigatorio: boolean;
  ordem: number;
  ativo: boolean;
  eh_sistema: boolean;
  gera_pendencia: boolean;
  trava_movimentacao: boolean;
  vem_de_integracao: boolean;
}

function mapCampoRow(row: CampoRow): CampoTipoEquipamento {
  return {
    id: row.id,
    tipoEquipamentoId: row.tipo_equipamento_id,
    blocoId: row.bloco_id,
    blocoNome: row.bloco_nome,
    chave: row.chave,
    rotulo: row.rotulo,
    tipoDado: row.tipo_dado,
    opcoes: row.opcoes ? (JSON.parse(row.opcoes) as string[]) : null,
    unidade: row.unidade,
    obrigatorio: row.obrigatorio,
    ordem: row.ordem,
    ativo: row.ativo,
    ehSistema: row.eh_sistema,
    geraPendencia: row.gera_pendencia,
    travaMovimentacao: row.trava_movimentacao,
    vemDeIntegracao: row.vem_de_integracao,
  };
}

export async function listarCamposDoTipo(
  tipoEquipamentoId: string,
  somenteAtivos = false
): Promise<CampoTipoEquipamento[]> {
  const pool = await getSqlServerPool();

  const result = await pool
    .request()
    .input("tipoEquipamentoId", sql.UniqueIdentifier, tipoEquipamentoId)
    .query<CampoRow>(`
      SELECT
        CONVERT(VARCHAR(36), c.[id]) AS [id],
        CONVERT(VARCHAR(36), c.[tipo_equipamento_id]) AS [tipo_equipamento_id],
        CONVERT(VARCHAR(36), c.[bloco_id]) AS [bloco_id],
        b.[nome] AS [bloco_nome],
        c.[chave],
        c.[rotulo],
        c.[tipo_dado],
        c.[opcoes],
        c.[unidade],
        c.[obrigatorio],
        c.[ordem],
        c.[ativo],
        c.[eh_sistema],
        c.[gera_pendencia],
        c.[trava_movimentacao],
        c.[vem_de_integracao]
      FROM dbo.com_estoque_tipos_equipamento_campos AS c
      INNER JOIN dbo.com_estoque_tipos_equipamento_blocos AS b ON b.[id] = c.[bloco_id]
      WHERE c.[tipo_equipamento_id] = @tipoEquipamentoId
      ${somenteAtivos ? "AND c.[ativo] = 1" : ""}
      ORDER BY b.[ordem], c.[ordem], c.[rotulo];
    `);

  return result.recordset.map(mapCampoRow);
}

const CHAVE_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;

function validarOpcoes(tipoDado: TipoDadoCampoEquipamento, opcoes: string[] | null): string | null {
  if (tipoDado === "unica_escolha" || tipoDado === "multipla_escolha") {
    if (!opcoes || opcoes.length === 0) {
      throw new ValidationError("Informe ao menos uma opção para um campo de escolha.");
    }
    return JSON.stringify(opcoes);
  }
  return null;
}

async function exigirBlocoDoTipo(tipoEquipamentoId: string, blocoId: string): Promise<void> {
  const bloco = await buscarBlocoPorId(blocoId);

  if (!bloco || bloco.tipoEquipamentoId !== tipoEquipamentoId) {
    throw new ValidationError("Bloco inválido para este tipo de equipamento.");
  }
}

export async function criarCampoTipo(
  tipoEquipamentoId: string,
  dados: {
    blocoId: string;
    chave: string;
    rotulo: string;
    tipoDado: TipoDadoCampoEquipamento;
    opcoes: string[] | null;
    unidade: string | null;
    obrigatorio: boolean;
    ordem: number;
    vemDeIntegracao?: boolean;
  }
): Promise<CampoTipoEquipamento> {
  if (!CHAVE_PATTERN.test(dados.chave)) {
    throw new ValidationError(
      'A chave do campo deve começar com uma letra minúscula e conter só letras minúsculas, números e "_" (ex: "capacidadeM3").'
    );
  }

  if (dados.vemDeIntegracao && dados.obrigatorio) {
    throw new ValidationError(
      'Um campo que vem de integração não pode ser obrigatório — desmarque "Obrigatório" primeiro.'
    );
  }

  await exigirBlocoDoTipo(tipoEquipamentoId, dados.blocoId);

  const opcoesJson = validarOpcoes(dados.tipoDado, dados.opcoes);

  const pool = await getSqlServerPool();

  const existente = await pool
    .request()
    .input("tipoEquipamentoId", sql.UniqueIdentifier, tipoEquipamentoId)
    .input("chave", sql.VarChar(60), dados.chave)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS [total] FROM dbo.com_estoque_tipos_equipamento_campos
      WHERE [tipo_equipamento_id] = @tipoEquipamentoId AND [chave] = @chave;
    `);

  if (existente.recordset[0].total > 0) {
    throw new ValidationError(`Este tipo de equipamento já tem um campo com a chave "${dados.chave}".`);
  }

  const result = await pool
    .request()
    .input("tipoEquipamentoId", sql.UniqueIdentifier, tipoEquipamentoId)
    .input("blocoId", sql.UniqueIdentifier, dados.blocoId)
    .input("chave", sql.VarChar(60), dados.chave)
    .input("rotulo", sql.NVarChar(150), dados.rotulo)
    .input("tipoDado", sql.VarChar(20), dados.tipoDado)
    .input("opcoes", sql.NVarChar(sql.MAX), opcoesJson)
    .input("unidade", sql.NVarChar(20), dados.unidade)
    .input("obrigatorio", sql.Bit, dados.obrigatorio)
    .input("ordem", sql.Int, dados.ordem)
    .input("vemDeIntegracao", sql.Bit, dados.vemDeIntegracao ?? false)
    .query<{ id: string }>(`
      INSERT INTO dbo.com_estoque_tipos_equipamento_campos
        ([tipo_equipamento_id], [bloco_id], [chave], [rotulo], [tipo_dado], [opcoes], [unidade], [obrigatorio], [ordem], [vem_de_integracao])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES
        (@tipoEquipamentoId, @blocoId, @chave, @rotulo, @tipoDado, @opcoes, @unidade, @obrigatorio, @ordem, @vemDeIntegracao);
    `);

  const campos = await listarCamposDoTipo(tipoEquipamentoId);
  const criado = campos.find((campo) => campo.id === result.recordset[0].id);
  if (!criado) throw new Error("Campo criado mas não encontrado logo em seguida.");
  return criado;
}

export async function atualizarCampoTipo(
  campoId: string,
  dados: {
    rotulo?: string;
    tipoDado?: TipoDadoCampoEquipamento;
    opcoes?: string[] | null;
    unidade?: string | null;
    obrigatorio?: boolean;
    ordem?: number;
    ativo?: boolean;
    geraPendencia?: boolean;
    travaMovimentacao?: boolean;
    vemDeIntegracao?: boolean;
  }
): Promise<void> {
  const pool = await getSqlServerPool();

  const atualResult = await pool
    .request()
    .input("id", sql.UniqueIdentifier, campoId)
    .query<{
      tipo_dado: TipoDadoCampoEquipamento;
      chave: string;
      eh_sistema: boolean;
      obrigatorio: boolean;
      gera_pendencia: boolean;
      trava_movimentacao: boolean;
      vem_de_integracao: boolean;
    }>(
      `SELECT [tipo_dado], [chave], [eh_sistema], [obrigatorio], [gera_pendencia], [trava_movimentacao], [vem_de_integracao]
       FROM dbo.com_estoque_tipos_equipamento_campos WHERE [id] = @id;`
    );

  const atual = atualResult.recordset[0];
  if (!atual) throw new ValidationError("Campo não encontrado.");

  if (atual.eh_sistema && (dados.tipoDado !== undefined || dados.opcoes !== undefined)) {
    throw new ValidationError("Não é possível mudar o tipo de dado de um campo do sistema.");
  }

  if (
    atual.eh_sistema &&
    CHAVES_SISTEMA_SEMPRE_OBRIGATORIAS.includes(atual.chave) &&
    (dados.obrigatorio === false || dados.ativo === false)
  ) {
    throw new ValidationError('O campo "Descrição" é sempre obrigatório e não pode ser desativado.');
  }

  if (dados.geraPendencia !== undefined && !atual.eh_sistema) {
    throw new ValidationError("Por enquanto, só campos do sistema podem virar status de pendência.");
  }

  const obrigatorioEfetivo = dados.obrigatorio ?? atual.obrigatorio;
  const geraPendenciaEfetivo = dados.geraPendencia ?? atual.gera_pendencia;
  const vemDeIntegracaoEfetivo = dados.vemDeIntegracao ?? atual.vem_de_integracao;

  if (geraPendenciaEfetivo && obrigatorioEfetivo) {
    throw new ValidationError(
      'Só é possível marcar "vira status" num campo opcional — desmarque "Obrigatório" primeiro.'
    );
  }

  if (vemDeIntegracaoEfetivo && obrigatorioEfetivo) {
    throw new ValidationError(
      'Um campo que vem de integração não pode ser obrigatório — desmarque "Obrigatório" primeiro.'
    );
  }

  if (dados.travaMovimentacao === true && !geraPendenciaEfetivo) {
    throw new ValidationError(
      'Só é possível travar movimentações numa pendência marcada como "vira status" — marque essa opção primeiro.'
    );
  }

  /*
   * Desligar "vira status" também desliga "trava movimentações" junto
   * (não dá pra travar uma movimentação por uma pendência que deixou de
   * existir) — a menos que o próprio chamador já tenha dito
   * explicitamente o que quer para travaMovimentacao nessa mesma chamada.
   */
  const travaMovimentacaoFinal =
    dados.travaMovimentacao !== undefined
      ? dados.travaMovimentacao
      : !geraPendenciaEfetivo && atual.trava_movimentacao
        ? false
        : undefined;

  const tipoDadoEfetivo = dados.tipoDado ?? atual.tipo_dado;

  const request = pool.request();
  request.input("id", sql.UniqueIdentifier, campoId);

  const sets: string[] = [];

  if (dados.rotulo !== undefined) {
    request.input("rotulo", sql.NVarChar(150), dados.rotulo);
    sets.push("[rotulo] = @rotulo");
  }

  if (dados.tipoDado !== undefined) {
    request.input("tipoDado", sql.VarChar(20), dados.tipoDado);
    sets.push("[tipo_dado] = @tipoDado");
  }

  if (dados.opcoes !== undefined && tipoDadoEfetivo) {
    const opcoesJson = validarOpcoes(tipoDadoEfetivo, dados.opcoes);
    request.input("opcoes", sql.NVarChar(sql.MAX), opcoesJson);
    sets.push("[opcoes] = @opcoes");
  }

  if (dados.unidade !== undefined) {
    request.input("unidade", sql.NVarChar(20), dados.unidade);
    sets.push("[unidade] = @unidade");
  }

  if (dados.obrigatorio !== undefined) {
    request.input("obrigatorio", sql.Bit, dados.obrigatorio);
    sets.push("[obrigatorio] = @obrigatorio");
  }

  if (dados.geraPendencia !== undefined) {
    request.input("geraPendencia", sql.Bit, dados.geraPendencia);
    sets.push("[gera_pendencia] = @geraPendencia");
  }

  if (travaMovimentacaoFinal !== undefined) {
    request.input("travaMovimentacao", sql.Bit, travaMovimentacaoFinal);
    sets.push("[trava_movimentacao] = @travaMovimentacao");
  }

  if (dados.vemDeIntegracao !== undefined) {
    request.input("vemDeIntegracao", sql.Bit, dados.vemDeIntegracao);
    sets.push("[vem_de_integracao] = @vemDeIntegracao");
  }

  if (dados.ordem !== undefined) {
    request.input("ordem", sql.Int, dados.ordem);
    sets.push("[ordem] = @ordem");
  }

  if (dados.ativo !== undefined) {
    request.input("ativo", sql.Bit, dados.ativo);
    sets.push("[ativo] = @ativo");
  }

  if (sets.length === 0) return;

  sets.push("[atualizado_em] = SYSDATETIME()");

  await request.query(`
    UPDATE dbo.com_estoque_tipos_equipamento_campos
    SET ${sets.join(", ")}
    WHERE [id] = @id;
  `);
}

/*
 * Exclusão definitiva só é permitida se nenhum equipamento desse tipo já
 * tiver um valor gravado pra esse campo — senão a orientação é desativar
 * (ativo = 0), que já tira o campo do formulário sem apagar histórico.
 * Campo dinâmico guarda o valor num JSON solto (campos_valores), checado
 * via JSON_VALUE; campo de sistema guarda numa coluna dedicada do
 * equipamento, checado direto nela. "Descrição" é a única exceção que
 * nunca pode ser excluída — é a identificação do equipamento em toda
 * tela/PDF/lista, e mapeia pra uma coluna NOT NULL (sem ela, não haveria
 * como cadastrar equipamento nenhum desse tipo).
 */
export async function excluirCampoTipo(campoId: string): Promise<void> {
  const pool = await getSqlServerPool();

  const campoResult = await pool
    .request()
    .input("id", sql.UniqueIdentifier, campoId)
    .query<{ tipo_equipamento_id: string; chave: string; eh_sistema: boolean }>(`
      SELECT CONVERT(VARCHAR(36), [tipo_equipamento_id]) AS [tipo_equipamento_id], [chave], [eh_sistema]
      FROM dbo.com_estoque_tipos_equipamento_campos
      WHERE [id] = @id;
    `);

  const campo = campoResult.recordset[0];
  if (!campo) throw new ValidationError("Campo não encontrado.");

  if (campo.chave === CHAVE_SISTEMA_DESCRICAO) {
    throw new ValidationError(
      'O campo "Descrição" não pode ser excluído — é a identificação do equipamento em todo o sistema.'
    );
  }

  if (campo.eh_sistema) {
    const coluna = COLUNA_EQUIPAMENTO_POR_CHAVE_SISTEMA[campo.chave];

    const usoSistemaResult = await pool
      .request()
      .input("tipoEquipamentoId", sql.UniqueIdentifier, campo.tipo_equipamento_id)
      .query<{ total: number }>(`
        SELECT COUNT(*) AS [total] FROM dbo.com_estoque_equipamentos_usados
        WHERE [tipo_equipamento_id] = @tipoEquipamentoId
          AND [${coluna}] IS NOT NULL ${COLUNAS_SISTEMA_NAO_TEXTO.has(coluna) ? "" : "AND [" + coluna + "] <> ''"};
      `);

    if (usoSistemaResult.recordset[0].total > 0) {
      throw new ValidationError(
        "Já existem equipamentos com valor preenchido para este campo — desative-o em vez de excluir."
      );
    }
  } else {
    const usoResult = await pool
      .request()
      .input("tipoEquipamentoId", sql.UniqueIdentifier, campo.tipo_equipamento_id)
      .input("chave", sql.NVarChar(60), campo.chave)
      .query<{ total: number }>(`
        SELECT COUNT(*) AS [total] FROM dbo.com_estoque_equipamentos_usados
        WHERE [tipo_equipamento_id] = @tipoEquipamentoId
          AND JSON_VALUE([campos_valores], '$."' + @chave + '"') IS NOT NULL;
      `);

    if (usoResult.recordset[0].total > 0) {
      throw new ValidationError(
        "Já existem equipamentos com valor preenchido para este campo — desative-o em vez de excluir."
      );
    }
  }

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, campoId)
    .query(`DELETE FROM dbo.com_estoque_tipos_equipamento_campos WHERE [id] = @id;`);
}

/*
 * Restaura um campo de sistema depois de excluído — insere de novo com a
 * mesma definição padrão (rótulo/tipo/ordem/obrigatório), sempre no bloco
 * fixo do tipo (é onde campo de sistema sempre mora). Recusa se a chave
 * não for uma das 10 reservadas, ou se já existir (não foi excluído).
 */
export async function restaurarCampoSistema(
  tipoEquipamentoId: string,
  chave: string
): Promise<CampoTipoEquipamento> {
  const definicao = DEFINICOES_CAMPOS_SISTEMA.find((item) => item.chave === chave);
  if (!definicao) {
    throw new ValidationError("Essa chave não corresponde a um campo do sistema.");
  }

  const pool = await getSqlServerPool();

  const existente = await pool
    .request()
    .input("tipoEquipamentoId", sql.UniqueIdentifier, tipoEquipamentoId)
    .input("chave", sql.VarChar(60), chave)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS [total] FROM dbo.com_estoque_tipos_equipamento_campos
      WHERE [tipo_equipamento_id] = @tipoEquipamentoId AND [chave] = @chave;
    `);

  if (existente.recordset[0].total > 0) {
    throw new ValidationError(`O campo "${definicao.rotulo}" já existe nesse tipo.`);
  }

  const blocos = await listarBlocosDoTipo(tipoEquipamentoId);
  const blocoFixo = blocos.find((bloco) => bloco.ehFixo);
  if (!blocoFixo) {
    throw new ValidationError("Este tipo não tem um bloco fixo — não é possível restaurar o campo.");
  }

  const ordem = await proximaOrdemCampoNoBloco(blocoFixo.id);

  const result = await pool
    .request()
    .input("tipoEquipamentoId", sql.UniqueIdentifier, tipoEquipamentoId)
    .input("blocoId", sql.UniqueIdentifier, blocoFixo.id)
    .input("chave", sql.VarChar(60), definicao.chave)
    .input("rotulo", sql.NVarChar(150), definicao.rotulo)
    .input("tipoDado", sql.VarChar(20), definicao.tipoDado)
    .input("unidade", sql.NVarChar(20), definicao.unidade)
    .input("obrigatorio", sql.Bit, definicao.obrigatorio)
    .input("ordem", sql.Int, ordem)
    .input("vemDeIntegracao", sql.Bit, definicao.vemDeIntegracao)
    .query<{ id: string }>(`
      INSERT INTO dbo.com_estoque_tipos_equipamento_campos
        ([tipo_equipamento_id], [bloco_id], [chave], [rotulo], [tipo_dado], [unidade], [obrigatorio], [ordem], [eh_sistema], [vem_de_integracao])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES
        (@tipoEquipamentoId, @blocoId, @chave, @rotulo, @tipoDado, @unidade, @obrigatorio, @ordem, 1, @vemDeIntegracao);
    `);

  const campos = await listarCamposDoTipo(tipoEquipamentoId);
  const criado = campos.find((item) => item.id === result.recordset[0].id);
  if (!criado) throw new Error("Campo restaurado mas não encontrado logo em seguida.");
  return criado;
}

export interface CampoPendenciaConfig {
  tipoEquipamentoId: string;
  chave: string;
  rotulo: string;
  travaMovimentacao: boolean;
}

/*
 * Lista os campos de sistema marcados como "gera_pendencia" (ativos, em
 * tipo ativo) — usado pra tela de estoque montar tanto as opções do
 * filtro "Pendência" (deduplicando por chave) quanto, por linha, quais
 * campos daquele tipo específico devem virar badge quando vazios.
 */
export async function listarCamposComPendencia(): Promise<CampoPendenciaConfig[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{
    tipo_equipamento_id: string;
    chave: string;
    rotulo: string;
    trava_movimentacao: boolean;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), c.[tipo_equipamento_id]) AS [tipo_equipamento_id],
      c.[chave],
      c.[rotulo],
      c.[trava_movimentacao]
    FROM dbo.com_estoque_tipos_equipamento_campos AS c
    INNER JOIN dbo.com_estoque_tipos_equipamento AS t ON t.[id] = c.[tipo_equipamento_id]
    WHERE c.[eh_sistema] = 1 AND c.[gera_pendencia] = 1 AND c.[ativo] = 1 AND t.[ativo] = 1;
  `);

  return result.recordset.map((row) => ({
    tipoEquipamentoId: row.tipo_equipamento_id,
    chave: row.chave,
    rotulo: row.rotulo,
    travaMovimentacao: row.trava_movimentacao,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/*
 * Valida os valores digitados contra as definições de campos do tipo de
 * equipamento escolhido — mesma ideia de `validarValoresCamposExtra` do
 * desenho-aprovação (src/lib/desenho-aprovacao/templates.ts), mas com tipo
 * de dado próprio incluindo escolha única/múltipla. Devolve o JSON pronto
 * pra gravar em campos_valores (ou null se não há nada a gravar).
 */
export function validarValoresCamposDinamicos(
  campos: CampoTipoEquipamento[],
  valoresBrutos: unknown
): string | null {
  if (campos.length === 0) return null;

  const valoresObjeto = isRecord(valoresBrutos) ? valoresBrutos : {};
  const resultado: Record<string, unknown> = {};

  for (const campo of campos) {
    const bruto = valoresObjeto[campo.chave];

    const vazio =
      bruto === undefined ||
      bruto === null ||
      bruto === "" ||
      (Array.isArray(bruto) && bruto.length === 0);

    if (vazio) {
      if (campo.obrigatorio) {
        throw new ValidationError(`O campo "${campo.rotulo}" é obrigatório.`);
      }
      continue;
    }

    if (campo.tipoDado === "numero") {
      const numero = Number(bruto);
      if (!Number.isFinite(numero)) {
        throw new ValidationError(`O campo "${campo.rotulo}" deve ser um número válido.`);
      }
      resultado[campo.chave] = numero;
    } else if (campo.tipoDado === "booleano") {
      if (typeof bruto !== "boolean") {
        throw new ValidationError(`O campo "${campo.rotulo}" deve ser verdadeiro ou falso.`);
      }
      resultado[campo.chave] = bruto;
    } else if (campo.tipoDado === "data") {
      if (typeof bruto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bruto)) {
        throw new ValidationError(`O campo "${campo.rotulo}" deve estar no formato AAAA-MM-DD.`);
      }
      resultado[campo.chave] = bruto;
    } else if (campo.tipoDado === "unica_escolha") {
      if (typeof bruto !== "string" || !campo.opcoes?.includes(bruto)) {
        throw new ValidationError(`O campo "${campo.rotulo}" tem um valor inválido.`);
      }
      resultado[campo.chave] = bruto;
    } else if (campo.tipoDado === "multipla_escolha") {
      if (!Array.isArray(bruto) || !bruto.every((item) => typeof item === "string" && campo.opcoes?.includes(item))) {
        throw new ValidationError(`O campo "${campo.rotulo}" tem um valor inválido.`);
      }
      resultado[campo.chave] = bruto;
    } else {
      if (typeof bruto !== "string") {
        throw new ValidationError(`O campo "${campo.rotulo}" deve ser um texto.`);
      }
      resultado[campo.chave] = bruto;
    }
  }

  return Object.keys(resultado).length > 0 ? JSON.stringify(resultado) : null;
}
