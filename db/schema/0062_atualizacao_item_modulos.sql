SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.portal_atualizacao_item_modulos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_atualizacao_item_modulos (
    item_id UNIQUEIDENTIFIER NOT NULL,
    tag_id UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_portal_atualizacao_item_modulos PRIMARY KEY (item_id, tag_id),
    CONSTRAINT FK_portal_atualizacao_item_modulos_item FOREIGN KEY (item_id)
      REFERENCES dbo.portal_atualizacao_itens(id) ON DELETE CASCADE,
    CONSTRAINT FK_portal_atualizacao_item_modulos_tag FOREIGN KEY (tag_id)
      REFERENCES dbo.portal_atualizacao_tags(id) ON DELETE CASCADE
  );
END;

COMMIT TRANSACTION;
