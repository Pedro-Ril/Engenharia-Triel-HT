/*
 * Visualizador CAD: abre um arquivo de desenho/modelo que a pessoa
 * arrasta para a tela (STEP, IGES, DXF e outros) sem depender do
 * 3DEXPERIENCE. Nasce em desenvolvimento -- só administrador enxerga
 * até ser liberado em Setores e Módulos.
 */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_modulos WHERE [chave] = 'visualizador-cad')
BEGIN
  INSERT INTO dbo.portal_modulos
    ([chave], [nome], [path], [icone], [em_desenvolvimento], [ordem])
  VALUES
    ('visualizador-cad', N'Visualizador CAD', '/visualizador-cad', 'Box', 1,
     (SELECT ISNULL(MAX([ordem]), 0) + 1 FROM dbo.portal_modulos));
END;

/* Ferramenta de engenharia: entra nos dois setores de engenharia. A
   ligação pode ser ajustada depois pela tela de Setores e Módulos. */
INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id])
SELECT m.[id], s.[id]
FROM dbo.portal_modulos AS m
CROSS JOIN dbo.portal_setores AS s
WHERE m.[chave] = 'visualizador-cad'
  AND s.[chave] IN ('eng-prod-agro', 'eng-manufatura')
  AND NOT EXISTS (
    SELECT 1 FROM dbo.portal_modulos_setores AS ms
    WHERE ms.[modulo_id] = m.[id] AND ms.[setor_id] = s.[id]
  );

COMMIT TRANSACTION;
