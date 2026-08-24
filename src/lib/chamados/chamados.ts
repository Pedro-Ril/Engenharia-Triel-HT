import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { ValidationError } from "@/lib/auth/errors";

export type StatusChamado =
  | "aberto"
  | "em_andamento"
  | "aguardando_confirmacao"
  | "resolvido"
  | "fechado";
export type PrioridadeChamado = "baixa" | "media" | "alta" | "urgente";
export type AutorTipoMensagem = "solicitante" | "atendente" | "sistema";

export const TAMANHO_MAXIMO_ANEXO_BYTES = 10 * 1024 * 1024;
export const MAXIMO_ANEXOS_POR_MENSAGEM = 5;

export interface SetorChamado {
  id: string;
  nome: string;
}

/*
 * Versão enxuta (id + nome) dos setores habilitados para
 * chamados — só os que um admin marcou como "aceita chamados"
 * em Administração → Chamados (ver
 * src/lib/chamados/atendentes.ts) aparecem aqui. Evita importar
 * src/lib/auth/admin.ts (CRUD completo de setores, pensado para
 * a tela de administração) numa página pública.
 */
export async function listarSetoresParaChamado(): Promise<SetorChamado[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<SetorChamado>(`
    SELECT CONVERT(VARCHAR(36), [id]) AS [id], [nome]
    FROM dbo.portal_setores
    WHERE [ativo] = 1 AND [aceita_chamados] = 1
    ORDER BY [nome];
  `);

  return result.recordset;
}

/*
 * Lista de códigos de empresa distintos já usados em algum
 * chamado — para os filtros de "Empresa" na fila de atendimento
 * e no dashboard (ver src/lib/chamados/dashboard.ts). Lida do
 * próprio portal_chamados (não de portal_usuarios) para só
 * mostrar empresas que realmente têm chamados, evitando um
 * filtro cheio de opções sem nenhum resultado.
 */
export async function listarEmpresasComChamados(): Promise<string[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{ empresa: string }>(`
    SELECT DISTINCT [empresa]
    FROM dbo.portal_chamados
    WHERE [empresa] IS NOT NULL AND [empresa] <> ''
    ORDER BY [empresa];
  `);

  return result.recordset.map((row) => row.empresa);
}

/*
 * Mesma ideia de listarEmpresasComChamados, mas para o
 * departamento do solicitante — foto do grupo "GRUPO X" do AD no
 * momento da abertura (ver src/lib/auth/ldap.ts,
 * extrairDepartamentoDoMemberOf), usada nos relatórios de
 * chamados por setor de origem.
 */
export async function listarDepartamentosComChamados(): Promise<string[]> {
  const pool = await getSqlServerPool();

  const result = await pool.request().query<{ solicitante_departamento: string }>(`
    SELECT DISTINCT [solicitante_departamento]
    FROM dbo.portal_chamados
    WHERE [solicitante_departamento] IS NOT NULL AND [solicitante_departamento] <> ''
    ORDER BY [solicitante_departamento];
  `);

  return result.recordset.map((row) => row.solicitante_departamento);
}

export interface ChamadoAnexo {
  id: string;
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  criadoEm: string;
}

export interface ChamadoMensagem {
  id: string;
  autorNome: string;
  autorTipo: AutorTipoMensagem;
  interno: boolean;
  texto: string;
  criadoEm: string;
  anexos: ChamadoAnexo[];
}

