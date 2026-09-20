SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Exclusão lógica -- nunca apaga a linha de verdade, pra não perder o
 * histórico de criação/edições/downloads que aponta pra ela (ver
 * listarLogAdmin). NULL = não excluída. Listas/downloads/edição
 * filtram por [excluido_em] IS NULL; o log do admin usa
 * [excluido_em] IS NOT NULL como o evento "exclusao".
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_assinaturas_geradas') AND name = 'excluido_em'
)
BEGIN
  ALTER TABLE dbo.portal_assinaturas_geradas ADD [excluido_em] DATETIME2 NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_assinaturas_geradas') AND name = 'excluido_por'
)
BEGIN
  ALTER TABLE dbo.portal_assinaturas_geradas ADD [excluido_por] NVARCHAR(150) NULL;
END;

COMMIT TRANSACTION;
