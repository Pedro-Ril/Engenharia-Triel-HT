import "server-only";

import fs from "fs/promises";
import { constants as fsConstants } from "fs";
import path from "path";
import * as XLSX from "xlsx";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import {
  lerAba,
  montarPlano,
  normalizarNome,
  numeroDoProjeto,
  pastasDoProjeto,
  type ItemPlano,
  type Plano,
} from "./separacao-regras";

/*
 * Engenharia Versátil -> separação da engenharia de um projeto.
 *
 * analisarPlanilha só LÊ (planilha, pasta do projeto, pastas de origem e
 * o que já existe no destino) e devolve a prévia. executarSeparacao
 * refaz a análise na hora (o disco pode ter mudado desde a prévia), cria
 * as pastas e copia com COPYFILE_EXCL: arquivo que já existe no destino
 * nunca é sobrescrito, e nada que já estava lá é apagado ou alterado.
 * Tudo vai para eng_versatil_separacoes / _itens.
 */

const win = path.win32;
const CONCORRENCIA_COPIA = 4;

/* ------------------------------------------------------------------ configuração */

export interface ConfigEngenhariaVersatil {
  pastaProjetos: string | null;
  pastaPdf: string | null;
  pastaDxf: string | null;
  abasBlacklist: string[];
  abasComDxf: string[];
  /* Abas que entram na conferência de pesos e fator de conversão (vazia = todas fora da blacklist). */
  abasFator: string[];
  /* API Oracle do ERP (rotas /api/fator-conversao), empresa e ambiente. */
  erpApiUrl: string | null;
  erpCodEmpresa: number | null;
  erpAmbiente: "teste" | "producao";
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

function lista(valor: string | null): string[] {
  return (valor ?? "")
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function buscarConfigEngenhariaVersatil(): Promise<ConfigEngenhariaVersatil> {
  const pool = await getSqlServerPool();
  const result = await pool.request().query<{
    pasta_projetos: string | null;
    pasta_pdf: string | null;
    pasta_dxf: string | null;
    abas_blacklist: string | null;
    abas_com_dxf: string | null;
    abas_fator: string | null;
    erp_api_url: string | null;
    erp_cod_empresa: number | null;
    erp_ambiente: string | null;
    atualizado_em: string | null;
    atualizado_por: string | null;
  }>(`
    SELECT [pasta_projetos], [pasta_pdf], [pasta_dxf], [abas_blacklist], [abas_com_dxf],
           [abas_fator], [erp_api_url], [erp_cod_empresa], [erp_ambiente],
           CONVERT(VARCHAR(33), [atualizado_em], 126) AS [atualizado_em], [atualizado_por]
    FROM dbo.eng_versatil_config WHERE [id] = 1;
  `);
  const row = result.recordset[0];
  return {
    pastaProjetos: row?.pasta_projetos ?? null,
    pastaPdf: row?.pasta_pdf ?? null,
    pastaDxf: row?.pasta_dxf ?? null,
    abasBlacklist: lista(row?.abas_blacklist ?? null),
    abasComDxf: lista(row?.abas_com_dxf ?? null),
    abasFator: lista(row?.abas_fator ?? null),
    erpApiUrl: row?.erp_api_url ?? null,
    erpCodEmpresa: row?.erp_cod_empresa ?? null,
    /* Qualquer coisa que não seja "producao" explícito é teste. */
    erpAmbiente: row?.erp_ambiente === "producao" ? "producao" : "teste",
    atualizadoEm: row?.atualizado_em ?? null,
    atualizadoPor: row?.atualizado_por ?? null,
  };
}

export async function salvarConfigEngenhariaVersatil(params: {
  pastaProjetos: string | null;
  pastaPdf: string | null;
  pastaDxf: string | null;
  abasBlacklist: string[];
  abasComDxf: string[];
  abasFator: string[];
  erpApiUrl: string | null;
  erpCodEmpresa: number | null;
  erpAmbiente: "teste" | "producao";
  atualizadoPor: string;
}): Promise<ConfigEngenhariaVersatil> {
  const pool = await getSqlServerPool();
  await pool
    .request()
    .input("pastaProjetos", sql.NVarChar(300), params.pastaProjetos)
    .input("pastaPdf", sql.NVarChar(300), params.pastaPdf)
    .input("pastaDxf", sql.NVarChar(300), params.pastaDxf)
    .input("abasBlacklist", sql.NVarChar(2000), params.abasBlacklist.join("\n") || null)
    .input("abasComDxf", sql.NVarChar(2000), params.abasComDxf.join("\n") || null)
    .input("abasFator", sql.NVarChar(2000), params.abasFator.join("\n") || null)
    .input("erpApiUrl", sql.NVarChar(300), params.erpApiUrl)
    .input("erpCodEmpresa", sql.Int, params.erpCodEmpresa)
    .input("erpAmbiente", sql.VarChar(10), params.erpAmbiente)
    .input("atualizadoPor", sql.NVarChar(150), params.atualizadoPor)
    .query(`
      MERGE dbo.eng_versatil_config AS destino
      USING (SELECT 1 AS [id]) AS origem ON destino.[id] = origem.[id]
      WHEN MATCHED THEN UPDATE SET
        [pasta_projetos] = @pastaProjetos, [pasta_pdf] = @pastaPdf, [pasta_dxf] = @pastaDxf,
        [abas_blacklist] = @abasBlacklist, [abas_com_dxf] = @abasComDxf,
        [abas_fator] = @abasFator,
        [erp_api_url] = @erpApiUrl, [erp_cod_empresa] = @erpCodEmpresa, [erp_ambiente] = @erpAmbiente,
        [atualizado_em] = SYSDATETIME(), [atualizado_por] = @atualizadoPor
      WHEN NOT MATCHED THEN INSERT
        ([id], [pasta_projetos], [pasta_pdf], [pasta_dxf], [abas_blacklist], [abas_com_dxf], [abas_fator],
         [erp_api_url], [erp_cod_empresa], [erp_ambiente], [atualizado_em], [atualizado_por])
        VALUES (1, @pastaProjetos, @pastaPdf, @pastaDxf, @abasBlacklist, @abasComDxf, @abasFator,
                @erpApiUrl, @erpCodEmpresa, @erpAmbiente, SYSDATETIME(), @atualizadoPor);
    `);
  return buscarConfigEngenhariaVersatil();
}

/* ------------------------------------------------------------------ análise (só leitura) */

export interface PreviaSeparacao {
  numeroProjeto: string;
  arquivoPlanilha: string;
  pastaProjeto: string;
  plano: Plano;
  totais: { pastasCriar: number; copiar: number; jaExistem: number; naoEncontrados: number };
}

async function nomesNaPasta(pasta: string, tipo: "arquivos" | "pastas", rotulo: string): Promise<string[]> {
  try {
    const entradas = await fs.readdir(pasta, { withFileTypes: true });
    return entradas.filter((e) => (tipo === "arquivos" ? e.isFile() : e.isDirectory())).map((e) => e.name);
  } catch (erro) {
    throw new ValidationError(
      `Não foi possível ler a ${rotulo} (${pasta}): ${erro instanceof Error ? erro.message : String(erro)}`
    );
  }
}

/* Arquivos que já existem em cada pasta de destino; pasta que não existe fica fora do mapa. */
async function lerDestino(pastaProjeto: string, caminhos: string[]): Promise<Map<string, Set<string>>> {
  const mapa = new Map<string, Set<string>>();
  for (const relativo of caminhos) {
    try {
      const entradas = await fs.readdir(win.join(pastaProjeto, relativo), { withFileTypes: true });
      mapa.set(normalizarNome(relativo), new Set(entradas.filter((e) => e.isFile()).map((e) => e.name.toLowerCase())));
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw erro;
    }
  }
  return mapa;
}

export function lerPlanilha(conteudo: Buffer) {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(conteudo, { type: "buffer" });
  } catch {
    throw new ValidationError("Não foi possível ler a planilha. Envie o arquivo .xls ou .xlsx do projeto.");
  }
  return workbook.SheetNames.map((nome) =>
    lerAba(nome, XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[nome], { header: 1, defval: "", blankrows: false }))
  );
}

