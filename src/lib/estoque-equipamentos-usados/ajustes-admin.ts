import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { getSqlServerPool, sql } from "@/lib/database/sql-server";
import { verificarIdErpDisponivel } from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import { STATUS_LABELS } from "@/modules/estoque-equipamentos-usados/utils/rotulos";
import type { MotivoBaixa, StatusEquipamento, TipoAcaoMovimentacao } from "@/modules/estoque-equipamentos-usados/types/estoque.types";

/*
 * Correções do administrador direto no menu de ações, para quando o dado
 * ficou errado (no Portal ou no ERP) e não há uma movimentação "de verdade"
 * para lançar. Tudo com motivo obrigatório e registro no histórico de
 * alterações do equipamento, na mesma transação da correção.
 */

const ORIGEM_HISTORICO = "estoque-equipamentos-usados/dados";

/* Ação gravada no extrato para cada status final do ajuste. */
const ACAO_DO_STATUS: Record<StatusEquipamento, TipoAcaoMovimentacao> = {
  em_estoque: "retorno",
  emprestado: "emprestimo",
  consignado: "consignacao",
  em_reforma: "reforma",
  baixado: "baixa",
};

const MOTIVOS_BAIXA: MotivoBaixa[] = ["venda", "perda", "descarte", "outro"];

interface EquipamentoBase {
  numero: number;
  descricao: string;
  status: StatusEquipamento;
  numero_serie: string | null;
}

async function buscarBase(id: string): Promise<EquipamentoBase> {
  const pool = await getSqlServerPool();
  const r = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<EquipamentoBase>(
      `SELECT [numero], [descricao], [status], [numero_serie] FROM dbo.com_estoque_equipamentos_usados WHERE [id] = @id;`
    );
  const equipamento = r.recordset[0];
  if (!equipamento) throw new ValidationError("Equipamento não encontrado.");
  return equipamento;
}

function validarMotivo(motivo: string) {
  if (motivo.trim().length < 5) throw new ValidationError("Explique o motivo do ajuste (pelo menos 5 caracteres).");
}

