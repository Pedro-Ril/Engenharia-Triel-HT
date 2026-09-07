SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_transferencia_acessos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_transferencia_acessos (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_portal_transferencia_acessos PRIMARY KEY DEFAULT NEWID(),
    transferencia_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_portal_transferencia_acessos_transferencia
      REFERENCES dbo.portal_transferencias(id) ON DELETE CASCADE,
    -- 'pagina' | 'download_arquivo' | 'download_zip'
    tipo VARCHAR(20) NOT NULL,
    -- snapshot do nome do arquivo baixado (NULL para tipo 'pagina' e 'download_zip')
    arquivo_nome_original NVARCHAR(260) NULL,
    -- sem FK em cascata (evita múltiplos caminhos de cascata pra
    -- portal_usuarios) e sem cascata de exclusão daqui, porque quem
    -- apaga é sempre a transferência (cascade já cuida disso)
    usuario_id UNIQUEIDENTIFIER NULL CONSTRAINT FK_portal_transferencia_acessos_usuario REFERENCES dbo.portal_usuarios(id),
    usuario_nome_snapshot NVARCHAR(150) NULL,
    ip VARCHAR(64) NULL,
    criado_em DATETIME2 NOT NULL CONSTRAINT DF_portal_transferencia_acessos_criado_em DEFAULT SYSDATETIME()
  );
END;

COMMIT TRANSACTION;
