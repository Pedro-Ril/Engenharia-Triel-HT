/*
 * Fase 9 do sistema de templates dinâmicos: um produto com template
 * publicado pode declarar campos que os campos fixos de
 * eng_desenhos_aprovacao não cobrem (ex: "quantidadeAves"). Os valores
 * digitados nesses campos extras vão aqui como JSON solto
 * ({chave: valor}) — as colunas fixas continuam exatamente como hoje,
 * sem migração de dado nelas.
 */

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.eng_desenhos_aprovacao') AND name = 'campos_extra'
)
BEGIN
  ALTER TABLE dbo.eng_desenhos_aprovacao
    ADD [campos_extra] NVARCHAR(MAX) NULL
      CONSTRAINT CK_eng_desenhos_aprovacao_campos_extra CHECK ([campos_extra] IS NULL OR ISJSON([campos_extra]) = 1);
END;

COMMIT TRANSACTION;
