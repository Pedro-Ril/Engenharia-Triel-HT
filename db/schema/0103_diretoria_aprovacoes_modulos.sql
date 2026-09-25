SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Setor novo "Diretoria" -- casa dos módulos do centro de aprovações.
-- em_desenvolvimento=1 nos dois módulos (ver abaixo) deixa tudo
-- invisível até o admin testar e liberar em Setores e Módulos.
IF NOT EXISTS (SELECT 1 FROM dbo.portal_setores WHERE [chave] = 'diretoria')
BEGIN
  INSERT INTO dbo.portal_setores ([chave], [nome], [icone], [ordem])
  VALUES ('diretoria', N'Diretoria', 'briefcase', 7);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_modulos WHERE [chave] = 'aprovacoes-solicitar-aumento')
BEGIN
  INSERT INTO dbo.portal_modulos
    ([chave], [nome], [path], [icone], [em_desenvolvimento], [ordem])
  VALUES
    ('aprovacoes-solicitar-aumento', N'Solicitar Aumento Salarial', '/aprovacoes/solicitar-aumento', 'trending-up', 1, 0);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_modulos WHERE [chave] = 'aprovacoes-painel')
BEGIN
  INSERT INTO dbo.portal_modulos
    ([chave], [nome], [path], [icone], [em_desenvolvimento], [ordem])
  VALUES
    ('aprovacoes-painel', N'Painel de Aprovações', '/aprovacoes/painel', 'clipboard-check', 1, 1);
END;

IF NOT EXISTS (
  SELECT 1 FROM dbo.portal_modulos_setores ms
  INNER JOIN dbo.portal_modulos m ON m.[id] = ms.[modulo_id]
  INNER JOIN dbo.portal_setores s ON s.[id] = ms.[setor_id]
  WHERE m.[chave] = 'aprovacoes-solicitar-aumento' AND s.[chave] = 'diretoria'
)
BEGIN
  INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id])
  SELECT m.[id], s.[id]
  FROM dbo.portal_modulos m, dbo.portal_setores s
  WHERE m.[chave] = 'aprovacoes-solicitar-aumento' AND s.[chave] = 'diretoria';
END;

IF NOT EXISTS (
  SELECT 1 FROM dbo.portal_modulos_setores ms
  INNER JOIN dbo.portal_modulos m ON m.[id] = ms.[modulo_id]
  INNER JOIN dbo.portal_setores s ON s.[id] = ms.[setor_id]
  WHERE m.[chave] = 'aprovacoes-painel' AND s.[chave] = 'diretoria'
)
BEGIN
  INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id])
  SELECT m.[id], s.[id]
  FROM dbo.portal_modulos m, dbo.portal_setores s
  WHERE m.[chave] = 'aprovacoes-painel' AND s.[chave] = 'diretoria';
END;

COMMIT TRANSACTION;