export async function analisarPlanilha(conteudo: Buffer, nomeArquivo: string): Promise<PreviaSeparacao> {
  const numeroProjeto = numeroDoProjeto(nomeArquivo);
  if (!numeroProjeto) {
    throw new ValidationError(
      "O nome da planilha precisa começar com o número do projeto e um hífen (ex.: 1111 - CAÇAMBA STANDARD.xls)."
    );
  }

  const config = await buscarConfigEngenhariaVersatil();
  if (!config.pastaProjetos || !config.pastaPdf || (config.abasComDxf.length > 0 && !config.pastaDxf)) {
    throw new ValidationError(
      "As pastas da Engenharia Versátil não estão configuradas. Peça a um administrador para preencher em Administração > Configurações > Engenharia Versátil."
    );
  }

  const abas = lerPlanilha(conteudo);

  const candidatas = pastasDoProjeto(await nomesNaPasta(config.pastaProjetos, "pastas", "pasta dos projetos"), numeroProjeto);
  if (candidatas.length === 0) {
    throw new ValidationError(`Não existe pasta do projeto ${numeroProjeto} em ${config.pastaProjetos}. Nada foi feito.`);
  }
  if (candidatas.length > 1) {
    throw new ValidationError(
      `Há mais de uma pasta do projeto ${numeroProjeto} em ${config.pastaProjetos} (${candidatas.join(", ")}). Deixe só uma e tente de novo.`
    );
  }
  const pastaProjeto = win.join(config.pastaProjetos, candidatas[0]);

  const [arquivosPdf, arquivosDxf] = await Promise.all([
    nomesNaPasta(config.pastaPdf, "arquivos", "pasta de PDF"),
    config.pastaDxf ? nomesNaPasta(config.pastaDxf, "arquivos", "pasta de DXF") : Promise.resolve([]),
  ]);

  const base = { abas, blacklist: config.abasBlacklist, abasComDxf: config.abasComDxf, arquivosPdf, arquivosDxf };
  /* Primeira passada só para saber quais pastas de destino olhar; a segunda já sabe o que existe lá. */
  const rascunho = montarPlano({ ...base, existentesNoDestino: new Map() });
  const existentes = await lerDestino(pastaProjeto, rascunho.pastas.map((p) => p.caminho));
  const plano = montarPlano({ ...base, existentesNoDestino: existentes });

  return {
    numeroProjeto,
    arquivoPlanilha: nomeArquivo,
    pastaProjeto,
    plano,
    totais: {
      pastasCriar: plano.pastas.filter((p) => p.criar).length,
      copiar: plano.itens.filter((i) => i.situacao === "copiar").length,
      jaExistem: plano.itens.filter((i) => i.situacao === "ja_existe").length,
      naoEncontrados: plano.itens.filter((i) => i.situacao === "nao_encontrado").length,
    },
  };
}

