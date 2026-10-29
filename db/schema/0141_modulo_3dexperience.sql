/*
 * Módulo "3DExperience" (Engenharia de Produto): reúne as ferramentas
 * que falam com o 3DEXPERIENCE, em abas, com uma permissão só.
 *
 * - Consulta última revisão passa a ser uma aba dele: quem já tinha a
 *   permissão da consulta ganha a do 3DExperience (ninguém perde acesso)
 *   e o card antigo sai do catálogo (sem vínculo de setor). A linha antiga
 *   fica -- o histórico de acessos aponta para ela, e /consulta-ultima-revisao
 *   redireciona para a aba nova.
 * - Liberação de desenhos em trabalho: aba nova (ver 0142).
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_modulos WHERE [chave] = '3dexperience')
  INSERT INTO dbo.portal_modulos ([chave], [nome], [path], [icone], [publico_sem_login], [publico_autenticado], [ativo], [ordem], [em_desenvolvimento], [restrito_atendente_chamados])
  VALUES ('3dexperience', N'3DExperience', '/3dexperience', 'Box', 0, 0, 1, 5, 0, 0);

DECLARE @modulo UNIQUEIDENTIFIER = (SELECT [id] FROM dbo.portal_modulos WHERE [chave] = '3dexperience');
DECLARE @consulta UNIQUEIDENTIFIER = (SELECT [id] FROM dbo.portal_modulos WHERE [chave] = 'consulta-ultima-revisao');
DECLARE @setor UNIQUEIDENTIFIER = (SELECT [id] FROM dbo.portal_setores WHERE [nome] = N'Engenharia de Produto');

IF @setor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.portal_modulos_setores WHERE [modulo_id] = @modulo AND [setor_id] = @setor)
  INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id]) VALUES (@modulo, @setor);

/* Quem tinha a Consulta última revisão passa a ter o 3DExperience. */
IF @consulta IS NOT NULL
  INSERT INTO dbo.portal_permissoes ([usuario_id], [modulo_id], [concedido_por])
  SELECT p.[usuario_id], @modulo, N'pedro.ril'
  FROM dbo.portal_permissoes AS p
  WHERE p.[modulo_id] = @consulta
    AND NOT EXISTS (SELECT 1 FROM dbo.portal_permissoes AS j WHERE j.[usuario_id] = p.[usuario_id] AND j.[modulo_id] = @modulo);

/* O card antigo sai do catálogo (a ferramenta agora é uma aba do 3DExperience). */
IF @consulta IS NOT NULL
  DELETE FROM dbo.portal_modulos_setores WHERE [modulo_id] = @consulta;

COMMIT TRANSACTION;