export interface ChamadoResumo {
  id: string;
  numero: number;
  setorId: string;
  setorNome: string;
  titulo: string;
  status: StatusChamado;
  prioridade: PrioridadeChamado;
  solicitanteNome: string;
  atendenteNome: string | null;
  empresa: string | null;
  solicitanteDepartamento: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  publico: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Chamado extends ChamadoResumo {
  solicitanteUsuarioId: string | null;
  solicitanteContato: string | null;
  atendenteUsuarioId: string | null;
  resolvidoEm: string | null;
  fechadoEm: string | null;
  mensagens: ChamadoMensagem[];
}

export interface NovoAnexo {
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  conteudo: Buffer;
}

const colunasChamado = `
  CONVERT(VARCHAR(36), c.[id]) AS [id],
  c.[numero],
  CONVERT(VARCHAR(36), c.[setor_id]) AS [setor_id],
  s.[nome] AS [setor_nome],
  c.[titulo],
  c.[status],
  c.[prioridade],
  c.[solicitante_usuario_id],
  c.[solicitante_nome],
  c.[solicitante_contato],
  CONVERT(VARCHAR(36), c.[atendente_usuario_id]) AS [atendente_usuario_id],
  atendente.[nome_exibicao] AS [atendente_nome],
  c.[empresa],
  c.[solicitante_departamento],
  CONVERT(VARCHAR(36), c.[categoria_id]) AS [categoria_id],
  categoria.[nome] AS [categoria_nome],
  CAST(c.[publico] AS BIT) AS [publico],
  CONVERT(VARCHAR(33), c.[criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), c.[atualizado_em], 126) AS [atualizado_em],
  CONVERT(VARCHAR(33), c.[resolvido_em], 126) AS [resolvido_em],
  CONVERT(VARCHAR(33), c.[fechado_em], 126) AS [fechado_em]
`;

const juncoesChamado = `
  FROM dbo.portal_chamados AS c
  INNER JOIN dbo.portal_setores AS s ON s.[id] = c.[setor_id]
  LEFT JOIN dbo.portal_usuarios AS solicitante ON solicitante.[id] = c.[solicitante_usuario_id]
  LEFT JOIN dbo.portal_usuarios AS atendente ON atendente.[id] = c.[atendente_usuario_id]
  LEFT JOIN dbo.portal_chamados_categorias AS categoria ON categoria.[id] = c.[categoria_id]
`;

interface ChamadoRow {
  id: string;
  numero: number;
  setor_id: string;
  setor_nome: string;
  titulo: string;
  status: string;
  prioridade: string;
  solicitante_usuario_id: string | null;
  solicitante_nome: string | null;
  solicitante_contato: string | null;
  atendente_usuario_id: string | null;
  atendente_nome: string | null;
  empresa: string | null;
  solicitante_departamento: string | null;
  categoria_id: string | null;
  categoria_nome: string | null;
  publico: boolean;
  criado_em: string;
  atualizado_em: string;
  resolvido_em: string | null;
  fechado_em: string | null;
}

function mapChamadoRow(row: ChamadoRow): Chamado {
  return {
    id: row.id,
    numero: row.numero,
    setorId: row.setor_id,
    setorNome: row.setor_nome,
    titulo: row.titulo,
    status: row.status as StatusChamado,
    prioridade: row.prioridade as PrioridadeChamado,
    solicitanteNome: row.solicitante_nome ?? "",
    solicitanteUsuarioId: row.solicitante_usuario_id,
    solicitanteContato: row.solicitante_contato,
    atendenteUsuarioId: row.atendente_usuario_id,
    atendenteNome: row.atendente_nome,
    empresa: row.empresa,
    solicitanteDepartamento: row.solicitante_departamento,
    categoriaId: row.categoria_id,
    categoriaNome: row.categoria_nome,
    publico: row.publico,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    resolvidoEm: row.resolvido_em,
    fechadoEm: row.fechado_em,
    mensagens: [],
  };
}

async function inserirAnexos(
  transaction: InstanceType<typeof sql.Transaction>,
  mensagemId: string,
  anexos: NovoAnexo[]
): Promise<void> {
  for (const anexo of anexos) {
    const request = new sql.Request(transaction);

    request.input("mensagemId", sql.UniqueIdentifier, mensagemId);
    request.input("nomeArquivo", sql.NVarChar(260), anexo.nomeArquivo);
    request.input("tipoMime", sql.NVarChar(150), anexo.tipoMime);
    request.input("tamanhoBytes", sql.Int, anexo.tamanhoBytes);
    request.input("conteudo", sql.VarBinary(sql.MAX), anexo.conteudo);

    await request.query(`
      INSERT INTO dbo.portal_chamados_anexos
        ([mensagem_id], [nome_arquivo], [tipo_mime], [tamanho_bytes], [conteudo])
      VALUES (@mensagemId, @nomeArquivo, @tipoMime, @tamanhoBytes, @conteudo);
    `);
  }
}

export interface CriarChamadoParams {
  setorId: string;
  /* Obrigatório na abertura (ver src/app/api/chamados/route.ts) — null só é aceito para não quebrar chamados antigos, nunca gerado por uma abertura nova. */
  categoriaId: string | null;
  /* Percepção de quem abre o chamado — o atendente pode ajustar depois (ver atualizarPrioridade). */
  prioridade: PrioridadeChamado;
  titulo: string;
  descricao: string;
  solicitanteUsuarioId: string | null;
  solicitanteNome: string;
  solicitanteContato: string | null;
  /* Foto do codigoEmpresa do usuário no momento da abertura — null se anônimo ou sem empresa cadastrada. */
  empresa: string | null;
  /* Foto do departamento (grupo "GRUPO X" do AD) do usuário no momento da abertura — null se anônimo ou sem grupo de setor. */
  solicitanteDepartamento: string | null;
  ipOrigem: string | null;
  anexos: NovoAnexo[];
}

export async function criarChamado(
  params: CriarChamadoParams
): Promise<{ id: string; numero: number }> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    const insertChamado = new sql.Request(transaction);

