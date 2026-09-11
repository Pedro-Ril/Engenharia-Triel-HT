SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * CK_com_estoque_evid_tipo_mime só permitia os 4 tipos de imagem
 * originais — quando o upload de evidências passou a aceitar também
 * PDF/Word/Excel (TIPOS_MIME_EVIDENCIA_ACEITOS em evidencias.ts), a
 * constraint nunca foi atualizada junto. Resultado: o front deixa
 * escolher o arquivo, a validação de app passa, e o INSERT quebra com
 * erro 500 na hora de salvar. Recria a constraint com a lista completa.
 */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_com_estoque_evid_tipo_mime')
BEGIN
  ALTER TABLE dbo.com_estoque_equipamentos_usados_evidencias DROP CONSTRAINT CK_com_estoque_evid_tipo_mime;
END;

ALTER TABLE dbo.com_estoque_equipamentos_usados_evidencias
  ADD CONSTRAINT CK_com_estoque_evid_tipo_mime CHECK (
    [tipo_mime] IN (
      N'image/png',
      N'image/jpeg',
      N'image/gif',
      N'image/webp',
      N'application/pdf',
      N'application/msword',
      N'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      N'application/vnd.ms-excel',
      N'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  );

COMMIT TRANSACTION;
