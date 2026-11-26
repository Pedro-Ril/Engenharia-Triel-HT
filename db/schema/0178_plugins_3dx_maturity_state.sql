/*
 * Plugins 3DX: "maturity-state" -- estado de maturidade pelo banco na busca de item (dseng) e na estrutura
 * (cvservlet/zonequeries) que o integrador do SOLIDWORKS lê. As duas vêm do índice de busca, que atrasa até
 * ~1,5 min depois de cada mudança; o filtro (TrielMaturityState.jar) confere o estado no banco.
 *
 * TESTE nasce em SIMULACAO (só observa); PRODUCAO nasce DESLIGADO -- liga em Simulação depois de instalar o jar.
 * Parâmetros: papel (contexto de leitura), maxObjetos e prazoMs (limite da conferência por resposta), maxBytes
 * (resposta maior passa direto), amostrasPorDia (amostras do formato registradas por tipo e por dia).
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins WHERE [chave] = 'maturity-state')
  INSERT INTO dbo.portal_3dx_plugins ([chave], [nome], [descricao], [ordem])
  VALUES ('maturity-state', N'Estado de maturidade pelo banco',
          N'Na busca de item e na estrutura que o integrador do SOLIDWORKS lê, o estado de maturidade vem do banco, e não do índice de busca.',
          4);

DECLARE @parametros NVARCHAR(MAX) =
  N'{"papel":"ctx::VPLMAdmin.Company Name.Default","maxObjetos":5000,"prazoMs":3000,"maxBytes":30000000,"amostrasPorDia":3}';

IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_ambientes WHERE [plugin_chave] = 'maturity-state' AND [ambiente] = 'TESTE')
  INSERT INTO dbo.portal_3dx_plugins_ambientes ([plugin_chave], [ambiente], [modo], [parametros])
  VALUES ('maturity-state', 'TESTE', 'SIMULACAO', @parametros);

IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_ambientes WHERE [plugin_chave] = 'maturity-state' AND [ambiente] = 'PRODUCAO')
  INSERT INTO dbo.portal_3dx_plugins_ambientes ([plugin_chave], [ambiente], [modo], [parametros])
  VALUES ('maturity-state', 'PRODUCAO', 'DESLIGADO', @parametros);

COMMIT TRANSACTION;
GO
