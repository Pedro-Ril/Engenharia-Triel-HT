import "server-only";

import { getSqlServerPool } from "@/lib/database/sql-server";

import type { StatusEquipamento, TipoAcaoMovimentacao } from "./estoque-equipamentos-usados";
import {
  calcularPainelGerencial,
  type EquipamentoGerencial,
  type MovimentacaoGerencial,
  type PainelGerencial,
} from "./painel-gerencial-regras";

/*
 * Página 2 do painel gerencial ("quanto vale e há quanto tempo"): o mesmo
 * estoque da página 1, em valor e tempo. Base sempre os números do Portal
 * (valor do cadastro do equipamento e movimentações do extrato, que já
 * incluem as trazidas do ERP) -- os valores batem com os da página 1.
 * O cálculo em si é puro (painel-gerencial-regras.ts).
 */
export async function obterDadosPainelGerencial(): Promise<PainelGerencial> {
  const pool = await getSqlServerPool();

  const [equipamentos, movimentacoes] = await Promise.all([
    pool.request().query<{
      id: string;
      numero: number;
      status: StatusEquipamento;
      valor: number | null;
      tipo_nome: string | null;
    }>(`
      SELECT CONVERT(VARCHAR(36), e.[id]) AS [id], e.[numero], e.[status], e.[valor], t.[nome] AS [tipo_nome]
      FROM dbo.com_estoque_equipamentos_usados AS e
      LEFT JOIN dbo.com_estoque_tipos_equipamento AS t ON t.[id] = e.[tipo_equipamento_id];
    `),
    pool.request().query<{
      equipamento_id: string;
      tipo_acao: TipoAcaoMovimentacao;
      data_acao: string;
      motivo_baixa: string | null;
      destinatario_nome: string | null;
    }>(`
      SELECT CONVERT(VARCHAR(36), [equipamento_id]) AS [equipamento_id], [tipo_acao],
             CONVERT(VARCHAR(10), [data_acao], 23) AS [data_acao], [motivo_baixa], [destinatario_nome]
      FROM dbo.com_estoque_equipamentos_usados_movimentacoes
      ORDER BY [equipamento_id], [data_acao], [criado_em];
    `),
  ]);

  const lista: EquipamentoGerencial[] = equipamentos.recordset.map((e) => ({
    id: e.id,
    numero: e.numero,
    status: e.status,
    valor: e.valor === null ? 0 : Number(e.valor),
    tipoNome: e.tipo_nome ?? "Sem tipo",
  }));
  const movs: MovimentacaoGerencial[] = movimentacoes.recordset.map((m) => ({
    equipamentoId: m.equipamento_id,
    tipoAcao: m.tipo_acao,
    dataAcao: m.data_acao,
    motivoBaixa: m.motivo_baixa,
    destinatarioNome: m.destinatario_nome,
  }));

  return calcularPainelGerencial(lista, movs, new Date().toLocaleDateString("sv-SE"));
}