    insertChamado.input("setorId", sql.UniqueIdentifier, params.setorId);
    insertChamado.input("categoriaId", sql.UniqueIdentifier, params.categoriaId);
    insertChamado.input("prioridade", sql.VarChar(10), params.prioridade);
    insertChamado.input("titulo", sql.NVarChar(200), params.titulo);
    insertChamado.input(
      "solicitanteUsuarioId",
      sql.UniqueIdentifier,
      params.solicitanteUsuarioId
    );
    insertChamado.input("solicitanteNome", sql.NVarChar(200), params.solicitanteNome);
    insertChamado.input(
      "solicitanteContato",
      sql.NVarChar(200),
      params.solicitanteContato
    );
    insertChamado.input("empresa", sql.NVarChar(30), params.empresa);
    insertChamado.input(
      "solicitanteDepartamento",
      sql.NVarChar(200),
      params.solicitanteDepartamento
    );
    insertChamado.input("ipOrigem", sql.VarChar(64), params.ipOrigem);

    let chamadoResult;

    try {
      chamadoResult = await insertChamado.query<{ id: string; numero: number }>(`
        INSERT INTO dbo.portal_chamados
          ([setor_id], [categoria_id], [prioridade], [titulo], [solicitante_usuario_id], [solicitante_nome], [solicitante_contato], [empresa], [solicitante_departamento], [ip_origem])
        OUTPUT
          CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
          INSERTED.[numero] AS [numero]
        VALUES (@setorId, @categoriaId, @prioridade, @titulo, @solicitanteUsuarioId, @solicitanteNome, @solicitanteContato, @empresa, @solicitanteDepartamento, @ipOrigem);
      `);
    } catch (error) {
      if (error instanceof Error && /FK_portal_chamados_setor/i.test(error.message)) {
        throw new ValidationError("O setor selecionado não existe.");
      }
      if (error instanceof Error && /FK_portal_chamados_categoria/i.test(error.message)) {
        throw new ValidationError("A categoria selecionada não existe.");
      }
      throw error;
    }

    const { id: chamadoId, numero } = chamadoResult.recordset[0];

    const insertMensagem = new sql.Request(transaction);
    insertMensagem.input("chamadoId", sql.UniqueIdentifier, chamadoId);
    insertMensagem.input(
      "autorUsuarioId",
      sql.UniqueIdentifier,
      params.solicitanteUsuarioId
    );
    insertMensagem.input("autorNome", sql.NVarChar(200), params.solicitanteNome);
    insertMensagem.input("texto", sql.NVarChar(sql.MAX), params.descricao);

    const mensagemResult = await insertMensagem.query<{ id: string }>(`
      INSERT INTO dbo.portal_chamados_mensagens
        ([chamado_id], [autor_usuario_id], [autor_nome], [autor_tipo], [texto])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@chamadoId, @autorUsuarioId, @autorNome, 'solicitante', @texto);
    `);

    await inserirAnexos(transaction, mensagemResult.recordset[0].id, params.anexos);

    await transaction.commit();