/* ------------------------------------------------------------------ execução */

export type AcaoItem = "copiado" | "ja_existia" | "nao_encontrado" | "erro";

interface ResultadoItem extends ItemPlano {
  acao: AcaoItem;
  mensagem: string | null;
}

function dentroDe(pai: string, filho: string): boolean {
  const relativo = win.relative(win.resolve(pai), win.resolve(filho));
  return Boolean(relativo) && !relativo.startsWith("..") && !win.isAbsolute(relativo);
}

async function emLotes<T>(itens: T[], limite: number, fn: (item: T) => Promise<void>) {
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (proximo < itens.length) {
        const item = itens[proximo++];
        await fn(item);
      }
    })
  );
}

export async function executarSeparacao(
  conteudo: Buffer,
  nomeArquivo: string,
  usuario: { id: string; nomeExibicao: string }
): Promise<string> {
  const previa = await analisarPlanilha(conteudo, nomeArquivo);
  const config = await buscarConfigEngenhariaVersatil();
  const pool = await getSqlServerPool();

  const criada = await pool
    .request()
    .input("numero", sql.NVarChar(30), previa.numeroProjeto)
    .input("arquivo", sql.NVarChar(300), nomeArquivo)
    .input("pasta", sql.NVarChar(500), previa.pastaProjeto)
    .input("usuarioId", sql.UniqueIdentifier, usuario.id)
    .input("usuarioNome", sql.NVarChar(200), usuario.nomeExibicao)
    .query<{ id: string }>(`
      INSERT INTO dbo.eng_versatil_separacoes ([numero_projeto], [arquivo_planilha], [pasta_projeto], [status], [usuario_id], [usuario_nome])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@numero, @arquivo, @pasta, 'executando', @usuarioId, @usuarioNome);
    `);
  const id = criada.recordset[0].id;

  let pastasCriadas = 0;
  const resultados: ResultadoItem[] = [];
  try {
    for (const pasta of previa.plano.pastas.filter((p) => p.criar)) {
      const destino = win.join(previa.pastaProjeto, pasta.caminho);
      if (!dentroDe(previa.pastaProjeto, destino)) throw new Error(`Pasta fora do projeto: ${pasta.caminho}`);
      const primeira = await fs.mkdir(destino, { recursive: true });
      if (primeira) pastasCriadas++;
    }

    const porItem = new Map<ItemPlano, ResultadoItem>();
    await emLotes(previa.plano.itens, CONCORRENCIA_COPIA, async (item) => {
      if (item.situacao === "nao_encontrado") {
        porItem.set(item, { ...item, acao: "nao_encontrado", mensagem: "Arquivo não encontrado na pasta de origem." });
        return;
      }
      if (item.situacao === "ja_existe") {
        porItem.set(item, { ...item, acao: "ja_existia", mensagem: null });
        return;
      }
      const origem = win.join(item.tipo === "pdf" ? config.pastaPdf! : config.pastaDxf!, item.arquivo!);
      const destino = win.join(previa.pastaProjeto, item.pastaDestino, item.arquivo!);
      try {
        if (!dentroDe(previa.pastaProjeto, destino)) throw new Error("Destino fora da pasta do projeto.");
        await fs.copyFile(origem, destino, fsConstants.COPYFILE_EXCL);
        porItem.set(item, { ...item, acao: "copiado", mensagem: null });
      } catch (erro) {
        const codigo = (erro as NodeJS.ErrnoException).code;
        porItem.set(
          item,
          codigo === "EEXIST"
            ? { ...item, acao: "ja_existia", mensagem: null }
            : { ...item, acao: "erro", mensagem: (erro instanceof Error ? erro.message : String(erro)).slice(0, 1000) }
        );
      }
    });
    resultados.push(...previa.plano.itens.map((i) => porItem.get(i)!));
  } catch (erro) {
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("mensagem", sql.NVarChar(2000), (erro instanceof Error ? erro.message : String(erro)).slice(0, 2000))
      .input("pastas", sql.Int, pastasCriadas)
      .query(`UPDATE dbo.eng_versatil_separacoes SET [status] = 'erro', [mensagem] = @mensagem, [pastas_criadas] = @pastas, [finalizado_em] = SYSDATETIME() WHERE [id] = @id;`);
    throw erro;
  }

  for (const [ordem, r] of resultados.entries()) {
    await pool
      .request()
      .input("separacaoId", sql.UniqueIdentifier, id)
      .input("ordem", sql.Int, ordem + 1)
      .input("aba", sql.NVarChar(100), r.aba)
      .input("pasta", sql.NVarChar(300), r.pastaDestino)
      .input("codigo", sql.NVarChar(50), r.codigo)
      .input("tipo", sql.VarChar(5), r.tipo)
      .input("arquivo", sql.NVarChar(260), r.arquivo)
      .input("acao", sql.VarChar(20), r.acao)
      .input("mensagem", sql.NVarChar(1000), r.mensagem)
      .query(`
        INSERT INTO dbo.eng_versatil_separacoes_itens ([separacao_id], [ordem], [aba], [pasta_destino], [codigo], [tipo], [arquivo], [acao], [mensagem])
        VALUES (@separacaoId, @ordem, @aba, @pasta, @codigo, @tipo, @arquivo, @acao, @mensagem);
      `);
  }

  const conta = (acao: AcaoItem) => resultados.filter((r) => r.acao === acao).length;
  const motivos = {
    blacklist: () => "blacklist",
    sem_arquivos: (itens: number) => `${itens} itens, nenhum arquivo`,
    sem_cabecalho: () => "sem cabeçalho",
    nome_invalido: () => "nome inválido para pasta",
  };
  const ignoradas = previa.plano.abasIgnoradas.map((a) => `${a.aba} (${motivos[a.motivo](a.itens)})`);
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("pastas", sql.Int, pastasCriadas)
    .input("copiados", sql.Int, conta("copiado"))
    .input("existiam", sql.Int, conta("ja_existia"))
    .input("naoEncontrados", sql.Int, conta("nao_encontrado"))
    .input("erros", sql.Int, conta("erro"))
    .input("mensagem", sql.NVarChar(2000), ignoradas.length ? `Abas ignoradas: ${ignoradas.join(", ")}`.slice(0, 2000) : null)
    .query(`
      UPDATE dbo.eng_versatil_separacoes
      SET [status] = 'concluida', [pastas_criadas] = @pastas, [arquivos_copiados] = @copiados,
          [arquivos_ja_existiam] = @existiam, [arquivos_nao_encontrados] = @naoEncontrados,
          [arquivos_com_erro] = @erros, [mensagem] = @mensagem, [finalizado_em] = SYSDATETIME()
      WHERE [id] = @id;
    `);

  return id;
}

