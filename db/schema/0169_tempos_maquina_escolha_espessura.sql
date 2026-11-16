/*
 * Tempos de Máquina: perfil "escolha da tabela pela espessura".
 *
 * Um perfil com metodo = 'escolha_espessura' não tem tabela própria: para
 * cada espessura e variante (material padrão/especial), aponta para um
 * perfil de corte CNC -- a célula N7 da aba "Laser" da planilha TEMPOS
 * PLASMA CNC, que troca de máquina conforme a espessura. Ver
 * src/lib/tempos-maquina/escolha.ts.
 *
 * Só amplia o CHECK do método; nenhum perfil existente muda.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.eng_tempos_perfis')
    AND name = 'CK_eng_tempos_perfis_metodo'
    AND definition NOT LIKE '%escolha_espessura%'
)
BEGIN
  ALTER TABLE dbo.eng_tempos_perfis DROP CONSTRAINT CK_eng_tempos_perfis_metodo;
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.eng_tempos_perfis')
    AND name = 'CK_eng_tempos_perfis_metodo'
)
BEGIN
  ALTER TABLE dbo.eng_tempos_perfis
    ADD CONSTRAINT CK_eng_tempos_perfis_metodo
      CHECK ([metodo] IN ('corte_cnc', 'tabela_dimensao', 'escolha_espessura'));
END;

COMMIT TRANSACTION;
