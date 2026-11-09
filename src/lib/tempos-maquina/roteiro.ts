import "server-only";

import fs from "fs/promises";
import path from "path";

import { ValidationError } from "@/lib/auth/errors";
import { listarPastasPorEmpresa } from "@/lib/conferencia-derivados/config";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import type { ConfigTemposRoteiro } from "@/modules/tempos-maquina/types/temposMaquina.types";

import { listarMateriais, listarPerfis } from "./cadastro";
import { calcularTempo } from "./calculo";
import { lerGeometriaDxf, type ResultadoGeometriaDxf } from "./dxf-geometria";
import type { DadosPeca, ResultadoTempo } from "./tipos";

/*
 * O cálculo automático de tempo dentro do Roteiro de Fabricação: o que
 * está ativo (perfis, máquinas, materiais), o DXF do item e o registro de
 * cada tempo usado (eng_tempos_calculos, migração 0161).
 */

/* Só perfis ATIVOS e as máquinas ligadas a eles: é o que o Roteiro pode usar. */
export async function carregarConfigRoteiro(): Promise<ConfigTemposRoteiro> {
  const [perfis, materiais] = await Promise.all([listarPerfis(), listarMateriais()]);
  const ativos = perfis.filter((p) => p.ativo);

  return {
    perfis: ativos.map((p) => ({ id: p.id, nome: p.nome, parametros: p.parametros })),
    maquinas: ativos.flatMap((p) => p.maquinas.map((m) => ({ codRecurso: m.codRecurso.toUpperCase(), perfilId: p.id }))),
    materiais: materiais
      .filter((m) => m.ativo)
      .map((m) => ({ nome: m.nome, termos: m.termos, densidade: m.densidade, variante: m.variante, ordem: m.ordem, ativo: m.ativo })),
  };
}

/* ---------------- DXF do item ---------------- */

const CODIGO_EMPRESA_TRIEL = "2";
/* Subpastas conhecidas da pasta de DXF da Triel (a raiz vem primeiro). */
const SUBPASTAS_DXF = ["", "CIBER"];
const TAMANHO_MAXIMO_DXF = 20 * 1024 * 1024;

export function limparCodigoItem(codigo: string): string {
  return String(codigo || "").trim().replace(/[^0-9A-Za-z_-]/g, "");
}

/*
 * Procura "<código>.dxf" pelo nome, sem listar a pasta (são ~45 mil
 * arquivos na rede -- a mesma razão de localizarPdfsDoItem): raiz e
 * subpastas conhecidas da pasta de DXF configurada para a Triel-HT em
 * Conferência de Derivados.
 */
export async function lerDxfDoItem(
  codigo: string
): Promise<{ arquivo: string; caminho: string; leitura: ResultadoGeometriaDxf } | null> {
  const limpo = limparCodigoItem(codigo);
  if (!limpo) throw new ValidationError("Código do item inválido.");

  const triel = (await listarPastasPorEmpresa()).find((e) => e.empresaCodigo?.trim() === CODIGO_EMPRESA_TRIEL);
  const pasta = triel?.pastaDxf?.trim();
  if (!pasta) throw new ValidationError("A pasta de DXF da Triel-HT não está configurada (Administração > Configurações > Conferência de Derivados).");

  for (const subpasta of SUBPASTAS_DXF) {
    const caminho = path.join(pasta, subpasta, `${limpo}.dxf`);
    let info;
    try {
      info = await fs.stat(caminho);
    } catch {
      continue;
    }
    if (!info.isFile()) continue;
    if (info.size > TAMANHO_MAXIMO_DXF) throw new ValidationError(`O DXF ${path.basename(caminho)} é grande demais para ler aqui.`);

    const texto = await fs.readFile(caminho, "latin1");
    return { arquivo: path.basename(caminho), caminho, leitura: lerGeometriaDxf(texto) };
  }

  return null;
}

/* ---------------- Registro ---------------- */

export async function registrarCalculo(params: {
  codItem: string;
  revisao: string | null;
  alternativo: number | null;
  seq: number | null;
  codRecurso: string;
  origemGeometria: "dxf" | "manual";
  arquivoDxf: string | null;
  dados: DadosPeca;
  /* Contexto só para o registro (matéria-prima, peso do 3DX...). */
  contexto: Record<string, unknown>;
  usuario: { id: string; nome: string };
}): Promise<{ id: string; perfilNome: string; resultado: ResultadoTempo }> {
  const config = await carregarConfigRoteiro();
  const codRecurso = params.codRecurso.trim().toUpperCase();
  const ligacao = config.maquinas.find((m) => m.codRecurso === codRecurso);
  const perfil = ligacao && config.perfis.find((p) => p.id === ligacao.perfilId);
  if (!perfil) throw new ValidationError(`A máquina ${codRecurso} não tem perfil de cálculo ativo.`);

  /* Recalculado aqui: o que fica registrado (e vai para o campo) é o do servidor. */
  const resultado = calcularTempo(perfil.parametros, params.dados);
  if (!resultado.ok || resultado.tempoMin === null) {
    throw new ValidationError(resultado.erros.join(" ") || "Não deu para calcular o tempo.");
  }

  const pool = await getSqlServerPool();
  const r = await pool
    .request()
    .input("codItem", sql.VarChar(40), params.codItem)
    .input("revisao", sql.NVarChar(20), params.revisao)
    .input("alternativo", sql.Int, params.alternativo)
    .input("seq", sql.Int, params.seq)
    .input("codRecurso", sql.VarChar(30), codRecurso)
    .input("perfilId", sql.UniqueIdentifier, perfil.id)
    .input("perfilNome", sql.NVarChar(150), perfil.nome)
    .input("tempo", sql.Decimal(18, 6), Number(resultado.tempoMin.toFixed(6)))
    .input("origem", sql.VarChar(10), params.origemGeometria)
    .input("arquivo", sql.NVarChar(400), params.arquivoDxf)
    .input("dados", sql.NVarChar(sql.MAX), JSON.stringify({ ...params.contexto, peca: params.dados }))
    .input("resultado", sql.NVarChar(sql.MAX), JSON.stringify(resultado))
    .input("usuarioId", sql.UniqueIdentifier, params.usuario.id)
    .input("usuarioNome", sql.NVarChar(150), params.usuario.nome)
    .query<{ id: string }>(`
      INSERT INTO dbo.eng_tempos_calculos
        ([cod_item], [revisao], [alternativo], [seq], [cod_recurso], [perfil_id], [perfil_nome], [tempo_min],
         [origem_geometria], [arquivo_dxf], [dados], [resultado], [usuario_id], [usuario_nome])
      OUTPUT CONVERT(VARCHAR(36), INSERTED.[id]) AS [id]
      VALUES (@codItem, @revisao, @alternativo, @seq, @codRecurso, @perfilId, @perfilNome, @tempo,
              @origem, @arquivo, @dados, @resultado, @usuarioId, @usuarioNome);
    `);

  return { id: r.recordset[0].id.toLowerCase(), perfilNome: perfil.nome, resultado };
}