/* ------------------------------------------------------------------ leitura do registro */

export interface Separacao {
  id: string;
  numeroProjeto: string;
  arquivoPlanilha: string;
  pastaProjeto: string | null;
  status: "executando" | "concluida" | "erro";
  pastasCriadas: number;
  arquivosCopiados: number;
  arquivosJaExistiam: number;
  arquivosNaoEncontrados: number;
  arquivosComErro: number;
  mensagem: string | null;
  usuarioNome: string;
  criadoEm: string;
  finalizadoEm: string | null;
}

export interface ItemSeparacao {
  ordem: number;
  aba: string;
  pastaDestino: string;
  codigo: string;
  tipo: "pdf" | "dxf";
  arquivo: string | null;
  acao: AcaoItem;
  mensagem: string | null;
}

const COLUNAS = `
  CONVERT(VARCHAR(36), [id]) AS [id], [numero_projeto], [arquivo_planilha], [pasta_projeto], [status],
  [pastas_criadas], [arquivos_copiados], [arquivos_ja_existiam], [arquivos_nao_encontrados], [arquivos_com_erro],
  [mensagem], [usuario_nome], CONVERT(VARCHAR(33), [criado_em], 126) AS [criado_em],
  CONVERT(VARCHAR(33), [finalizado_em], 126) AS [finalizado_em]`;

