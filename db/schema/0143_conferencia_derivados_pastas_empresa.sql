/*
 * Conferência de Arquivos Derivados multiempresa: cada empresa
 * (portal_empresas) tem as suas pastas de PDF, DXF e STEP. A conferência
 * usa as pastas da empresa do cadastro do usuário (codigo_empresa casado
 * com portal_empresas.codigo, como o tema -- ver resolverEmpresaDoUsuario).
 *
 * As pastas de hoje (singleton eng_conferencia_derivados_config) eram as
 * da Triel-HT e vão para a linha dela. A tabela antiga fica no banco,
 * sem uso, como histórico.
 */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.eng_conferencia_derivados_pastas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_conferencia_derivados_pastas (
    id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT PK_eng_conferencia_derivados_pastas PRIMARY KEY
      CONSTRAINT DF_eng_conferencia_derivados_pastas_id DEFAULT NEWID(),
    empresa_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_eng_conferencia_derivados_pastas_empresa REFERENCES dbo.portal_empresas ([id])
      CONSTRAINT UQ_eng_conferencia_derivados_pastas_empresa UNIQUE,
    pasta_pdf NVARCHAR(300) NULL,
    pasta_dxf NVARCHAR(300) NULL,
    pasta_step NVARCHAR(300) NULL,
    atualizado_em DATETIME2 NOT NULL
      CONSTRAINT DF_eng_conferencia_derivados_pastas_atualizado_em DEFAULT SYSDATETIME(),
    atualizado_por NVARCHAR(150) NULL
  );
END;

INSERT INTO dbo.eng_conferencia_derivados_pastas
  ([empresa_id], [pasta_pdf], [pasta_dxf], [pasta_step], [atualizado_por])
SELECT e.[id], c.[pasta_pdf], c.[pasta_dxf], c.[pasta_step], N'migracao-0143'
FROM dbo.eng_conferencia_derivados_config AS c
CROSS JOIN dbo.portal_empresas AS e
WHERE c.[id] = 1
  AND LTRIM(RTRIM(e.[codigo])) = '2' /* TRIEL-HT INDUSTRIAL E PARTICIPACOES S/A */
  AND NOT EXISTS (
    SELECT 1 FROM dbo.eng_conferencia_derivados_pastas AS p WHERE p.[empresa_id] = e.[id]
  );

COMMIT TRANSACTION;
