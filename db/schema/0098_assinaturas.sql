SET XACT_ABORT ON;
BEGIN TRANSACTION;

/*
 * Modelos (templates) de assinatura de e-mail — imagem de fundo (PNG) +
 * posição/fonte/cor de cada campo, tudo editável pelo admin (ver
 * AssinaturaModeloEditor.tsx). campos_config é um objeto JSON com uma
 * entrada fixa por campo (nome/sobrenome/setor/email/celular), não uma
 * lista arbitrária -- o formulário de geração sempre pede esses 5 campos.
 */
IF OBJECT_ID(N'dbo.portal_assinaturas_modelos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_assinaturas_modelos (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_assinaturas_modelos_id DEFAULT NEWID(),
    [nome] NVARCHAR(150) NOT NULL,
    [imagem_fundo] VARBINARY(MAX) NOT NULL,
    [imagem_tipo_mime] NVARCHAR(100) NOT NULL,
    [imagem_largura] INT NOT NULL,
    [imagem_altura] INT NOT NULL,
    [campos_config] NVARCHAR(MAX) NOT NULL,
    [ativo] BIT NOT NULL CONSTRAINT DF_assinaturas_modelos_ativo DEFAULT 1,
    [ordem] INT NOT NULL CONSTRAINT DF_assinaturas_modelos_ordem DEFAULT 0,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_assinaturas_modelos_criado_em DEFAULT SYSDATETIME(),
    [criado_por] NVARCHAR(150) NULL,
    [atualizado_em] DATETIME2 NOT NULL CONSTRAINT DF_assinaturas_modelos_atualizado_em DEFAULT SYSDATETIME(),
    [atualizado_por] NVARCHAR(150) NULL,
    CONSTRAINT PK_assinaturas_modelos PRIMARY KEY ([id]),
    CONSTRAINT UQ_assinaturas_modelos_nome UNIQUE ([nome])
  );
END;

/*
 * Cada assinatura gerada por um usuário -- guarda o PNG final composto
 * (não só os dados) pra permitir baixar de novo depois sem regerar, e
 * campos snapshot (modelo_nome/usuario_nome) pra o histórico continuar
 * legível mesmo se o modelo for editado/removido ou o usuário mudar de
 * nome (mesmo padrão de solicitante_departamento em portal_chamados).
 */
IF OBJECT_ID(N'dbo.portal_assinaturas_geradas', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_assinaturas_geradas (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_assinaturas_geradas_id DEFAULT NEWID(),
    [modelo_id] UNIQUEIDENTIFIER NULL,
    [modelo_nome] NVARCHAR(150) NOT NULL,
    [usuario_id] UNIQUEIDENTIFIER NOT NULL,
    [usuario_nome] NVARCHAR(150) NOT NULL,
    [nome] NVARCHAR(150) NOT NULL,
    [sobrenome] NVARCHAR(150) NOT NULL,
    [setor] NVARCHAR(150) NOT NULL,
    [email] NVARCHAR(200) NOT NULL,
    [celular] NVARCHAR(40) NULL,
    [imagem_gerada] VARBINARY(MAX) NOT NULL,
    [imagem_tipo_mime] NVARCHAR(100) NOT NULL,
    [nome_arquivo] NVARCHAR(260) NOT NULL,
    [criado_em] DATETIME2 NOT NULL CONSTRAINT DF_assinaturas_geradas_criado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_assinaturas_geradas PRIMARY KEY ([id]),
    CONSTRAINT FK_assinaturas_geradas_modelo FOREIGN KEY ([modelo_id])
      REFERENCES dbo.portal_assinaturas_modelos ([id]) ON DELETE SET NULL,
    CONSTRAINT FK_assinaturas_geradas_usuario FOREIGN KEY ([usuario_id])
      REFERENCES dbo.portal_usuarios ([id])
  );
END;

/* Um evento por download de verdade -- alimenta, junto com geradas.criado_em, o log de criações/downloads no admin (ver listarLogAdmin). */
IF OBJECT_ID(N'dbo.portal_assinaturas_downloads', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_assinaturas_downloads (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_assinaturas_downloads_id DEFAULT NEWID(),
    [assinatura_id] UNIQUEIDENTIFIER NOT NULL,
    [usuario_id] UNIQUEIDENTIFIER NULL,
    [usuario_nome] NVARCHAR(150) NOT NULL,
    [baixado_em] DATETIME2 NOT NULL CONSTRAINT DF_assinaturas_downloads_baixado_em DEFAULT SYSDATETIME(),
    CONSTRAINT PK_assinaturas_downloads PRIMARY KEY ([id]),
    CONSTRAINT FK_assinaturas_downloads_assinatura FOREIGN KEY ([assinatura_id])
      REFERENCES dbo.portal_assinaturas_geradas ([id]) ON DELETE CASCADE,
    CONSTRAINT FK_assinaturas_downloads_usuario FOREIGN KEY ([usuario_id])
      REFERENCES dbo.portal_usuarios ([id])
  );
END;

COMMIT TRANSACTION;
