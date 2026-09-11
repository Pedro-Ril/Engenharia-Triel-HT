SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Uma pendência marcada como "vira status" (gera_pendencia=1) hoje é só
 * informativa (aparece no filtro/badge da lista). "trava_movimentacao"
 * é um segundo nível opcional: quando ligado, nenhuma movimentação
 * (empréstimo, consignação, retorno ou baixa) pode ser registrada
 * enquanto o campo estiver vazio nesse equipamento — só faz sentido
 * junto com gera_pendencia=1 (ver guarda em atualizarCampoTipo).
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos') AND name = 'trava_movimentacao'
)
BEGIN
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos ADD trava_movimentacao BIT NOT NULL CONSTRAINT DF_com_estoque_tipo_campo_trava_mov DEFAULT 0;
END;

COMMIT TRANSACTION;
