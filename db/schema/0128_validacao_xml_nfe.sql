/*
 * Validação de XML de NF-e: o usuário envia o XML de uma nota de veículo
 * e o portal confere se ela traz o grupo de veículo novo (veicProd) e se
 * os dados batem com o texto da nota. A conferência roda no navegador;
 * cada validação fica registrada em fin_validacao_xml_nfe -- quem fez,
 * quando, o resultado e o próprio XML, para baixar depois.
 *
 * Fica no setor Financeiro, que troca o ícone de mouse ("MouseRight")
 * por um de banco ("Landmark").
 *
 * O módulo nasce em desenvolvimento -- só administrador enxerga até ser
 * liberado em Setores e Módulos.
 */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.fin_validacao_xml_nfe', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.fin_validacao_xml_nfe (
    [id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_fin_validacao_xml_nfe_id DEFAULT NEWID()
      CONSTRAINT PK_fin_validacao_xml_nfe PRIMARY KEY,
    [usuario_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_fin_validacao_xml_nfe_usuario REFERENCES dbo.portal_usuarios([id]),
    /* Foto do nome na hora da validação. */
    [usuario_nome] NVARCHAR(200) NOT NULL,
    [arquivo] NVARCHAR(260) NOT NULL,
    [numero_nota] NVARCHAR(20) NULL,
    [serie] NVARCHAR(10) NULL,
    [chave_acesso] NVARCHAR(44) NULL,
    [destinatario] NVARCHAR(200) NULL,
    /* valido | invalido (pelo bloco do veículo e a SEFAZ) | falha (XML ilegível ou que não é NF-e) */
    [situacao] VARCHAR(10) NOT NULL,
    [qtd_erros] INT NOT NULL CONSTRAINT DF_fin_validacao_xml_nfe_qtd_erros DEFAULT 0,
    [qtd_avisos] INT NOT NULL CONSTRAINT DF_fin_validacao_xml_nfe_qtd_avisos DEFAULT 0,
    /* Apontamentos da conferência, em JSON. */
    [apontamentos] NVARCHAR(MAX) NULL,
    [xml] NVARCHAR(MAX) NOT NULL,
    [criado_em] DATETIME2 NOT NULL
      CONSTRAINT DF_fin_validacao_xml_nfe_criado_em DEFAULT SYSDATETIME()
  );

  CREATE INDEX IX_fin_validacao_xml_nfe_criado_em
    ON dbo.fin_validacao_xml_nfe ([criado_em] DESC);
END;

UPDATE dbo.portal_setores
SET [icone] = 'Landmark'
WHERE [chave] = 'financeiro' AND [icone] = 'MouseRight';

IF NOT EXISTS (SELECT 1 FROM dbo.portal_modulos WHERE [chave] = 'validacao-xml-nfe')
BEGIN
  INSERT INTO dbo.portal_modulos
    ([chave], [nome], [path], [icone], [em_desenvolvimento], [ordem])
  VALUES
    ('validacao-xml-nfe', N'Validação de XML de NF-e', '/validacao-xml-nfe',
     'FileCheck2', 1,
     (SELECT ISNULL(MAX([ordem]), 0) + 1 FROM dbo.portal_modulos));
END;

INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id])
SELECT m.[id], s.[id]
FROM dbo.portal_modulos AS m
CROSS JOIN dbo.portal_setores AS s
WHERE m.[chave] = 'validacao-xml-nfe'
  AND s.[chave] = 'financeiro'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.portal_modulos_setores AS ms
    WHERE ms.[modulo_id] = m.[id] AND ms.[setor_id] = s.[id]
  );

COMMIT TRANSACTION;
