import "server-only";

import fs from "fs/promises";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import { buscarNoIndice, escolherDxf, listarDxfRecursivo } from "./dxf-indice";
import type { ModuloLantek } from "./eventos";

/*
 * Registro de cada exportação da planilha do Lantek (Agro e VE), linha a
 * linha (tabelas integra_lantek_exportacoes / _itens, migração 0156). Serve
 * para analisar DXF trocado: guarda o DXF que foi para a planilha, o que o
 * servidor escolheria na hora (mesma regra da validação, ver dxf-indice),
 * todos os candidatos pelo código do item e pelo do desenho, data/tamanho
 * do arquivo e alertas. Grava junto o evento "exportacao" da tela de
 * Registros (integra_lantek_eventos). Nunca derruba a exportação: falha aqui
 * só vai para o console.
 */

export interface LinhaExportadaLantek {
  numOrdem: string;
  numLote: string;
  codItem: string;
  codDesenho: string;
  qtde: string;
  /* Caminho que foi para a planilha (o da tela ou, sem ele, o montado pelo código). */
  dxfExportado: string;
  /* A tela mandou um caminho já validado (false = montado na exportação, sem validação). */
  veioDaTela: boolean;
}

function normalizarCaminho(caminho: string): string {
  return caminho.trim().replace(/\//g, "\\").toLowerCase();
}

async function infoArquivo(caminho: string): Promise<{ modificadoEm: Date | null; tamanho: number | null; existe: boolean }> {
  if (!caminho) return { modificadoEm: null, tamanho: null, existe: false };
  try {
    const stat = await fs.stat(caminho);
    return { modificadoEm: stat.mtime, tamanho: stat.size, existe: true };
  } catch {
    return { modificadoEm: null, tamanho: null, existe: false };
  }
}

async function montarItens(linhas: LinhaExportadaLantek[], pastaDxf: string) {
  const indice = await listarDxfRecursivo(pastaDxf);

  return Promise.all(
    linhas.map(async (linha, indiceLinha) => {
      const codItem = linha.codItem.trim();
      const codDesenho = linha.codDesenho.trim();
      const escolha = escolherDxf(indice, codItem, codDesenho);
      const candidatosCodigo = codItem ? buscarNoIndice(indice, codItem).map((a) => a.caminho) : [];
      const candidatosDesenho =
        codDesenho && codDesenho.toLowerCase() !== codItem.toLowerCase()
          ? buscarNoIndice(indice, codDesenho).map((a) => a.caminho)
          : [];
      const arquivo = await infoArquivo(linha.dxfExportado);
      const dxfServidor = escolha.principal?.caminho ?? "";

      const alertas: string[] = [];
      if (!linha.dxfExportado) alertas.push("Linha sem DXF na planilha");
      else if (!arquivo.existe) alertas.push("DXF da planilha não existe na pasta");
      if (!linha.veioDaTela && linha.dxfExportado) alertas.push("Caminho montado na exportação, sem validação");
      if (dxfServidor && linha.dxfExportado && normalizarCaminho(dxfServidor) !== normalizarCaminho(linha.dxfExportado)) {
        alertas.push("DXF da planilha diferente do que a validação escolhe agora");
      }
      if (escolha.encontrados.length > 1) {
        alertas.push(`${escolha.encontrados.length} DXFs com o nome ${escolha.codigoUsado}`);
      }
      if (candidatosCodigo.length > 0 && candidatosDesenho.length > 0) {
        alertas.push("Há DXF com o código do item e outro com o código do desenho (a validação usa o do item)");
      }

      return {
        linha: indiceLinha + 1,
        numOrdem: linha.numOrdem.slice(0, 30) || null,
        numLote: linha.numLote.slice(0, 30) || null,
        codItem: codItem.slice(0, 60) || null,
        codDesenho: codDesenho.slice(0, 60) || null,
        qtde: linha.qtde.slice(0, 30) || null,
        dxfExportado: linha.dxfExportado.slice(0, 500) || null,
        dxfServidor: dxfServidor.slice(0, 500) || null,
        origemServidor: escolha.origem || null,
        candidatosCodigo: candidatosCodigo.length ? JSON.stringify(candidatosCodigo) : null,
        candidatosDesenho: candidatosDesenho.length ? JSON.stringify(candidatosDesenho) : null,
        dxfModificadoEm: arquivo.modificadoEm ? arquivo.modificadoEm.toISOString() : null,
        dxfTamanho: arquivo.tamanho,
        alertas: alertas.length ? alertas.join(" | ").slice(0, 1000) : null,
      };
    })
  );
}

export async function registrarExportacaoLantek(params: {
  modulo: ModuloLantek;
  status: "sucesso" | "erro";
  arquivo: string | null;
  pastaDxf: string | null;
  linhas: LinhaExportadaLantek[];
  mensagemErro?: string | null;
  usuarioId: string | null;
  usuarioNome: string | null;
}): Promise<void> {
  try {
    const itens = params.pastaDxf ? await montarItens(params.linhas, params.pastaDxf) : [];
    const totalAlertas = itens.filter((item) => item.alertas).length;
    const ordens = [...new Set(params.linhas.map((linha) => linha.numOrdem.trim()).filter(Boolean))];
    const resumo =
      params.status === "sucesso"
        ? `Exportação: ${params.linhas.length} linha(s), ${totalAlertas} com alerta · ordens ${ordens.slice(0, 12).join(", ")}${ordens.length > 12 ? "…" : ""}`
        : `Exportação com erro: ${params.mensagemErro ?? "erro"}`;

    const pool = await getSqlServerPool();
    await pool
      .request()
      .input("modulo", sql.VarChar(10), params.modulo)
      .input("status", sql.VarChar(10), params.status)
      .input("arquivo", sql.NVarChar(500), params.arquivo)
      .input("pastaDxf", sql.NVarChar(500), params.pastaDxf)
      .input("totalLinhas", sql.Int, params.linhas.length)
      .input("totalAlertas", sql.Int, totalAlertas)
      .input("mensagemErro", sql.NVarChar(2000), params.mensagemErro?.slice(0, 2000) ?? null)
      .input("usuarioId", sql.UniqueIdentifier, params.usuarioId)
      .input("usuarioNome", sql.NVarChar(150), params.usuarioNome)
      .input("itens", sql.NVarChar(sql.MAX), JSON.stringify(itens))
      .input("resumo", sql.NVarChar(400), resumo.slice(0, 400))
      .input("parametros", sql.NVarChar(sql.MAX), JSON.stringify({ arquivo: params.arquivo, ordens }))
      .query(`
        SET XACT_ABORT ON;
        BEGIN TRANSACTION;
        DECLARE @exportacao UNIQUEIDENTIFIER = NEWID();
        INSERT INTO dbo.integra_lantek_exportacoes
          ([id], [modulo], [status], [arquivo], [pasta_dxf], [total_linhas], [total_alertas], [mensagem_erro], [usuario_id], [usuario_nome])
        VALUES (@exportacao, @modulo, @status, @arquivo, @pastaDxf, @totalLinhas, @totalAlertas, @mensagemErro, @usuarioId, @usuarioNome);
        INSERT INTO dbo.integra_lantek_exportacao_itens
          ([exportacao_id], [linha], [num_ordem], [num_lote], [cod_item], [cod_desenho], [qtde], [dxf_exportado], [dxf_servidor],
           [origem_servidor], [candidatos_codigo], [candidatos_desenho], [dxf_modificado_em], [dxf_tamanho], [alertas])
        SELECT @exportacao, j.[linha], j.[numOrdem], j.[numLote], j.[codItem], j.[codDesenho], j.[qtde], j.[dxfExportado], j.[dxfServidor],
               j.[origemServidor], j.[candidatosCodigo], j.[candidatosDesenho],
               CONVERT(DATETIME2, j.[dxfModificadoEm], 127), j.[dxfTamanho], j.[alertas]
        FROM OPENJSON(@itens) WITH (
          [linha] INT, [numOrdem] NVARCHAR(30), [numLote] NVARCHAR(30), [codItem] NVARCHAR(60), [codDesenho] NVARCHAR(60),
          [qtde] NVARCHAR(30), [dxfExportado] NVARCHAR(500), [dxfServidor] NVARCHAR(500), [origemServidor] VARCHAR(15),
          [candidatosCodigo] NVARCHAR(MAX), [candidatosDesenho] NVARCHAR(MAX), [dxfModificadoEm] VARCHAR(40),
          [dxfTamanho] BIGINT, [alertas] NVARCHAR(1000)
        ) AS j;
        INSERT INTO dbo.integra_lantek_eventos
          ([modulo], [tipo], [sucesso], [resumo], [parametros], [total], [erro], [exportacao_id], [usuario_id], [usuario_nome])
        VALUES (@modulo, 'exportacao', CASE WHEN @status = 'sucesso' THEN 1 ELSE 0 END, @resumo, @parametros, @totalLinhas,
                @mensagemErro, @exportacao, @usuarioId, @usuarioNome);
        COMMIT TRANSACTION;
      `);
  } catch (erro) {
    console.error("Não foi possível registrar a exportação do Lantek (a exportação em si seguiu):", erro);
  }
}