function hojeLocal(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/* Corrige só o número de série. */
export async function corrigirNumeroSerie(params: {
  id: string;
  novoNumeroSerie: string;
  motivo: string;
  usuarioNome: string;
}): Promise<{ numeroSerieAnterior: string | null; numeroSerie: string }> {
  const novo = params.novoNumeroSerie.trim();
  if (!novo) throw new ValidationError("Informe o número de série.");
  if (novo.length > 100) throw new ValidationError("O número de série pode ter no máximo 100 caracteres.");
  validarMotivo(params.motivo);

  const equipamento = await buscarBase(params.id);
  const anterior = equipamento.numero_serie?.trim() || null;
  if (anterior === novo) throw new ValidationError("O número de série novo é igual ao atual.");

  const detalhes = JSON.stringify({
    equipamentoId: params.id,
    numero: equipamento.numero,
    descricao: equipamento.descricao,
    alteracoes: [{ campo: "numeroSerie", rotulo: "Número de série", de: anterior ?? "", para: novo }],
    motivo: params.motivo.trim(),
  });
  const mensagem = `${params.usuarioNome} corrigiu o número de série do equipamento #${equipamento.numero} (${equipamento.descricao}) de ${anterior ?? "vazio"} para ${novo}.`;

  const pool = await getSqlServerPool();
  const r = await pool
    .request()
    .input("id", sql.UniqueIdentifier, params.id)
    .input("anterior", sql.NVarChar(100), equipamento.numero_serie)
    .input("novo", sql.NVarChar(100), novo)
    .input("mensagem", sql.NVarChar(2000), mensagem.slice(0, 2000))
    .input("detalhes", sql.NVarChar(sql.MAX), detalhes)
    .query<{ linhas: number }>(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      UPDATE dbo.com_estoque_equipamentos_usados
      SET [numero_serie] = @novo, [atualizado_em] = SYSDATETIME()
      WHERE [id] = @id AND ISNULL([numero_serie], N'') = ISNULL(@anterior, N'');
      DECLARE @linhas INT = @@ROWCOUNT;
      IF @linhas = 1
        INSERT INTO dbo.portal_logs ([nivel], [origem], [mensagem], [detalhes])
        VALUES ('info', '${ORIGEM_HISTORICO}', @mensagem, @detalhes);
      COMMIT TRANSACTION;
      SELECT @linhas AS [linhas];
    `);
  if (r.recordset[0]?.linhas !== 1) {
    throw new ValidationError("O equipamento mudou enquanto a correção era preparada. Abra de novo e tente outra vez.");
  }
  return { numeroSerieAnterior: anterior, numeroSerie: novo };
}

/*
 * Ajusta o status final: grava uma movimentação marcada como ajuste manual,
 * com data de hoje (vira o último movimento), e muda o status. A
 * sincronização com o ERP respeita o ajuste até o ERP ter um movimento
 * mais novo que ele (ver decidirStatus); baixado nem é mais consultado.
 */
export async function ajustarStatusEquipamento(params: {
  id: string;
  novoStatus: StatusEquipamento;
  motivoBaixa: MotivoBaixa | null;
  comQuem: string | null;
  motivo: string;
  usuarioId: string;
  usuarioNome: string;
}): Promise<{ statusAnterior: StatusEquipamento; novoStatus: StatusEquipamento }> {
  const { novoStatus } = params;
  if (!(novoStatus in ACAO_DO_STATUS)) throw new ValidationError("Status inválido.");
  validarMotivo(params.motivo);

  const motivoBaixa = novoStatus === "baixado" ? params.motivoBaixa : null;
  if (novoStatus === "baixado" && (!motivoBaixa || !MOTIVOS_BAIXA.includes(motivoBaixa))) {
    throw new ValidationError("Informe o motivo da baixa.");
  }
  const comQuem = novoStatus === "em_estoque" || novoStatus === "baixado" ? null : params.comQuem?.trim().slice(0, 200) || null;

  const equipamento = await buscarBase(params.id);
  if (equipamento.status === novoStatus) {
    throw new ValidationError(`O equipamento já está como "${STATUS_LABELS[novoStatus]}".`);
  }

  const observacoes = `Ajuste manual de status pelo administrador: ${params.motivo.trim()}`.slice(0, 1000);
  const detalhes = JSON.stringify({
    equipamentoId: params.id,
    numero: equipamento.numero,
    descricao: equipamento.descricao,
    alteracoes: [
      { campo: "status", rotulo: "Status", de: STATUS_LABELS[equipamento.status], para: STATUS_LABELS[novoStatus] },
    ],
    motivo: params.motivo.trim(),
  });
  const mensagem = `${params.usuarioNome} ajustou o status do equipamento #${equipamento.numero} (${equipamento.descricao}) de ${STATUS_LABELS[equipamento.status]} para ${STATUS_LABELS[novoStatus]}.`;

  const pool = await getSqlServerPool();
  const r = await pool
    .request()
    .input("id", sql.UniqueIdentifier, params.id)
    .input("statusAnterior", sql.VarChar(20), equipamento.status)
    .input("status", sql.VarChar(20), novoStatus)
    .input("acao", sql.VarChar(20), ACAO_DO_STATUS[novoStatus])
    .input("motivoBaixa", sql.VarChar(20), motivoBaixa)
    .input("comQuem", sql.NVarChar(200), comQuem)
    .input("obs", sql.NVarChar(1000), observacoes)
    .input("data", sql.Date, hojeLocal())
    .input("usuarioId", sql.UniqueIdentifier, params.usuarioId)
    .input("usuarioNome", sql.NVarChar(150), params.usuarioNome)
    .input("mensagem", sql.NVarChar(2000), mensagem.slice(0, 2000))
    .input("detalhes", sql.NVarChar(sql.MAX), detalhes)
    .query<{ linhas: number }>(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      UPDATE dbo.com_estoque_equipamentos_usados
      SET [status] = @status, [atualizado_em] = SYSDATETIME()
      WHERE [id] = @id AND [status] = @statusAnterior;
      DECLARE @linhas INT = @@ROWCOUNT;
      IF @linhas = 1
      BEGIN
        INSERT INTO dbo.com_estoque_equipamentos_usados_movimentacoes
          ([equipamento_id], [tipo_acao], [numero_nf], [destinatario_nome], [motivo_baixa], [status_resultante],
           [observacoes], [data_acao], [criado_por_usuario_id], [criado_por_nome], [ajuste_manual])
        VALUES (@id, @acao, NULL, @comQuem, @motivoBaixa, @status, @obs, @data, @usuarioId, @usuarioNome, 1);
        INSERT INTO dbo.portal_logs ([nivel], [origem], [mensagem], [detalhes])
        VALUES ('aviso', '${ORIGEM_HISTORICO}', @mensagem, @detalhes);
      END;
      COMMIT TRANSACTION;
      SELECT @linhas AS [linhas];
    `);
  if (r.recordset[0]?.linhas !== 1) {
    throw new ValidationError("O status do equipamento mudou enquanto o ajuste era preparado. Abra de novo e tente outra vez.");
  }
  return { statusAnterior: equipamento.status, novoStatus };
}

/*
 * Corrige o código do item e o ID configurado do ERP de um equipamento NOVO
 * (digitados na entrada -- no usado quem preenche é a integração pela NF).
 * O extrato do ERP é buscado por eles: com o valor errado, a cópia do
 * extrato e os movimentos que vieram do ERP são de outro item. Por isso,
 * mudando qualquer um dos dois, isso é apagado e o status volta ao do
 * último movimento do Portal; a rota busca o extrato de novo em seguida.
 */
export async function corrigirDadosErpNovo(params: {
  id: string;
  erpCodigoItem: string;
  erpIdItem: string;
  motivo: string;
  usuarioNome: string;
}): Promise<{ erpCodigoItem: string; erpIdItem: string }> {
  const codigo = params.erpCodigoItem.trim();
  /* Código e ID opcionais: sem os dois, o extrato do ERP não é consultado. */
  const idErp = params.erpIdItem.trim();
  validarMotivo(params.motivo);

  const pool = await getSqlServerPool();
  const atual = await pool
    .request()
    .input("id", sql.UniqueIdentifier, params.id)
    .query<{ numero: number; descricao: string; condicao: string; erp_codigo_item: string | null; erp_id_item: string | null }>(`
      SELECT [numero], [descricao], [condicao], [erp_codigo_item], [erp_id_item]
      FROM dbo.com_estoque_equipamentos_usados WHERE [id] = @id;
    `);
  const equipamento = atual.recordset[0];
  if (!equipamento) throw new ValidationError("Equipamento não encontrado.");
  if (equipamento.condicao !== "novo") {
    throw new ValidationError("Só o equipamento novo tem o código e o ID digitados; no usado eles vêm da integração pela NF de entrada.");
  }

  const codigoAntes = equipamento.erp_codigo_item?.trim() || "";
  const idAntes = equipamento.erp_id_item?.trim() || "";
  if (codigoAntes === codigo && idAntes === idErp) throw new ValidationError("O código e o ID informados são iguais aos atuais.");
  if (idErp && idAntes !== idErp) await verificarIdErpDisponivel(idErp, params.id);

  const alteracoes = [
    ...(codigoAntes !== codigo
      ? [{ campo: "erpCodigoItem", rotulo: "Código do item no ERP", de: codigoAntes, para: codigo || "vazio" }]
      : []),
    ...(idAntes !== idErp ? [{ campo: "erpIdItem", rotulo: "ID configurado", de: idAntes, para: idErp || "vazio" }] : []),
  ];
  const detalhes = JSON.stringify({
    equipamentoId: params.id,
    numero: equipamento.numero,
    descricao: equipamento.descricao,
    alteracoes,
    motivo: params.motivo.trim(),
  });
  const mensagem = `${params.usuarioNome} corrigiu ${alteracoes.map((a) => a.rotulo.toLowerCase()).join(" e ")} do equipamento novo #${equipamento.numero} (${equipamento.descricao}); o extrato do ERP será buscado de novo.`;

  const r = await pool
    .request()
    .input("id", sql.UniqueIdentifier, params.id)
    .input("codigoAntes", sql.NVarChar(50), equipamento.erp_codigo_item)
    .input("idAntes", sql.NVarChar(50), equipamento.erp_id_item)
    .input("codigo", sql.NVarChar(50), codigo || null)
    .input("idErp", sql.NVarChar(50), idErp || null)
    .input("mensagem", sql.NVarChar(2000), mensagem.slice(0, 2000))
    .input("detalhes", sql.NVarChar(sql.MAX), detalhes)
    .query<{ linhas: number }>(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      UPDATE dbo.com_estoque_equipamentos_usados
      SET [erp_codigo_item] = @codigo, [erp_id_item] = @idErp,
          [erp_local] = NULL, [erp_local_desde] = NULL, [erp_cod_emp_atual] = NULL, [erp_contraparte_atual] = NULL,
          [erp_custo_compra] = NULL, [erp_extrato_em] = NULL, [erp_extrato_erro] = NULL,
          [atualizado_em] = SYSDATETIME()
      WHERE [id] = @id AND [condicao] = 'novo'
        AND ISNULL([erp_codigo_item], N'') = ISNULL(@codigoAntes, N'')
        AND ISNULL([erp_id_item], N'') = ISNULL(@idAntes, N'');
      DECLARE @linhas INT = @@ROWCOUNT;
      IF @linhas = 1
      BEGIN
        /* O que veio do ERP com o código/ID antigo é de outro item: sai, e o extrato é buscado de novo. */
        DELETE FROM dbo.com_estoque_equipamentos_usados_movimentacoes WHERE [equipamento_id] = @id AND [origem] = 'erp';
        UPDATE dbo.com_estoque_equipamentos_usados_movimentacoes SET [erp_id_movimentacao] = NULL WHERE [equipamento_id] = @id;
        DELETE FROM dbo.com_estoque_equipamentos_usados_erp_movimentos WHERE [equipamento_id] = @id;
        UPDATE dbo.com_estoque_equipamentos_usados
        SET [status] = ISNULL((
              SELECT TOP 1 m.[status_resultante] FROM dbo.com_estoque_equipamentos_usados_movimentacoes m
              WHERE m.[equipamento_id] = @id ORDER BY m.[data_acao] DESC, m.[criado_em] DESC
            ), 'em_estoque')
        WHERE [id] = @id;
        INSERT INTO dbo.portal_logs ([nivel], [origem], [mensagem], [detalhes])
        VALUES ('aviso', '${ORIGEM_HISTORICO}', @mensagem, @detalhes);
      END;
      COMMIT TRANSACTION;
      SELECT @linhas AS [linhas];
    `);
  if (r.recordset[0]?.linhas !== 1) {
    throw new ValidationError("O equipamento mudou enquanto a correção era preparada. Abra de novo e tente outra vez.");
  }
  return { erpCodigoItem: codigo, erpIdItem: idErp };
}
