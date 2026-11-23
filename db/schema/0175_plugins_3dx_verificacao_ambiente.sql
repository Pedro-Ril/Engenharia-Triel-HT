/*
 * Plugins 3DX: verificação do ambiente 3DEXPERIENCE pelo Portal (após hotfix/atualização da Dassault).
 *
 * O Portal confere periodicamente, só lendo pela rede (sem login, sem instalar nada no 3DSpace):
 *  - a versão (build) do 3DSpace de cada nó -- mudou = a Dassault foi atualizada;
 *  - o padrão de visualização do "Abrir com" (4 arquivos estáticos) -- um hotfix pode sobrescrevê-los;
 *  - os nós dos plugins (heartbeat parado, autoteste de compatibilidade com falha).
 * Toda mudança de estado vira evento (portal_3dx_plugins_eventos) e e-mail para a lista do evento "ambiente_3dx".
 *
 * - portal_3dx_servidores: os nós do 3DSpace a conferir (URL base até /3dspace).
 * - portal_3dx_verificacoes: o estado atual de cada item em cada nó (o histórico fica nos eventos).
 * - portal_3dx_plugins_nos: + autoteste do núcleo (gravado pelo heartbeat) e o último estado já avisado.
 * - portal_3dx_plugins_destinatarios: plugin_chave passa a aceitar NULL = aviso geral do ambiente (não de um plugin).
 * - portal_3dx_plugins_versoes: nota da melhoria de visualização (não é jar, então entra por aqui).
 *
 * Aplicar com: sqlcmd -S pdmserver -U sa -d PortalTrielHT -C -f 65001 -i db/schema/0175_plugins_3dx_verificacao_ambiente.sql
 */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_3dx_servidores', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_servidores (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_portal_3dx_servidores_id DEFAULT NEWID()
      CONSTRAINT PK_portal_3dx_servidores PRIMARY KEY,
    [nome] NVARCHAR(100) NOT NULL,
    [ambiente] VARCHAR(10) NOT NULL
      CONSTRAINT CK_portal_3dx_servidores_ambiente CHECK ([ambiente] IN ('PRODUCAO', 'TESTE')),
    /* até o contexto do 3DSpace, sem barra no fim: http://192.168.0.171:9080/3dspace */
    [url_base] VARCHAR(300) NOT NULL,
    [ativo] BIT NOT NULL CONSTRAINT DF_portal_3dx_servidores_ativo DEFAULT 1,
    [ordem] INT NOT NULL CONSTRAINT DF_portal_3dx_servidores_ordem DEFAULT 0,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_servidores_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT UQ_portal_3dx_servidores_url UNIQUE ([url_base])
  );

  INSERT INTO dbo.portal_3dx_servidores ([nome], [ambiente], [url_base], [ordem]) VALUES
    (N'Produção · nó 1', 'PRODUCAO', 'http://192.168.0.171:9080/3dspace', 1),
    (N'Produção · nó 2', 'PRODUCAO', 'http://192.168.0.171:9082/3dspace', 2),
    (N'dev-plm', 'TESTE', 'http://192.168.0.179:9080/3dspace', 3);
END;

IF OBJECT_ID(N'dbo.portal_3dx_verificacoes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_3dx_verificacoes (
    [servidor_id] UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_portal_3dx_verificacoes_servidor REFERENCES dbo.portal_3dx_servidores ([id]) ON DELETE CASCADE,
    /* versao_3dx | visualizacao */
    [item] VARCHAR(40) NOT NULL,
    [status] VARCHAR(10) NOT NULL
      CONSTRAINT CK_portal_3dx_verificacoes_status CHECK ([status] IN ('ok', 'alerta', 'erro')),
    /* versao_3dx: o build (ex.: 6.428.4.26105); visualizacao: aplicado | perdido | mudou */
    [valor] NVARCHAR(200) NULL,
    /* visualizacao: JSON com a situação de cada arquivo; erro: a mensagem */
    [detalhe] NVARCHAR(4000) NULL,
    /* nó sem resposta: só vira 'erro' na segunda falha seguida (um reinício não gera aviso) */
    [falhas_seguidas] INT NOT NULL CONSTRAINT DF_portal_3dx_verificacoes_falhas DEFAULT 0,
    [verificado_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_verificacoes_verificado DEFAULT SYSDATETIME(),
    [mudou_em] DATETIME2 NOT NULL CONSTRAINT DF_portal_3dx_verificacoes_mudou DEFAULT SYSDATETIME(),
    CONSTRAINT PK_portal_3dx_verificacoes PRIMARY KEY ([servidor_id], [item])
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_nos') AND name = 'autoteste')
  ALTER TABLE dbo.portal_3dx_plugins_nos ADD
    /* gravado pelo heartbeat (núcleo 1.3.0+): as partes internas da Dassault que o plugin usa existem? */
    [autoteste] VARCHAR(10) NULL CONSTRAINT CK_portal_3dx_plugins_nos_autoteste CHECK ([autoteste] IN ('ok', 'falha')),
    [autoteste_detalhe] NVARCHAR(2000) NULL,
    /* gravado pelo Portal: último estado já avisado por e-mail (ok | sem_contato | incompativel) */
    [aviso_estado] VARCHAR(20) NULL;

/* plugin_chave NULL = destinatário dos avisos gerais do ambiente (evento ambiente_3dx). */
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_destinatarios')
           AND name = 'plugin_chave' AND is_nullable = 0)
BEGIN
  DROP INDEX IX_portal_3dx_plugins_dest_plugin ON dbo.portal_3dx_plugins_destinatarios;
  ALTER TABLE dbo.portal_3dx_plugins_destinatarios ALTER COLUMN [plugin_chave] VARCHAR(40) NULL;
  CREATE INDEX IX_portal_3dx_plugins_dest_plugin ON dbo.portal_3dx_plugins_destinatarios ([plugin_chave], [evento]);
END;

IF OBJECT_ID(N'dbo.portal_3dx_plugins_versoes', N'U') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.portal_3dx_plugins_versoes WHERE [componente] = 'visualizacao' AND [versao] = '1.0.0')
  INSERT INTO dbo.portal_3dx_plugins_versoes ([componente], [versao], [lancada_em], [notas], [registrado_no], [registrado_ambiente])
  VALUES ('visualizacao', '1.0.0', '2026-11-16',
    N'Padrão de visualização do "Abrir com" (3DPlay e 3D Navigate): qualidade alta, sombreado com todas as arestas, '
    + N'sem perspectiva e geometria completa já na abertura. Aplicado nos dois nós de produção e no dev-plm pelo script '
    + N'aplicar_padrao_visualizacao.py (não é plugin: arquivos estáticos do 3DSpace).',
    'aplicar_padrao_visualizacao.py', 'PRODUCAO');

COMMIT TRANSACTION;
GO

SELECT [nome], [ambiente], [url_base] FROM dbo.portal_3dx_servidores ORDER BY [ordem];
SELECT [name], [is_nullable] FROM sys.columns
WHERE object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_nos') AND [name] IN ('autoteste', 'autoteste_detalhe', 'aviso_estado')
   OR object_id = OBJECT_ID(N'dbo.portal_3dx_plugins_destinatarios') AND [name] = 'plugin_chave';
GO
