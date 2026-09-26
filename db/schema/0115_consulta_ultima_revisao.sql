SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- "Consulta Última Revisão": explode a estrutura do 3DX (mesmo endpoint
-- do Roteiro de Fabricação) e aponta os itens que não estão na última
-- revisão. Nasce com em_desenvolvimento=1, invisível até o admin testar
-- e liberar em Setores e Módulos.
IF NOT EXISTS (SELECT 1 FROM dbo.portal_modulos WHERE [chave] = 'consulta-ultima-revisao')
BEGIN
  INSERT INTO dbo.portal_modulos
    ([chave], [nome], [path], [icone], [em_desenvolvimento], [ordem])
  VALUES
    ('consulta-ultima-revisao', N'Consulta Última Revisão', '/consulta-ultima-revisao', 'git-compare', 1, 0);
END;

IF NOT EXISTS (
  SELECT 1 FROM dbo.portal_modulos_setores ms
  INNER JOIN dbo.portal_modulos m ON m.[id] = ms.[modulo_id]
  INNER JOIN dbo.portal_setores s ON s.[id] = ms.[setor_id]
  WHERE m.[chave] = 'consulta-ultima-revisao' AND s.[chave] = 'eng-prod-agro'
)
BEGIN
  INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id])
  SELECT m.[id], s.[id]
  FROM dbo.portal_modulos m, dbo.portal_setores s
  WHERE m.[chave] = 'consulta-ultima-revisao' AND s.[chave] = 'eng-prod-agro';
END;

COMMIT TRANSACTION;
