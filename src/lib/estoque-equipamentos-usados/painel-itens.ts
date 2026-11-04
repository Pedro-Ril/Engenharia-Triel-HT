import "server-only";

import { getSqlServerPool, sql } from "@/lib/database/sql-server";

import type { CondicaoEquipamento, StatusEquipamento } from "./estoque-equipamentos-usados";
import {
  blocoValeParaCondicao,
  COLUNA_EQUIPAMENTO_POR_CHAVE_SISTEMA,
  listarBlocosDoTipo,
  listarCamposDoTipo,
  listarTiposEquipamento,
  type CampoTipoEquipamento,
} from "./tipos-equipamento";
import { camposParaCondicao } from "@/modules/estoque-equipamentos-usados/utils/campos-condicao";

/*
 * BI de itens (TV): uma tabela por tipo de equipamento com cada item que
 * não foi baixado e as informações técnicas marcadas em Administração →
 * Tipos ("Mostrar no BI de itens"). Uma página para usados e outra para
 * novos. Os valores já saem formatados para exibir.
 */

export interface ColunaPainelItens {
  chave: string;
  rotulo: string;
}

export interface LinhaPainelItens {
  id: string;
  numero: number;
  descricao: string;
  status: StatusEquipamento;
  comQuem: string | null;
  valores: Record<string, string>;
}

export interface TipoPainelItens {
  tipoId: string;
  tipoNome: string;
  colunas: ColunaPainelItens[];
  linhas: LinhaPainelItens[];
}

export interface PainelItens {
  condicao: CondicaoEquipamento;
  totalItens: number;
  tipos: TipoPainelItens[];
  atualizadoEm: string;
}

interface ItemRow {
  id: string;
  numero: number;
  descricao: string;
  status: StatusEquipamento;
  tipo_equipamento_id: string | null;
  campos_valores: string | null;
  com_quem: string | null;
  empresa_nome: string | null;
  [coluna: string]: unknown;
}

const VAZIO = "—";

function formatarData(valor: unknown): string {
  const texto = String(valor ?? "").slice(0, 10);
  const partes = texto.split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : texto || VAZIO;
}

/* A unidade vai no cabeçalho da coluna (ver rotuloColuna), não em cada célula. */
function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/* "Capacidade (m³)" e "Capacidade (t)": sem a unidade, duas colunas teriam o mesmo título. */
function rotuloColuna(campo: CampoTipoEquipamento): string {
  return campo.unidade && !campo.ehSistema ? `${campo.rotulo} (${campo.unidade})` : campo.rotulo;
}

function formatarCampo(campo: CampoTipoEquipamento, item: ItemRow, camposValores: Record<string, unknown>): string {
  if (campo.ehSistema) {
    const coluna = COLUNA_EQUIPAMENTO_POR_CHAVE_SISTEMA[campo.chave];
    if (!coluna) return VAZIO;
    const valor = item[coluna];
    if (valor === null || valor === undefined || valor === "") return VAZIO;
    if (coluna === "valor") return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (coluna === "erp_data_entrada") return formatarData(valor);
    if (coluna === "codigo_empresa") return item.empresa_nome ? `${valor} | ${item.empresa_nome}` : String(valor);
    return String(valor);
  }

  const valor = camposValores[campo.chave];
  if (valor === null || valor === undefined || valor === "") return VAZIO;
  if (Array.isArray(valor)) return valor.length ? valor.join(", ") : VAZIO;
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (campo.tipoDado === "numero" && Number.isFinite(Number(valor))) return formatarNumero(Number(valor));
  if (campo.tipoDado === "data") return formatarData(valor);
  return String(valor);
}

export async function obterPainelItens(condicao: CondicaoEquipamento): Promise<PainelItens> {
  const pool = await getSqlServerPool();

  const [tipos, itensResult] = await Promise.all([
    listarTiposEquipamento(true),
    pool
      .request()
      .input("condicao", sql.VarChar(10), condicao)
      .query<ItemRow>(`
        SELECT
          CONVERT(VARCHAR(36), e.[id]) AS [id], e.[numero], e.[descricao], e.[status],
          CONVERT(VARCHAR(36), e.[tipo_equipamento_id]) AS [tipo_equipamento_id],
          e.[campos_valores], e.[nome_cliente], e.[valor], e.[marca], e.[modelo], e.[numero_serie],
          e.[codigo_empresa], e.[numero_nf_entrada], e.[erp_codigo_item], e.[erp_id_item],
          CONVERT(VARCHAR(10), e.[erp_data_entrada], 23) AS [erp_data_entrada], e.[observacoes],
          emp.[nome] AS [empresa_nome],
          fora.[destinatario_nome] AS [com_quem]
        FROM dbo.com_estoque_equipamentos_usados AS e
        LEFT JOIN dbo.portal_empresas AS emp ON emp.[codigo] = e.[codigo_empresa]
        /* Com quem está: a última saída (empréstimo, consignação ou reforma), quando está fora. */
        OUTER APPLY (
          SELECT TOP (1) m.[destinatario_nome]
          FROM dbo.com_estoque_equipamentos_usados_movimentacoes AS m
          WHERE m.[equipamento_id] = e.[id] AND m.[tipo_acao] IN ('emprestimo', 'consignacao', 'reforma')
          ORDER BY m.[data_acao] DESC, m.[criado_em] DESC
        ) AS fora
        WHERE e.[condicao] = @condicao AND e.[status] <> 'baixado'
        ORDER BY e.[numero];
      `),
  ]);

  const itensPorTipo = new Map<string, ItemRow[]>();
  for (const item of itensResult.recordset) {
    const chave = item.tipo_equipamento_id ?? "";
    itensPorTipo.set(chave, [...(itensPorTipo.get(chave) ?? []), item]);
  }

  const resultado: TipoPainelItens[] = [];
  for (const tipo of tipos) {
    const itens = itensPorTipo.get(tipo.id);
    if (!itens?.length) continue;

    const [campos, blocos] = await Promise.all([listarCamposDoTipo(tipo.id, true), listarBlocosDoTipo(tipo.id, true)]);
    const blocosValidos = new Set(blocos.filter((bloco) => blocoValeParaCondicao(bloco, condicao)).map((bloco) => bloco.id));
    const camposDoBi = camposParaCondicao(campos, condicao).filter(
      (campo) => campo.mostrarBiItens && blocosValidos.has(campo.blocoId)
    );

    resultado.push({
      tipoId: tipo.id,
      tipoNome: tipo.nome,
      colunas: camposDoBi.map((campo) => ({ chave: campo.chave, rotulo: rotuloColuna(campo) })),
      linhas: itens.map((item) => {
        let camposValores: Record<string, unknown> = {};
        try {
          camposValores = item.campos_valores ? (JSON.parse(item.campos_valores) as Record<string, unknown>) : {};
        } catch {
          camposValores = {};
        }
        return {
          id: item.id,
          numero: item.numero,
          descricao: item.descricao,
          status: item.status,
          comQuem: item.status === "em_estoque" ? null : item.com_quem,
          valores: Object.fromEntries(camposDoBi.map((campo) => [campo.chave, formatarCampo(campo, item, camposValores)])),
        };
      }),
    });
  }

  return {
    condicao,
    totalItens: resultado.reduce((soma, tipo) => soma + tipo.linhas.length, 0),
    tipos: resultado,
    atualizadoEm: new Date().toISOString(),
  };
}
