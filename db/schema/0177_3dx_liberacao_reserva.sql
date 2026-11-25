/*
 * Liberação de desenhos agendada: reserva da liberação.
 *
 * Quando a simulação agendada termina, só UM servidor do Portal pode
 * liberar a partir dela -- o que tem a senha de quem pediu na memória (ou
 * qualquer um, se quem pediu é administrador). Em 17 e 19/11/2026 dois
 * Portais no mesmo banco (produção e o `next dev`) disputaram o mesmo
 * fluxo: um liberou e o outro, sem a senha, mandou "nada foi liberado".
 *
 * - reservada_em / reservada_por: quem pegou a liberação e quando (o
 *   UPDATE condicional é a reserva). Vence em 10 minutos, se o servidor
 *   que reservou cair antes de mandar o job ao 3DX.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_liberacoes') AND name = 'reservada_em')
  ALTER TABLE dbo.portal_3dx_liberacoes ADD [reservada_em] DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_liberacoes') AND name = 'reservada_por')
  ALTER TABLE dbo.portal_3dx_liberacoes ADD [reservada_por] NVARCHAR(120) NULL;

COMMIT TRANSACTION;
GO
