/*
 * Plugins 3DX: "advanced-duplicate" -- janela de Duplicação avançada do 3DEXPERIENCE. O filtro
 * (TrielAdvancedDuplicate.jar) age na resposta de POST /resources/lifecycle/expand/federated, a estrutura que a
 * janela mostra com a ação inicial de cada linha (expand::defaultAction).
 *
 * 0.1.0 só observa: registra amostras do pedido e da resposta para validar o formato no dev-plm.
 * TESTE nasce em SIMULACAO; PRODUCAO nasce DESLIGADO.
 * Parâmetros: maxBytes (resposta maior passa direto), amostrasPorDia (amostras registradas por dia).
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins WHERE [chave] = 'advanced-duplicate')
  INSERT INTO dbo.portal_3dx_plugins ([chave], [nome], [descricao], [ordem])
  VALUES ('advanced-duplicate', N'Duplicação avançada',
          N'Na janela de Duplicação avançada, o item principal vem como "Duplicar com Desenhos" e os demais como "Reutilizar", e a miniatura do item aparece ao passar o mouse.',
          6);

DECLARE @parametros NVARCHAR(MAX) = N'{"maxBytes":20000000,"amostrasPorDia":10}';

IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_ambientes WHERE [plugin_chave] = 'advanced-duplicate' AND [ambiente] = 'TESTE')
  INSERT INTO dbo.portal_3dx_plugins_ambientes ([plugin_chave], [ambiente], [modo], [parametros])
  VALUES ('advanced-duplicate', 'TESTE', 'SIMULACAO', @parametros);

IF NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_ambientes WHERE [plugin_chave] = 'advanced-duplicate' AND [ambiente] = 'PRODUCAO')
  INSERT INTO dbo.portal_3dx_plugins_ambientes ([plugin_chave], [ambiente], [modo], [parametros])
  VALUES ('advanced-duplicate', 'PRODUCAO', 'DESLIGADO', @parametros);

COMMIT TRANSACTION;
GO
