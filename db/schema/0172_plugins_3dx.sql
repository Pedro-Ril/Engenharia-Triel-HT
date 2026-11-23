/*
 * Plugins 3DX (3DSpace): configuração, fila de trabalhos, registro do que cada plugin fez e avisos.
 *
 * Os plugins rodam dentro do 3DSpace (TomEE) e gravam aqui direto, com o login próprio
 * triel_3dx_plugins (permissões só nestas tabelas -- ver plugins-3dx/sql/criar_login_plugins.sql).
 * O Portal lê tudo isto na tela Administração > Plugins 3DX e é quem muda o modo de cada plugin.
 *
 * - portal_3dx_plugins: um registro por plugin (chave = nome do módulo); modo DESLIGADO/SIMULACAO/ATIVO e
 *   parâmetros em JSON. O plugin relê a cada ~60 s: mudar aqui vale sem reiniciar o 3DSpace.
 * - portal_3dx_plugins_execucoes: uma linha por trabalho e, ao mesmo tempo, a FILA. Status 'pendente' é o
 *   que ainda vai rodar (sobrevive a reinício do 3DSpace); qualquer nó pega o próximo. A chave_dedup impede
 *   o mesmo trabalho duas vezes na fila (índice único filtrado aos status pendente/processando).
 * - portal_3dx_plugins_itens: o que foi feito em cada objeto (título de -> para, instância trocada,
 *   revisão obsoleta, vínculo criado...). É a "foto" da hora: nomes/revisões/títulos gravados na linha.
 * - portal_3dx_plugins_eventos: log técnico (avisos, erros, início/fim de varredura).
 * - portal_3dx_plugins_nos: saúde -- cada nó do 3DSpace atualiza a cada ~60 s (versão, md5, fila, último erro).
 * - portal_3dx_plugins_destinatarios / _notificacoes: lista de quem recebe aviso por evento e o que já saiu.
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_3dx_plugins', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_plugins (
    [chave] VARCHAR(40) NOT NULL CONSTRAINT PK_portal_3dx_plugins PRIMARY KEY,
    [nome] NVARCHAR(100) NOT NULL,
    [descricao] NVARCHAR(500) NULL,
    [modo] VARCHAR(10) NOT NULL CONSTRAINT DF_portal_3dx_plugins_modo DEFAULT 'SIMULACAO'
      CONSTRAINT CK_portal_3dx_plugins_modo CHECK ([modo] IN ('DESLIGADO', 'SIMULACAO', 'ATIVO')),
    [parametros] NVARCHAR(MAX) NOT NULL CONSTRAINT DF_portal_3dx_plugins_parametros DEFAULT N'{}'
      CONSTRAINT CK_portal_3dx_plugins_parametros CHECK (ISJSON([parametros]) = 1),
    [ordem] INT NOT NULL CONSTRAINT DF_portal_3dx_plugins_ordem DEFAULT 0,
    [atualizado_por_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_3dx_plugins_atualizado_por REFERENCES dbo.portal_usuarios ([id]),
    [atualizado_por_nome] NVARCHAR(200) NULL,
    [atualizado_em] DATETIME2 NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_plugins_criado_em DEFAULT SYSDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.portal_3dx_plugins_historico_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_plugins_historico_config (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_3dx_plugins_hist_id DEFAULT NEWID()
      CONSTRAINT PK_portal_3dx_plugins_historico_config PRIMARY KEY,
    [plugin_chave] VARCHAR(40) NOT NULL
      CONSTRAINT FK_portal_3dx_plugins_hist_plugin REFERENCES dbo.portal_3dx_plugins ([chave]),
    [modo_antes] VARCHAR(10) NULL,
    [modo_depois] VARCHAR(10) NULL,
    [parametros_antes] NVARCHAR(MAX) NULL,
    [parametros_depois] NVARCHAR(MAX) NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_3dx_plugins_hist_usuario REFERENCES dbo.portal_usuarios ([id]),
    [usuario_nome] NVARCHAR(200) NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_plugins_hist_criado_em DEFAULT SYSDATETIME()
  );
  CREATE INDEX IX_portal_3dx_plugins_hist_plugin ON dbo.portal_3dx_plugins_historico_config ([plugin_chave], [criado_em] DESC);
END;

IF OBJECT_ID(N'dbo.portal_3dx_plugins_nos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_plugins_nos (
    [plugin_chave] VARCHAR(40) NOT NULL
      CONSTRAINT FK_portal_3dx_plugins_nos_plugin REFERENCES dbo.portal_3dx_plugins ([chave]),
    /* host + catalina.base, ex.: "3dxappserver01:/App/Tomee/Tomee3DSpaceNode1" */
    [no] VARCHAR(200) NOT NULL,
    [versao] VARCHAR(40) NULL,
    [jar_md5] CHAR(32) NULL,
    [core_versao] VARCHAR(40) NULL,
    [modo_em_uso] VARCHAR(10) NULL,
    [iniciado_em] DATETIME2 NULL,
    [ultimo_contato] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_plugins_nos_contato DEFAULT SYSDATETIME(),
    [fila_pendente] INT NULL,
    [ultimo_erro] NVARCHAR(2000) NULL,
    [ultimo_erro_em] DATETIME2 NULL,
    CONSTRAINT PK_portal_3dx_plugins_nos PRIMARY KEY ([plugin_chave], [no])
  );
