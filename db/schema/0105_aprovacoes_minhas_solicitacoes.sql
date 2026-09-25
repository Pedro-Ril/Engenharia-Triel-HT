SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Corrige o nome dos ícones dos dois módulos criados em 0103: o
-- catálogo de ícones (src/lib/icons/icon-registry.ts) resolve pelo
-- nome exato do componente lucide-react (PascalCase, ex: "TrendingUp"),
-- não por um slug kebab-case -- os dois ficaram caindo no ícone
-- padrão (Folder) até agora.
UPDATE dbo.portal_modulos SET [icone] = 'TrendingUp' WHERE [chave] = 'aprovacoes-solicitar-aumento' AND [icone] = 'trending-up';
UPDATE dbo.portal_modulos SET [icone] = 'ClipboardCheck' WHERE [chave] = 'aprovacoes-painel' AND [icone] = 'clipboard-check';

-- "Minhas Solicitações" vira módulo próprio (antes vivia sob a
-- permissão de "aprovacoes-solicitar-aumento"): entra no setor
-- Diretoria com publico_autenticado=1, já que qualquer usuário
-- autenticado deve poder ver o status das próprias solicitações,
-- independente de ter permissão pra criar uma. em_desenvolvimento=1
-- por enquanto, mesmo rollout escalonado dos outros dois módulos do
-- centro de aprovações.
IF NOT EXISTS (SELECT 1 FROM dbo.portal_modulos WHERE [chave] = 'aprovacoes-minhas-solicitacoes')
BEGIN
  INSERT INTO dbo.portal_modulos
    ([chave], [nome], [path], [icone], [publico_autenticado], [em_desenvolvimento], [ordem])
  VALUES
    ('aprovacoes-minhas-solicitacoes', N'Minhas Solicitações', '/aprovacoes/minhas-solicitacoes', 'ListChecks', 1, 1, 2);
END;

IF NOT EXISTS (
  SELECT 1 FROM dbo.portal_modulos_setores ms
  INNER JOIN dbo.portal_modulos m ON m.[id] = ms.[modulo_id]
  INNER JOIN dbo.portal_setores s ON s.[id] = ms.[setor_id]
  WHERE m.[chave] = 'aprovacoes-minhas-solicitacoes' AND s.[chave] = 'diretoria'
)
BEGIN
  INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id])
  SELECT m.[id], s.[id]
  FROM dbo.portal_modulos m, dbo.portal_setores s
  WHERE m.[chave] = 'aprovacoes-minhas-solicitacoes' AND s.[chave] = 'diretoria';
END;

COMMIT TRANSACTION;
