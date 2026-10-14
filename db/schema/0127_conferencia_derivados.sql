/*
 * Conferência de Arquivos Derivados: dada uma lista de códigos, diz
 * quais não têm PDF, DXF ou STEP nas pastas de rede. Migração da
 * "Aplicação 1 - Validador de arquivos" do validacoes.py.
 *
 * As pastas ficam na administração do módulo (Configurações), não no
 * código. Os valores iniciais são os mesmos do script em Python, que
 * também são os que Lantek e TuBest já usam.
 *
 * O módulo nasce em desenvolvimento -- só administrador enxerga até
 * ser liberado em Setores e Módulos.
 */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.eng_conferencia_derivados_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.eng_conferencia_derivados_config (
    id INT NOT NULL CONSTRAINT PK_eng_conferencia_derivados_config PRIMARY KEY
      CONSTRAINT CK_eng_conferencia_derivados_config_id CHECK (id = 1),
    pasta_pdf NVARCHAR(300) NULL,
    pasta_dxf NVARCHAR(300) NULL,
    pasta_step NVARCHAR(300) NULL,
    atualizado_em DATETIME2 NULL,
    atualizado_por NVARCHAR(150) NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.eng_conferencia_derivados_config WHERE id = 1)
BEGIN
  INSERT INTO dbo.eng_conferencia_derivados_config
    (id, pasta_pdf, pasta_dxf, pasta_step, atualizado_em, atualizado_por)
  VALUES (
    1,
    N'\\servidorgeral\Derivados\Triel-HT\DESENHOS',
    N'\\servidorgeral\Derivados\Triel-HT\DXF',
    N'\\servidorgeral\Derivados\Triel-HT\STEP',
    SYSDATETIME(),
    N'migracao-0127'
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_modulos WHERE [chave] = 'conferencia-derivados')
BEGIN
  INSERT INTO dbo.portal_modulos
    ([chave], [nome], [path], [icone], [em_desenvolvimento], [ordem])
  VALUES
    ('conferencia-derivados', N'Conferência de Arquivos Derivados', '/conferencia-derivados',
     'FileSearch', 1,
     (SELECT ISNULL(MAX([ordem]), 0) + 1 FROM dbo.portal_modulos));
END;

/* Ferramenta de engenharia: entra nos dois setores de engenharia, como
   o Visualizador CAD. Ajustável depois em Setores e Módulos. */
INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id])
SELECT m.[id], s.[id]
FROM dbo.portal_modulos AS m
CROSS JOIN dbo.portal_setores AS s
WHERE m.[chave] = 'conferencia-derivados'
  AND s.[chave] IN ('eng-prod-agro', 'eng-manufatura')
  AND NOT EXISTS (
    SELECT 1 FROM dbo.portal_modulos_setores AS ms
    WHERE ms.[modulo_id] = m.[id] AND ms.[setor_id] = s.[id]
  );

COMMIT TRANSACTION;