END;

IF OBJECT_ID(N'dbo.portal_3dx_plugins_execucoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_plugins_execucoes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_3dx_plugins_exec_id DEFAULT NEWID()
      CONSTRAINT PK_portal_3dx_plugins_execucoes PRIMARY KEY,
    [plugin_chave] VARCHAR(40) NOT NULL
      CONSTRAINT FK_portal_3dx_plugins_exec_plugin REFERENCES dbo.portal_3dx_plugins ([chave]),
    [gatilho] VARCHAR(20) NOT NULL
      CONSTRAINT CK_portal_3dx_plugins_exec_gatilho CHECK ([gatilho] IN ('liberacao', 'duplicacao', 'noturna', 'manual')),
    /* modo em que rodou (SIMULACAO não altera nada no 3DX, só registra o que faria) */
    [modo] VARCHAR(10) NOT NULL
      CONSTRAINT CK_portal_3dx_plugins_exec_modo CHECK ([modo] IN ('DESLIGADO', 'SIMULACAO', 'ATIVO')),
    [status] VARCHAR(12) NOT NULL CONSTRAINT DF_portal_3dx_plugins_exec_status DEFAULT 'pendente'
      CONSTRAINT CK_portal_3dx_plugins_exec_status CHECK ([status] IN
        ('pendente', 'processando', 'concluida', 'parcial', 'falha', 'ignorada', 'cancelada')),
    [chave_dedup] NVARCHAR(200) NULL,
    /* liga execuções nascidas do mesmo evento (ex.: uma liberação que gerou trabalho em dois plugins) */
    [correlacao_id] UNIQUEIDENTIFIER NULL,
    /* parâmetros do trabalho (ex.: limite da varredura) em JSON */
    [parametros] NVARCHAR(MAX) NULL,
    /* objeto que disparou o trabalho (foto da hora) */
    [objeto_physicalid] VARCHAR(64) NULL,
    [objeto_id] VARCHAR(64) NULL,
    [objeto_tipo] NVARCHAR(100) NULL,
    [objeto_nome] NVARCHAR(200) NULL,
    [objeto_revisao] NVARCHAR(20) NULL,
    [objeto_titulo] NVARCHAR(300) NULL,
    /* quem fez a ação no 3DX (login do 3DEXPERIENCE) e, se bater com o AD, o usuário do Portal */
    [ator_login] NVARCHAR(100) NULL,
    [ator_usuario_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_3dx_plugins_exec_ator REFERENCES dbo.portal_usuarios ([id]),
    /* ação manual pedida pelo Portal */
    [solicitado_por_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_3dx_plugins_exec_solicitante REFERENCES dbo.portal_usuarios ([id]),
    [solicitado_por_nome] NVARCHAR(200) NULL,
    [no] VARCHAR(200) NULL,
    [tentativas] INT NOT NULL CONSTRAINT DF_portal_3dx_plugins_exec_tentativas DEFAULT 0,
    [enfileirado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_plugins_exec_enfileirado DEFAULT SYSDATETIME(),
    /* não processar antes disso (ex.: esperar o 3DX gravar a liberação) */
    [executar_apos] DATETIME2 NULL,
    [iniciado_em] DATETIME2 NULL,
    /* atualizado pelo nó enquanto processa: trabalho "processando" sem contato há muito tempo é retomado */
    [ultimo_contato] DATETIME2 NULL,
    [finalizado_em] DATETIME2 NULL,
    [duracao_ms] INT NULL,
    [total_itens] INT NULL,
    [total_ok] INT NULL,
    [total_falhas] INT NULL,
    [resumo] NVARCHAR(1000) NULL,
    [erro] NVARCHAR(4000) NULL,
    /* aviso por e-mail já tratado (enviado ou sem destinatário) -- impede aviso repetido */
    [notificado_em] DATETIME2 NULL
  );
  CREATE INDEX IX_portal_3dx_plugins_exec_fila ON dbo.portal_3dx_plugins_execucoes ([status], [enfileirado_em])
    INCLUDE ([plugin_chave], [executar_apos], [ultimo_contato]);
  CREATE INDEX IX_portal_3dx_plugins_exec_plugin ON dbo.portal_3dx_plugins_execucoes ([plugin_chave], [enfileirado_em] DESC);
  CREATE INDEX IX_portal_3dx_plugins_exec_enfileirado ON dbo.portal_3dx_plugins_execucoes ([enfileirado_em] DESC);
  CREATE INDEX IX_portal_3dx_plugins_exec_objeto ON dbo.portal_3dx_plugins_execucoes ([objeto_nome]);
  CREATE INDEX IX_portal_3dx_plugins_exec_correlacao ON dbo.portal_3dx_plugins_execucoes ([correlacao_id])
    WHERE [correlacao_id] IS NOT NULL;
  CREATE UNIQUE INDEX UX_portal_3dx_plugins_exec_dedup ON dbo.portal_3dx_plugins_execucoes ([plugin_chave], [chave_dedup])
    WHERE [chave_dedup] IS NOT NULL AND [status] IN ('pendente', 'processando');
END;

IF OBJECT_ID(N'dbo.portal_3dx_plugins_itens', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_plugins_itens (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_3dx_plugins_itens_id DEFAULT NEWID()
      CONSTRAINT PK_portal_3dx_plugins_itens PRIMARY KEY,
    [execucao_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_3dx_plugins_itens_execucao REFERENCES dbo.portal_3dx_plugins_execucoes ([id]) ON DELETE CASCADE,
    [ordem] INT NOT NULL,
    /* titulo_alterado | instancia_substituida | revisao_obsoleta | vinculo_criado | seria_* (simulação) */
    [acao] VARCHAR(40) NOT NULL,
    [sucesso] BIT NOT NULL,
    /* objeto afetado (foto da hora) */
    [alvo_physicalid] VARCHAR(64) NULL,
    [alvo_tipo] NVARCHAR(100) NULL,
    [alvo_nome] NVARCHAR(200) NULL,
    [alvo_revisao] NVARCHAR(20) NULL,
    [alvo_titulo] NVARCHAR(300) NULL,
    [alvo_estado] NVARCHAR(40) NULL,
    [alvo_owner] NVARCHAR(100) NULL,
    [valor_antes] NVARCHAR(1000) NULL,
    [valor_depois] NVARCHAR(1000) NULL,
    [mensagem] NVARCHAR(2000) NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_plugins_itens_criado_em DEFAULT SYSDATETIME()
  );
  CREATE INDEX IX_portal_3dx_plugins_itens_execucao ON dbo.portal_3dx_plugins_itens ([execucao_id], [ordem]);
  CREATE INDEX IX_portal_3dx_plugins_itens_alvo ON dbo.portal_3dx_plugins_itens ([alvo_nome]);
END;

IF OBJECT_ID(N'dbo.portal_3dx_plugins_eventos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_plugins_eventos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_3dx_plugins_evt_id DEFAULT NEWID()
      CONSTRAINT PK_portal_3dx_plugins_eventos PRIMARY KEY,
    /* NULL = núcleo comum (triel-3dx-core) */
    [plugin_chave] VARCHAR(40) NULL,
    [no] VARCHAR(200) NULL,
    [nivel] VARCHAR(5) NOT NULL CONSTRAINT CK_portal_3dx_plugins_evt_nivel CHECK ([nivel] IN ('info', 'aviso', 'erro')),
    [mensagem] NVARCHAR(1000) NOT NULL,
    [detalhe] NVARCHAR(MAX) NULL,
    /* sem FK de propósito: o evento pode chegar (em lote) antes da execução ou depois de ela ser apagada */
    [execucao_id] UNIQUEIDENTIFIER NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_plugins_evt_criado_em DEFAULT SYSDATETIME()
  );
  CREATE INDEX IX_portal_3dx_plugins_evt_criado ON dbo.portal_3dx_plugins_eventos ([criado_em] DESC);
  CREATE INDEX IX_portal_3dx_plugins_evt_plugin ON dbo.portal_3dx_plugins_eventos ([plugin_chave], [criado_em] DESC);
  CREATE INDEX IX_portal_3dx_plugins_evt_execucao ON dbo.portal_3dx_plugins_eventos ([execucao_id])
    WHERE [execucao_id] IS NOT NULL;
END;

IF OBJECT_ID(N'dbo.portal_3dx_plugins_destinatarios', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_plugins_destinatarios (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_3dx_plugins_dest_id DEFAULT NEWID()
      CONSTRAINT PK_portal_3dx_plugins_destinatarios PRIMARY KEY,
    [plugin_chave] VARCHAR(40) NOT NULL
      CONSTRAINT FK_portal_3dx_plugins_dest_plugin REFERENCES dbo.portal_3dx_plugins ([chave]),
    /* revisao_trocada | falha (lista aberta: novos eventos não pedem migração) */
    [evento] VARCHAR(40) NOT NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_portal_3dx_plugins_dest_usuario REFERENCES dbo.portal_usuarios ([id]) ON DELETE CASCADE,
    [email] NVARCHAR(320) NULL,
    [nome] NVARCHAR(200) NULL,
    [ativo] BIT NOT NULL CONSTRAINT DF_portal_3dx_plugins_dest_ativo DEFAULT 1,
    [criado_por_id] UNIQUEIDENTIFIER NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_plugins_dest_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT CK_portal_3dx_plugins_dest_alvo CHECK ([usuario_id] IS NOT NULL OR [email] IS NOT NULL)
  );
  CREATE INDEX IX_portal_3dx_plugins_dest_plugin ON dbo.portal_3dx_plugins_destinatarios ([plugin_chave], [evento]);
END;

IF OBJECT_ID(N'dbo.portal_3dx_plugins_notificacoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_plugins_notificacoes (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_3dx_plugins_notif_id DEFAULT NEWID()
      CONSTRAINT PK_portal_3dx_plugins_notificacoes PRIMARY KEY,
    [execucao_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_3dx_plugins_notif_execucao REFERENCES dbo.portal_3dx_plugins_execucoes ([id]) ON DELETE CASCADE,
    [evento] VARCHAR(40) NOT NULL,
    [destinatario_email] NVARCHAR(320) NOT NULL,
    [destinatario_nome] NVARCHAR(200) NULL,
    [assunto] NVARCHAR(300) NOT NULL,
    [sucesso] BIT NOT NULL,
    [erro] NVARCHAR(500) NULL,
    [enviado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_plugins_notif_enviado_em DEFAULT SYSDATETIME()
  );
  CREATE UNIQUE INDEX UX_portal_3dx_plugins_notif ON dbo.portal_3dx_plugins_notificacoes ([execucao_id], [evento], [destinatario_email]);
  CREATE INDEX IX_portal_3dx_plugins_notif_enviado ON dbo.portal_3dx_plugins_notificacoes ([enviado_em] DESC);
END;

/* Catálogo inicial: tudo em SIMULACAO (nada muda no 3DX até alguém ativar pela tela). */
MERGE dbo.portal_3dx_plugins AS destino
USING (VALUES
  ('duplicate-title', N'Título automático na Duplicação',
   N'Na Duplicação/Duplicação avançada, o item novo recebe o Nome novo como título (peças SOLIDWORKS mantêm a configuração).',
   N'{"maxTitulo":100}', 1),
  ('replace-revision', N'Atualização de revisão nos conjuntos liberados',
   N'Ao liberar a revisão nova de uma peça, os conjuntos LIBERADOS passam a usar essa revisão e as anteriores liberadas viram OBSOLETAS.',
   N'{"maxInstancias":5000,"esperaLiberacaoSeg":120,"obsoletarAnteriores":true}', 2),
  ('drawing-config-link', N'Desenho por qualquer configuração',
   N'Ao liberar um desenho SOLIDWORKS, ele é ligado a todas as configurações da mesma peça; rotina noturna confere os liberados.',
   N'{"papel":"ctx::VPLMAdmin.Company Name.Default","maxVinculosPorDesenho":200,"esperaLiberacaoSeg":120,"noturnoAtivo":false,"noturnoHora":"02:00"}', 3)
) AS origem ([chave], [nome], [descricao], [parametros], [ordem])
ON destino.[chave] = origem.[chave]
WHEN NOT MATCHED THEN
  INSERT ([chave], [nome], [descricao], [modo], [parametros], [ordem])
  VALUES (origem.[chave], origem.[nome], origem.[descricao], 'SIMULACAO', origem.[parametros], origem.[ordem]);

COMMIT TRANSACTION;
GO