type LinhaSeparacao = {
  id: string;
  numero_projeto: string;
  arquivo_planilha: string;
  pasta_projeto: string | null;
  status: Separacao["status"];
  pastas_criadas: number;
  arquivos_copiados: number;
  arquivos_ja_existiam: number;
  arquivos_nao_encontrados: number;
  arquivos_com_erro: number;
  mensagem: string | null;
  usuario_nome: string;
  criado_em: string;
  finalizado_em: string | null;
};

function paraSeparacao(l: LinhaSeparacao): Separacao {
  return {
    id: l.id,
    numeroProjeto: l.numero_projeto,
    arquivoPlanilha: l.arquivo_planilha,
    pastaProjeto: l.pasta_projeto,
    status: l.status,
    pastasCriadas: l.pastas_criadas,
    arquivosCopiados: l.arquivos_copiados,
    arquivosJaExistiam: l.arquivos_ja_existiam,
    arquivosNaoEncontrados: l.arquivos_nao_encontrados,
    arquivosComErro: l.arquivos_com_erro,
    mensagem: l.mensagem,
    usuarioNome: l.usuario_nome,
    criadoEm: l.criado_em,
    finalizadoEm: l.finalizado_em,
  };
}

export async function buscarSeparacao(id: string): Promise<{ separacao: Separacao; itens: ItemSeparacao[] } | null> {
  const pool = await getSqlServerPool();
  const linha = (
    await pool.request().input("id", sql.UniqueIdentifier, id).query<LinhaSeparacao>(`SELECT ${COLUNAS} FROM dbo.eng_versatil_separacoes WHERE [id] = @id;`)
  ).recordset[0];
  if (!linha) return null;

  const itens = await pool.request().input("id", sql.UniqueIdentifier, id).query<{
    ordem: number;
    aba: string;
    pasta_destino: string;
    codigo: string;
    tipo: "pdf" | "dxf";
    arquivo: string | null;
    acao: AcaoItem;
    mensagem: string | null;
  }>(`
    SELECT [ordem], [aba], [pasta_destino], [codigo], [tipo], [arquivo], [acao], [mensagem]
    FROM dbo.eng_versatil_separacoes_itens WHERE [separacao_id] = @id ORDER BY [ordem];
  `);

  return {
    separacao: paraSeparacao(linha),
    itens: itens.recordset.map((i) => ({
      ordem: i.ordem,
      aba: i.aba,
      pastaDestino: i.pasta_destino,
      codigo: i.codigo,
      tipo: i.tipo,
      arquivo: i.arquivo,
      acao: i.acao,
      mensagem: i.mensagem,
    })),
  };
}

