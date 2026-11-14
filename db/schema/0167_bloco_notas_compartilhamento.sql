/*
 * Bloco de Notas -- compartilhamento e edição simultânea.
 *
 * portal_notas_compartilhamentos: o DONO abre uma página (e as
 * subpáginas dela, por herança) para outra pessoa, com permissão
 * 'ver' (só leitura, ao vivo) ou 'editar'. Só o dono compartilha,
 * move, exclui ou muda permissão.
 *
 * usuario_id sem FK de propósito: com FK para portal_usuarios haveria
 * dois caminhos de CASCADE até esta tabela (usuário -> páginas -> aqui e
 * usuário -> aqui), o que o SQL Server não aceita. Compartilhamento de
 * usuário que deixou de existir não aparece em lugar nenhum (toda leitura
 * junta com portal_usuarios).
 *
 * estado_colaborativo: estado Yjs da página enquanto ela é editada ao
 * vivo (gravado pelo serviço de colaboração, colaboracao/server.mjs). O
 * HTML em [conteudo] continua sendo a versão "de leitura" (busca, quem
 * abre sem o serviço no ar). Quando a página é gravada pelo caminho
 * comum (sem o serviço), o estado é zerado e a próxima sessão ao vivo
 * recomeça a partir do HTML.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_notas_compartilhamentos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_notas_compartilhamentos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_notas_compart_id DEFAULT NEWID(),
    [pagina_id] UNIQUEIDENTIFIER NOT NULL,
    [usuario_id] UNIQUEIDENTIFIER NOT NULL,
    [permissao] VARCHAR(10) NOT NULL
      CONSTRAINT CK_portal_notas_compart_permissao CHECK ([permissao] IN ('ver', 'editar')),
    [compartilhado_por] UNIQUEIDENTIFIER NOT NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_notas_compart_criado DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_notas_compartilhamentos PRIMARY KEY ([id]),
    CONSTRAINT FK_portal_notas_compart_pagina FOREIGN KEY ([pagina_id])
      REFERENCES dbo.portal_notas_paginas ([id]) ON DELETE CASCADE,
    CONSTRAINT UQ_portal_notas_compart UNIQUE ([pagina_id], [usuario_id])
  );
  CREATE INDEX IX_portal_notas_compart_usuario ON dbo.portal_notas_compartilhamentos ([usuario_id]);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_notas_paginas') AND name = 'estado_colaborativo'
)
BEGIN
  ALTER TABLE dbo.portal_notas_paginas ADD [estado_colaborativo] VARBINARY(MAX) NULL;
END;

/*
 * Página em que o print foi colado: quem tem acesso a ela (dono ou
 * compartilhado) vê a imagem -- inclusive na hora, ao vivo, antes de o
 * HTML ser gravado. NULL = imagem antiga (só quem enviou vê). Sem FK: a
 * página pode ir para a lixeira/sumir e a imagem sai na limpeza.
 */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.portal_notas_imagens') AND name = 'pagina_id'
)
BEGIN
  ALTER TABLE dbo.portal_notas_imagens ADD [pagina_id] UNIQUEIDENTIFIER NULL;
END;

COMMIT TRANSACTION;
