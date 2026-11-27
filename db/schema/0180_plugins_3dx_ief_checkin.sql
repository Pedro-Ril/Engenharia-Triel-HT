/*
 * Plugins 3DX: "ief-checkin" -- correção do salvamento pelo conector CAD (SOLIDWORKS). O ENOIEFCheckinHandler da
 * Dassault deixa, a cada salvamento, um timer que nunca para; o de um salvamento cancelado limpa a sessão do
 * usuário e quebra os salvamentos seguintes (erro "null" ao salvar). A classe corrigida (WEB-INF/classes) encerra o
 * timer no fim de cada salvamento em Ativo; em Simulação só conta.
 *
 * Gatilho novo "salvamento": salvamento que termina com erro no servidor vira execução em falha.
 * TESTE nasce em SIMULACAO; PRODUCAO nasce DESLIGADO -- liga em Simulação depois de instalar.
 * Parâmetros: resumoMinutos (intervalo do resumo no registro de eventos), registrarFalhas, maxFalhasPorHora.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_portal_3dx_plugins_exec_gatilho'
           AND definition NOT LIKE '%salvamento%')
BEGIN
  ALTER TABLE dbo.portal_3dx_plugins_execucoes DROP CONSTRAINT CK_portal_3dx_plugins_exec_gatilho;
  ALTER TABLE dbo.portal_3dx_plugins_execucoes ADD CONSTRAINT CK_portal_3dx_plugins_exec_gatilho
    CHECK ([gatilho] IN ('liberacao', 'duplicacao', 'noturna', 'manual', 'consulta', 'salvamento'));
END;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins WHERE [chave] = 'ief-checkin')
  INSERT INTO dbo.portal_3dx_plugins ([chave], [nome], [descricao], [ordem])
  VALUES ('ief-checkin', N'Correção do salvamento pelo conector CAD',
          N'Encerra, no fim de cada salvamento pelo conector do SOLIDWORKS, o timer que a Dassault deixa no servidor. O de um salvamento cancelado limpava a sessão do usuário e causava o erro "null" nos salvamentos seguintes.',
          5);

IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_ambientes WHERE [plugin_chave] = 'ief-checkin' AND [ambiente] = 'TESTE')
  INSERT INTO dbo.portal_3dx_plugins_ambientes ([plugin_chave], [ambiente], [modo], [parametros])
  VALUES ('ief-checkin', 'TESTE', 'SIMULACAO', N'{"resumoMinutos":15,"registrarFalhas":true,"maxFalhasPorHora":30}');

IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_ambientes WHERE [plugin_chave] = 'ief-checkin' AND [ambiente] = 'PRODUCAO')
  INSERT INTO dbo.portal_3dx_plugins_ambientes ([plugin_chave], [ambiente], [modo], [parametros])
  VALUES ('ief-checkin', 'PRODUCAO', 'DESLIGADO', N'{"resumoMinutos":60,"registrarFalhas":true,"maxFalhasPorHora":30}');

COMMIT TRANSACTION;
GO
