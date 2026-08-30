SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_tv_midias_pastas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_tv_midias_pastas (
    [id]        UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ptvmp_id DEFAULT NEWID() PRIMARY KEY,
    [nome]      NVARCHAR(100) NOT NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_ptvmp_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_ptvmp_nome UNIQUE ([nome])
  );
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_tv_midias') AND name = 'pasta_id'
)
BEGIN
  ALTER TABLE dbo.portal_tv_midias
    ADD [pasta_id] UNIQUEIDENTIFIER NULL;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ptvm_pasta'
)
BEGIN
  ALTER TABLE dbo.portal_tv_midias
    ADD CONSTRAINT FK_ptvm_pasta FOREIGN KEY ([pasta_id])
      REFERENCES dbo.portal_tv_midias_pastas([id]);
END;

COMMIT TRANSACTION;
