/*
 * Bloco de Notas: um caderno pessoal por usuário (estilo Notion) --
 * páginas e subpáginas em árvore, texto formatado com prints, tabelas,
 * listas de tarefas etc. EXCLUSIVO do dono: toda leitura/escrita filtra
 * por usuario_id (ver src/lib/bloco-notas/bloco-notas.ts), inclusive as
 * imagens, que só são servidas para quem as enviou.
 *
 * Lixeira: excluir só marca excluida_em (a subárvore inteira com o mesmo
 * instante, para restaurar junto); some de vez depois de 30 dias ou ao
 * esvaziar. pai_id sem CASCADE (auto-referência não aceita) -- a
 * exclusão definitiva apaga a subárvore numa instrução só.
 *
 * Módulo em Utilitários, aberto a qualquer usuário logado
 * (publico_autenticado = 1, como a Transferência de Arquivos). Entra
 * como em_desenvolvimento = 1 (só administradores veem) porque o banco é
 * o mesmo da produção: liberar a todos desmarcando "Em desenvolvimento"
 * em Administração → Setores e módulos depois do deploy.
 */
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_notas_paginas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_notas_paginas (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_notas_paginas_id DEFAULT NEWID(),
    [usuario_id] UNIQUEIDENTIFIER NOT NULL,
    [pai_id] UNIQUEIDENTIFIER NULL,
    [titulo] NVARCHAR(200) NOT NULL CONSTRAINT DF_portal_notas_paginas_titulo DEFAULT N'',
    [conteudo] NVARCHAR(MAX) NOT NULL CONSTRAINT DF_portal_notas_paginas_conteudo DEFAULT N'',
    /* Texto puro do conteúdo, para a busca (não precisa varrer HTML). */
    [texto_busca] NVARCHAR(MAX) NOT NULL CONSTRAINT DF_portal_notas_paginas_texto DEFAULT N'',
    [favorita] BIT NOT NULL CONSTRAINT DF_portal_notas_paginas_favorita DEFAULT 0,
    [ordem] INT NOT NULL CONSTRAINT DF_portal_notas_paginas_ordem DEFAULT 0,
    /* Sobe a cada gravação do conteúdo -- duas abas editando a mesma página não se sobrescrevem às cegas. */
    [versao] INT NOT NULL CONSTRAINT DF_portal_notas_paginas_versao DEFAULT 1,
    [excluida_em] DATETIME2 NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_notas_paginas_criado DEFAULT SYSDATETIME(),
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_notas_paginas_atualizado DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_notas_paginas PRIMARY KEY ([id]),
    CONSTRAINT FK_portal_notas_paginas_usuario FOREIGN KEY ([usuario_id])
      REFERENCES dbo.portal_usuarios ([id]) ON DELETE CASCADE,
    CONSTRAINT FK_portal_notas_paginas_pai FOREIGN KEY ([pai_id])
      REFERENCES dbo.portal_notas_paginas ([id])
  );
  CREATE INDEX IX_portal_notas_paginas_usuario ON dbo.portal_notas_paginas ([usuario_id], [excluida_em], [pai_id], [ordem]);
  CREATE INDEX IX_portal_notas_paginas_pai ON dbo.portal_notas_paginas ([pai_id]);
END;

IF OBJECT_ID(N'dbo.portal_notas_imagens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_notas_imagens (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_notas_imagens_id DEFAULT NEWID(),
    [usuario_id] UNIQUEIDENTIFIER NOT NULL,
    [tipo_mime] NVARCHAR(100) NOT NULL,
    [tamanho_bytes] INT NOT NULL,
    [conteudo] VARBINARY(MAX) NOT NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_notas_imagens_criado DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_notas_imagens PRIMARY KEY ([id]),
    CONSTRAINT FK_portal_notas_imagens_usuario FOREIGN KEY ([usuario_id])
      REFERENCES dbo.portal_usuarios ([id]) ON DELETE CASCADE
  );
  CREATE INDEX IX_portal_notas_imagens_usuario ON dbo.portal_notas_imagens ([usuario_id]);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.portal_modulos WHERE [chave] = 'bloco-notas')
BEGIN
  INSERT INTO dbo.portal_modulos
    ([chave], [nome], [path], [icone], [publico_sem_login], [publico_autenticado], [ativo], [ordem], [em_desenvolvimento], [restrito_atendente_chamados])
  VALUES
    ('bloco-notas', N'Bloco de Notas', '/bloco-notas', 'NotebookPen', 0, 1, 1, 9, 1, 0);

  INSERT INTO dbo.portal_modulos_setores ([modulo_id], [setor_id])
  SELECT m.[id], s.[id]
  FROM dbo.portal_modulos AS m
  CROSS JOIN dbo.portal_setores AS s
  WHERE m.[chave] = 'bloco-notas' AND s.[nome] = N'Utilitários';
END;

COMMIT TRANSACTION;