/* Histórico paginado; filtra por parte do número do projeto e por parte do nome de quem fez. */
export async function listarSeparacoes(params: {
  pagina: number;
  porPagina: number;
  projeto?: string | null;
  usuario?: string | null;
}): Promise<{ itens: Separacao[]; total: number }> {
  const pool = await getSqlServerPool();
  const filtros: string[] = [];
  if (params.projeto) filtros.push("[numero_projeto] LIKE '%' + @projeto + '%'");
  if (params.usuario) filtros.push("[usuario_nome] LIKE '%' + @usuario + '%'");
  const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
  const comFiltros = () => {
    const r = pool.request();
    if (params.projeto) r.input("projeto", sql.NVarChar(30), params.projeto);
    if (params.usuario) r.input("usuario", sql.NVarChar(200), params.usuario);
    return r;
  };

  const [itens, total] = await Promise.all([
    comFiltros()
      .input("offset", sql.Int, (params.pagina - 1) * params.porPagina)
      .input("porPagina", sql.Int, params.porPagina)
      .query<LinhaSeparacao>(`
        SELECT ${COLUNAS} FROM dbo.eng_versatil_separacoes
        ${where}
        ORDER BY [criado_em] DESC OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY;
      `),
    comFiltros().query<{ total: number }>(`SELECT COUNT(*) AS [total] FROM dbo.eng_versatil_separacoes ${where};`),
  ]);
  return { itens: itens.recordset.map(paraSeparacao), total: total.recordset[0]?.total ?? 0 };
}
