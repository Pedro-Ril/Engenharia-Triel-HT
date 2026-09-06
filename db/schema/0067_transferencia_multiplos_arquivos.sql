SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_transferencia_arquivos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_transferencia_arquivos (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_portal_transferencia_arquivos PRIMARY KEY DEFAULT NEWID(),
    transferencia_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_portal_transferencia_arquivos_transferencia
      REFERENCES dbo.portal_transferencias(id) ON DELETE CASCADE,
    nome_original NVARCHAR(260) NOT NULL,
    tipo_mime NVARCHAR(150) NOT NULL,
    tamanho_bytes BIGINT NOT NULL,
    caminho_arquivo NVARCHAR(300) NOT NULL,
    criado_em DATETIME2 NOT NULL CONSTRAINT DF_portal_transferencia_arquivos_criado_em DEFAULT SYSDATETIME()
  );
END;

/*
 * Migra o arquivo único de cada transferência já existente (modelo
 * antigo: 1 arquivo por linha) pra tabela nova ANTES de soltar a
 * obrigatoriedade das colunas antigas — sem isso, transferências já
 * enviadas por usuários reais perderiam o arquivo na tela depois da
 * troca pro modelo "vários arquivos por transferência". Guardado por
 * WHERE NOT EXISTS pra ser seguro rodar de novo.
 */
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'portal_transferencias' AND COLUMN_NAME = 'nome_original'
)
BEGIN
  INSERT INTO dbo.portal_transferencia_arquivos
    ([transferencia_id], [nome_original], [tipo_mime], [tamanho_bytes], [caminho_arquivo], [criado_em])
  SELECT t.[id], t.[nome_original], t.[tipo_mime], t.[tamanho_bytes], t.[caminho_arquivo], t.[criado_em]
  FROM dbo.portal_transferencias t
  WHERE NOT EXISTS (
    SELECT 1 FROM dbo.portal_transferencia_arquivos a WHERE a.[transferencia_id] = t.[id]
  );

  /*
   * Não usamos DROP COLUMN aqui de propósito — só afrouxamos a
   * obrigatoriedade (NULL) pra código novo poder inserir sem essas
   * colunas, mantendo o dado antigo intacto e a mudança reversível.
   */
  ALTER TABLE dbo.portal_transferencias ALTER COLUMN [nome_original] NVARCHAR(260) NULL;
  ALTER TABLE dbo.portal_transferencias ALTER COLUMN [tipo_mime] NVARCHAR(150) NULL;
  ALTER TABLE dbo.portal_transferencias ALTER COLUMN [tamanho_bytes] BIGINT NULL;
  ALTER TABLE dbo.portal_transferencias ALTER COLUMN [caminho_arquivo] NVARCHAR(300) NULL;
END;

COMMIT TRANSACTION;
