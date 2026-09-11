SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Novo tipo de movimentação: "nf_vinculada" — registrado no extrato
 * sempre que a NF de entrada é preenchida (job automático ou botão
 * "Tentar agora"), sem trocar o status do equipamento. Até aqui esse
 * evento só aparecia no log de tentativas de integração, não no
 * histórico completo do equipamento.
 */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_com_estoque_mov_tipo_acao')
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_movimentacoes DROP CONSTRAINT CK_com_estoque_mov_tipo_acao;
END;

ALTER TABLE dbo.com_estoque_equipamentos_usados_movimentacoes
  ADD CONSTRAINT CK_com_estoque_mov_tipo_acao CHECK (
    [tipo_acao] IN (N'entrada', N'emprestimo', N'consignacao', N'retorno', N'baixa', N'nf_vinculada')
  );

COMMIT TRANSACTION;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * "nf_vinculada" pode ser disparada pelo job automático, sem usuário
 * autenticado por trás — criado_por_usuario_id passa a aceitar NULL
 * nesse caso (criado_por_nome guarda "Integração automática (ERP)").
 * Não há FK nessa coluna, então o ALTER é direto.
 */
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_equipamentos_usados_movimentacoes') AND name = 'criado_por_usuario_id' AND is_nullable = 0
)
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_movimentacoes ALTER COLUMN [criado_por_usuario_id] UNIQUEIDENTIFIER NULL;
END;

COMMIT TRANSACTION;