    return { id: chamadoId, numero };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function carregarMensagens(chamadoId: string): Promise<ChamadoMensagem[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("chamadoId", sql.UniqueIdentifier, chamadoId);

  const mensagensResult = await request.query<{
    id: string;
    autor_nome: string;
    autor_tipo: string;
    interno: boolean;
    texto: string;
    criado_em: string;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), [id]) AS [id],
      [autor_nome],
      [autor_tipo],
      CAST([interno] AS BIT) AS [interno],
      [texto],
      CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
    FROM dbo.portal_chamados_mensagens
    WHERE [chamado_id] = @chamadoId
    ORDER BY [criado_em];
  `);

  const mensagemIds = mensagensResult.recordset.map((row) => row.id);
  const anexosPorMensagem = new Map<string, ChamadoAnexo[]>();

  if (mensagemIds.length > 0) {
    const anexosRequest = pool.request();
    const parametros = mensagemIds.map((id, indice) => {
      anexosRequest.input(`mensagemId${indice}`, sql.UniqueIdentifier, id);
      return `@mensagemId${indice}`;
    });

    const anexosResult = await anexosRequest.query<{
      mensagem_id: string;
      id: string;
      nome_arquivo: string;
      tipo_mime: string;
      tamanho_bytes: number;
      criado_em: string;
    }>(`
      SELECT
        CONVERT(VARCHAR(36), [mensagem_id]) AS [mensagem_id],
        CONVERT(VARCHAR(36), [id]) AS [id],
        [nome_arquivo],
        [tipo_mime],
        [tamanho_bytes],
        CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em]
      FROM dbo.portal_chamados_anexos
      WHERE [mensagem_id] IN (${parametros.join(", ")});
    `);

    for (const row of anexosResult.recordset) {
      const lista = anexosPorMensagem.get(row.mensagem_id) ?? [];
      lista.push({
        id: row.id,
        nomeArquivo: row.nome_arquivo,
        tipoMime: row.tipo_mime,
        tamanhoBytes: row.tamanho_bytes,
        criadoEm: row.criado_em,
      });
      anexosPorMensagem.set(row.mensagem_id, lista);
    }
  }

  return mensagensResult.recordset.map((row) => ({
    id: row.id,
    autorNome: row.autor_nome,
    autorTipo: row.autor_tipo as AutorTipoMensagem,
    interno: row.interno,
    texto: row.texto,
    criadoEm: row.criado_em,
    anexos: anexosPorMensagem.get(row.id) ?? [],
  }));
}

export async function buscarChamadoPorNumero(numero: number): Promise<Chamado | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("numero", sql.Int, numero);

  const result = await request.query<ChamadoRow>(`
    SELECT ${colunasChamado}
    ${juncoesChamado}
    WHERE c.[numero] = @numero;
  `);

  const row = result.recordset[0];
  if (!row) return null;

  const chamado = mapChamadoRow(row);
  chamado.mensagens = await carregarMensagens(chamado.id);

  return chamado;
}

export interface ContextoAcessoAnexo {
  chamadoId: string;
  setorId: string;
  solicitanteUsuarioId: string | null;
  solicitanteNome: string;
  mensagemInterna: boolean;
}

/*
 * Usado só para checar acesso antes de servir o download (ver
 * src/app/api/chamados/anexos/[id]/route.ts) — não traz o
 * `conteudo` (blob), que só é buscado depois da checagem passar.
 */
export async function buscarContextoAnexo(
  anexoId: string
): Promise<ContextoAcessoAnexo | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("anexoId", sql.UniqueIdentifier, anexoId);

  const result = await request.query<{
    chamado_id: string;
    setor_id: string;
    solicitante_usuario_id: string | null;
    solicitante_nome: string;
    interno: boolean;
  }>(`
    SELECT
      CONVERT(VARCHAR(36), c.[id]) AS [chamado_id],
      CONVERT(VARCHAR(36), c.[setor_id]) AS [setor_id],
      CONVERT(VARCHAR(36), c.[solicitante_usuario_id]) AS [solicitante_usuario_id],
      c.[solicitante_nome],
      CAST(m.[interno] AS BIT) AS [interno]
    FROM dbo.portal_chamados_anexos AS an
    INNER JOIN dbo.portal_chamados_mensagens AS m ON m.[id] = an.[mensagem_id]
    INNER JOIN dbo.portal_chamados AS c ON c.[id] = m.[chamado_id]
    WHERE an.[id] = @anexoId;
  `);

  const row = result.recordset[0];
  if (!row) return null;

  return {
    chamadoId: row.chamado_id,
    setorId: row.setor_id,
    solicitanteUsuarioId: row.solicitante_usuario_id,
    solicitanteNome: row.solicitante_nome,
    mensagemInterna: row.interno,
  };
}

export async function buscarAnexoConteudo(anexoId: string): Promise<{
  nomeArquivo: string;
  tipoMime: string;
  conteudo: Buffer;
} | null> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("anexoId", sql.UniqueIdentifier, anexoId);

  const result = await request.query<{
    nome_arquivo: string;
    tipo_mime: string;
    conteudo: Buffer;
  }>(`
    SELECT [nome_arquivo], [tipo_mime], [conteudo]
    FROM dbo.portal_chamados_anexos
    WHERE [id] = @anexoId;
  `);

  const row = result.recordset[0];
  if (!row) return null;

  return { nomeArquivo: row.nome_arquivo, tipoMime: row.tipo_mime, conteudo: row.conteudo };
}

export async function listarChamadosDoUsuario(
  usuarioId: string
): Promise<ChamadoResumo[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);

  const result = await request.query<ChamadoRow>(`
    SELECT ${colunasChamado}
    ${juncoesChamado}
    WHERE c.[solicitante_usuario_id] = @usuarioId
    ORDER BY c.[criado_em] DESC;
  `);

  return result.recordset.map(mapChamadoRow);
}

export interface FiltrosFila {
  /* null = sem restrição de setor (admin vê tudo) — controla ACESSO, não é o filtro escolhido na tela. */
  setorIds: string[] | null;
  /* Setor escolhido no filtro da tela — sempre aplicado por cima da restrição de acesso acima. */
  setorId?: string;
  empresa?: string;
  departamento?: string;
  categoriaId?: string;
  status?: StatusChamado;
  prioridade?: PrioridadeChamado;
  busca?: string;
  pagina: number;
  porPagina: number;
}

export async function listarFilaAtendimento(
  filtros: FiltrosFila
): Promise<{ itens: ChamadoResumo[]; total: number }> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  const condicoes: string[] = [];

  if (filtros.setorIds !== null) {
    if (filtros.setorIds.length === 0) {
      return { itens: [], total: 0 };
    }

    const parametros = filtros.setorIds.map((id, indice) => {
      request.input(`setorId${indice}`, sql.UniqueIdentifier, id);
      return `@setorId${indice}`;
    });

    condicoes.push(`c.[setor_id] IN (${parametros.join(", ")})`);
  }

  if (filtros.setorId) {
    request.input("setorIdFiltro", sql.UniqueIdentifier, filtros.setorId);
    condicoes.push(`c.[setor_id] = @setorIdFiltro`);
  }

  if (filtros.empresa) {
    request.input("empresaFiltro", sql.NVarChar(30), filtros.empresa);
    condicoes.push(`c.[empresa] = @empresaFiltro`);
  }

  if (filtros.departamento) {
    request.input("departamentoFiltro", sql.NVarChar(200), filtros.departamento);
    condicoes.push(`c.[solicitante_departamento] = @departamentoFiltro`);
  }

  if (filtros.categoriaId) {
    request.input("categoriaIdFiltro", sql.UniqueIdentifier, filtros.categoriaId);
    condicoes.push(`c.[categoria_id] = @categoriaIdFiltro`);
  }

  if (filtros.status) {
    request.input("status", sql.VarChar(30), filtros.status);
    condicoes.push(`c.[status] = @status`);
  }

  if (filtros.prioridade) {
    request.input("prioridade", sql.VarChar(10), filtros.prioridade);
    condicoes.push(`c.[prioridade] = @prioridade`);
  }

  if (filtros.busca) {
    request.input("busca", sql.NVarChar(200), `%${filtros.busca}%`);
    condicoes.push(
      `(c.[titulo] LIKE @busca OR c.[solicitante_nome] LIKE @busca OR CAST(c.[numero] AS NVARCHAR(20)) LIKE @busca)`
    );
  }

  const clausulaWhere = condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";

  const totalResult = await request.query<{ total: number }>(`
    SELECT COUNT(*) AS [total]
    FROM dbo.portal_chamados AS c
    ${clausulaWhere};
  `);

  const total = totalResult.recordset[0]?.total ?? 0;

  const porPagina = filtros.porPagina;
  const offset = (filtros.pagina - 1) * porPagina;

  request.input("offset", sql.Int, offset);
  request.input("porPagina", sql.Int, porPagina);

  const itensResult = await request.query<ChamadoRow>(`
    SELECT ${colunasChamado}
    ${juncoesChamado}
    ${clausulaWhere}
    ORDER BY c.[criado_em] DESC
    OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
  `);

  return { itens: itensResult.recordset.map(mapChamadoRow), total };
}

export interface AdicionarMensagemParams {
  chamadoId: string;
  autorUsuarioId: string | null;
  autorNome: string;
  autorTipo: AutorTipoMensagem;
  interno: boolean;
  texto: string;
  anexos: NovoAnexo[];
}

export async function adicionarMensagem(
  params: AdicionarMensagemParams
): Promise<ChamadoMensagem> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin();

  try {
    const insertMensagem = new sql.Request(transaction);
    insertMensagem.input("chamadoId", sql.UniqueIdentifier, params.chamadoId);
    insertMensagem.input("autorUsuarioId", sql.UniqueIdentifier, params.autorUsuarioId);
    insertMensagem.input("autorNome", sql.NVarChar(200), params.autorNome);
    insertMensagem.input("autorTipo", sql.VarChar(15), params.autorTipo);
    insertMensagem.input("interno", sql.Bit, params.interno);
    insertMensagem.input("texto", sql.NVarChar(sql.MAX), params.texto);

    const mensagemResult = await insertMensagem.query<{ id: string; criado_em: string }>(`
      INSERT INTO dbo.portal_chamados_mensagens
        ([chamado_id], [autor_usuario_id], [autor_nome], [autor_tipo], [interno], [texto])
      OUTPUT
        CONVERT(VARCHAR(36), INSERTED.[id]) AS [id],
        CONVERT(VARCHAR(33), INSERTED.[criado_em], 126) AS [criado_em]
      VALUES (@chamadoId, @autorUsuarioId, @autorNome, @autorTipo, @interno, @texto);
    `);

    const mensagemId = mensagemResult.recordset[0].id;

    await inserirAnexos(transaction, mensagemId, params.anexos);

    const atualizarChamado = new sql.Request(transaction);
    atualizarChamado.input("chamadoId", sql.UniqueIdentifier, params.chamadoId);
    await atualizarChamado.query(`
      UPDATE dbo.portal_chamados
      SET [atualizado_em] = SYSDATETIME()
      WHERE [id] = @chamadoId;
    `);

    await transaction.commit();

    const anexos = params.anexos.map((anexo, indice) => ({
      id: `pendente-${indice}`,
      nomeArquivo: anexo.nomeArquivo,
      tipoMime: anexo.tipoMime,
      tamanhoBytes: anexo.tamanhoBytes,
      criadoEm: mensagemResult.recordset[0].criado_em,
    }));

    return {
      id: mensagemId,
      autorNome: params.autorNome,
      autorTipo: params.autorTipo,
      interno: params.interno,
      texto: params.texto,
      criadoEm: mensagemResult.recordset[0].criado_em,
      anexos,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function atualizarPrioridade(
  chamadoId: string,
  prioridade: PrioridadeChamado
): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("chamadoId", sql.UniqueIdentifier, chamadoId);
  request.input("prioridade", sql.VarChar(10), prioridade);

  const result = await request.query(`
    UPDATE dbo.portal_chamados
    SET [prioridade] = @prioridade, [atualizado_em] = SYSDATETIME()
    WHERE [id] = @chamadoId;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function atualizarPublico(chamadoId: string, publico: boolean): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("chamadoId", sql.UniqueIdentifier, chamadoId);
  request.input("publico", sql.Bit, publico);

  const result = await request.query(`
    UPDATE dbo.portal_chamados
    SET [publico] = @publico, [atualizado_em] = SYSDATETIME()
    WHERE [id] = @chamadoId;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/*
 * Busca por palavra-chave usada em /chamados/consultar (pública,
 * sem exigir número+nome) — cada chamado só entra no resultado se
 * for do próprio usuário logado OU tiver sido marcado como
 * `publico` por um atendente (ver atualizarPublico). Sem sessão,
 * só os públicos aparecem. Casa contra o título e a descrição
 * (primeira mensagem da thread — ver criarChamado), sempre com
 * LIKE '%termo%' para achar "Como criar um chamado" ao digitar só
 * "chamado".
 */
export async function pesquisarChamados(
  termo: string,
  usuarioId: string | null
): Promise<ChamadoResumo[]> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("termo", sql.NVarChar(200), `%${termo}%`);
  request.input("usuarioId", sql.UniqueIdentifier, usuarioId);

  const result = await request.query<ChamadoRow>(`
    SELECT TOP (30) ${colunasChamado}
    ${juncoesChamado}
    WHERE
      (c.[publico] = 1 OR (@usuarioId IS NOT NULL AND c.[solicitante_usuario_id] = @usuarioId))
      AND (
        c.[titulo] LIKE @termo
        OR EXISTS (
          SELECT 1 FROM (
            SELECT TOP (1) m.[texto]
            FROM dbo.portal_chamados_mensagens AS m
            WHERE m.[chamado_id] = c.[id]
            ORDER BY m.[criado_em] ASC
          ) AS primeiraMensagem
          WHERE primeiraMensagem.[texto] LIKE @termo
        )
      )
    ORDER BY c.[criado_em] DESC;
  `);

  return result.recordset.map(mapChamadoRow);
}

export async function atribuirAtendente(
  chamadoId: string,
  atendenteUsuarioId: string | null
): Promise<boolean> {
  const pool = await getSqlServerPool();
  const request = pool.request();

  request.input("chamadoId", sql.UniqueIdentifier, chamadoId);
  request.input("atendenteUsuarioId", sql.UniqueIdentifier, atendenteUsuarioId);

  const result = await request.query(`
    UPDATE dbo.portal_chamados
    SET [atendente_usuario_id] = @atendenteUsuarioId, [atualizado_em] = SYSDATETIME()
    WHERE [id] = @chamadoId;
  `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

async function registrarMensagemSistema(
  transaction: InstanceType<typeof sql.Transaction>,
  chamadoId: string,
  texto: string
): Promise<void> {
  const request = new sql.Request(transaction);

  request.input("chamadoId", sql.UniqueIdentifier, chamadoId);
  request.input("texto", sql.NVarChar(sql.MAX), texto);

  await request.query(`
    INSERT INTO dbo.portal_chamados_mensagens
      ([chamado_id], [autor_usuario_id], [autor_nome], [autor_tipo], [texto])
    VALUES (@chamadoId, NULL, 'Sistema', 'sistema', @texto);
  `);
}

/*
 * Fluxo de aceite/confirmação (ver db/schema/0013_chamados_fluxo_aceite.sql):
 * aberto → (aceitarChamado) → em_andamento → (marcarComoResolvidoPendente)
 * → aguardando_confirmacao → (confirmarResolucao) → resolvido →
 * (fecharChamado) → fechado. `reabrirChamado` volta para em_andamento a
 * partir de aguardando_confirmacao, resolvido ou fechado. Cada transição
 * grava uma mensagem de sistema na conversa, para ficar auditável quem
 * fez o quê.
 */

/*
 * Só reivindica um chamado ainda sem atendente — reatribuir um
 * chamado já aceito por outra pessoa é feito por
 * `atribuirAtendente` (o Dropdown "Atendente responsável"), não
 * por aqui.
 */
export async function aceitarChamado(
  chamadoId: string,
  atendenteUsuarioId: string,
  atendenteNome: string
): Promise<boolean> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const request = new sql.Request(transaction);
    request.input("chamadoId", sql.UniqueIdentifier, chamadoId);
    request.input("atendenteUsuarioId", sql.UniqueIdentifier, atendenteUsuarioId);

    const result = await request.query(`
      UPDATE dbo.portal_chamados
      SET
        [atendente_usuario_id] = @atendenteUsuarioId,
        [status] = CASE WHEN [status] = 'aberto' THEN 'em_andamento' ELSE [status] END,
        [atualizado_em] = SYSDATETIME()
      WHERE [id] = @chamadoId
        AND [atendente_usuario_id] IS NULL
        AND [status] IN ('aberto', 'em_andamento');
    `);

    const sucesso = (result.rowsAffected[0] ?? 0) > 0;

    if (sucesso) {
      await registrarMensagemSistema(
        transaction,
        chamadoId,
        `${atendenteNome} aceitou o chamado.`
      );
    }

    await transaction.commit();
    return sucesso;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function transicionarStatus(params: {
  chamadoId: string;
  statusPermitidos: StatusChamado[];
  novoStatus: StatusChamado;
  mensagemSistema: string;
}): Promise<boolean> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const request = new sql.Request(transaction);
    request.input("chamadoId", sql.UniqueIdentifier, params.chamadoId);
    request.input("novoStatus", sql.VarChar(30), params.novoStatus);

    const parametrosStatus = params.statusPermitidos.map((status, indice) => {
      request.input(`statusPermitido${indice}`, sql.VarChar(30), status);
      return `@statusPermitido${indice}`;
    });

    const result = await request.query(`
      UPDATE dbo.portal_chamados
      SET
        [status] = @novoStatus,
        [atualizado_em] = SYSDATETIME(),
        [resolvido_em] = CASE WHEN @novoStatus = 'resolvido' THEN SYSDATETIME() ELSE [resolvido_em] END,
        [fechado_em] = CASE WHEN @novoStatus = 'fechado' THEN SYSDATETIME() ELSE [fechado_em] END
        ${params.novoStatus === "em_andamento" ? ", [resolvido_em] = NULL, [fechado_em] = NULL" : ""}
      WHERE [id] = @chamadoId
        AND [status] IN (${parametrosStatus.join(", ")});
    `);

    const sucesso = (result.rowsAffected[0] ?? 0) > 0;

    if (sucesso) {
      await registrarMensagemSistema(transaction, params.chamadoId, params.mensagemSistema);
    }

    await transaction.commit();
    return sucesso;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/*
 * Um atendente pode marcar como resolvido direto de "aberto"
 * (sem passar por aceitarChamado antes) — atalho intencional.
 * Pra não deixar o chamado sem atendente registrado (o que
 * distorce métricas de desempenho), esta função também
 * reivindica o chamado pra quem está resolvendo, caso ainda
 * ninguém tenha aceitado.
 */
export async function marcarComoResolvidoPendente(
  chamadoId: string,
  atendenteUsuarioId: string,
  atendenteNome: string
): Promise<boolean> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const request = new sql.Request(transaction);
    request.input("chamadoId", sql.UniqueIdentifier, chamadoId);
    request.input("atendenteUsuarioId", sql.UniqueIdentifier, atendenteUsuarioId);

    const result = await request.query(`
      UPDATE dbo.portal_chamados
      SET
        [status] = 'aguardando_confirmacao',
        [atendente_usuario_id] = ISNULL([atendente_usuario_id], @atendenteUsuarioId),
        [atualizado_em] = SYSDATETIME()
      WHERE [id] = @chamadoId
        AND [status] IN ('aberto', 'em_andamento');
    `);

    const sucesso = (result.rowsAffected[0] ?? 0) > 0;

    if (sucesso) {
      await registrarMensagemSistema(
        transaction,
        chamadoId,
        `${atendenteNome} marcou o chamado como resolvido. Aguardando confirmação do solicitante.`
      );
    }

    await transaction.commit();
    return sucesso;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function confirmarResolucao(
  chamadoId: string,
  autorNome: string
): Promise<boolean> {
  return transicionarStatus({
    chamadoId,
    statusPermitidos: ["aguardando_confirmacao"],
    novoStatus: "resolvido",
    mensagemSistema: `${autorNome} confirmou a resolução do chamado.`,
  });
}

export async function reabrirChamado(chamadoId: string, autorNome: string): Promise<boolean> {
  return transicionarStatus({
    chamadoId,
    statusPermitidos: ["aguardando_confirmacao", "resolvido", "fechado"],
    novoStatus: "em_andamento",
    mensagemSistema: `${autorNome} reabriu o chamado.`,
  });
}

export async function fecharChamado(chamadoId: string, autorNome: string): Promise<boolean> {
  return transicionarStatus({
    chamadoId,
    statusPermitidos: ["resolvido"],
    novoStatus: "fechado",
    mensagemSistema: `${autorNome} fechou o chamado.`,
  });
}

/*
 * Transferir para outro atendente do mesmo setor OU para outro
 * setor inteiro (com ou sem atendente já escolhido lá). Se o setor
 * mudar de fato, a categoria é zerada — categorias pertencem a um
 * setor específico (ver portal_chamados_categorias), então uma
 * categoria do setor antigo não faz sentido no novo.
 */
export async function transferirChamado(params: {
  chamadoId: string;
  novoSetorId: string;
  novoAtendenteUsuarioId: string | null;
  autorNome: string;
  setorAnteriorNome: string;
  setorNovoNome: string;
}): Promise<boolean> {
  const pool = await getSqlServerPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const request = new sql.Request(transaction);
    request.input("chamadoId", sql.UniqueIdentifier, params.chamadoId);
    request.input("novoSetorId", sql.UniqueIdentifier, params.novoSetorId);
    request.input(
      "novoAtendenteUsuarioId",
      sql.UniqueIdentifier,
      params.novoAtendenteUsuarioId
    );

    const result = await request.query(`
      UPDATE dbo.portal_chamados
      SET
        [categoria_id] = CASE WHEN [setor_id] = @novoSetorId THEN [categoria_id] ELSE NULL END,
        [setor_id] = @novoSetorId,
        [atendente_usuario_id] = @novoAtendenteUsuarioId,
        [atualizado_em] = SYSDATETIME()
      WHERE [id] = @chamadoId
        AND [status] <> 'fechado';
    `);

    const sucesso = (result.rowsAffected[0] ?? 0) > 0;

    if (sucesso) {
      const mensagemSistema =
        params.setorAnteriorNome === params.setorNovoNome
          ? `${params.autorNome} transferiu o chamado para outro atendente.`
          : `${params.autorNome} transferiu o chamado do setor "${params.setorAnteriorNome}" para "${params.setorNovoNome}".`;

      await registrarMensagemSistema(transaction, params.chamadoId, mensagemSistema);
    }

    await transaction.commit();
    return sucesso;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
