SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.com_estoque_tipos_equipamento_campos') AND name = 'eh_sistema'
)
BEGIN
  ALTER TABLE dbo.com_estoque_tipos_equipamento_campos
    ADD [eh_sistema] BIT NOT NULL CONSTRAINT DF_com_estoque_tipos_equip_campos_eh_sistema DEFAULT 0;
END;

COMMIT TRANSACTION;
GO

/*
 * Semeia, para cada tipo de equipamento já existente, os 10 campos fixos
 * do sistema (os que hoje são inputs fixos nas telas de entrada/detalhe —
 * cliente, valor, descrição, marca, modelo, número de série, empresa, NF
 * de entrada, código ERP, observações) como linhas de verdade em
 * com_estoque_tipos_equipamento_campos, dentro do bloco fixo (Recebimento)
 * de cada tipo — assim o admin passa a editar rótulo/ordem/obrigatório/
 * ativo deles do mesmo jeito que já edita campos dinâmicos comuns.
 *
 * Chave usa o prefixo "sistema" (ex: sistemaModelo) em vez do nome cru
 * (ex: "modelo") de propósito — o tipo "Silo Graneleiro" já tem um campo
 * dinâmico do usuário com chave "modelo" (real, criado antes desta
 * feature existir), e chave é única por tipo_equipamento_id. Prefixar
 * evita colidir com esse (ou qualquer outro) campo já cadastrado, sem
 * precisar tocar em dado que o usuário já criou.
 */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

INSERT INTO dbo.com_estoque_tipos_equipamento_campos
  ([tipo_equipamento_id], [bloco_id], [chave], [rotulo], [tipo_dado], [unidade], [obrigatorio], [ordem], [eh_sistema])
SELECT
  b.[tipo_equipamento_id],
  b.[id],
  v.[chave],
  v.[rotulo],
  v.[tipo_dado],
  v.[unidade],
  v.[obrigatorio],
  v.[ordem],
  1
FROM dbo.com_estoque_tipos_equipamento_blocos AS b
CROSS JOIN (VALUES
  ('sistemaNomeCliente',     N'Nome do cliente',          'texto',  NULL,   0, 0),
  ('sistemaValor',           N'Valor',                    'numero', N'R$',  0, 1),
  ('sistemaDescricao',       N'Descrição',                'texto',  NULL,   1, 2),
  ('sistemaMarca',           N'Marca',                    'texto',  NULL,   0, 3),
  ('sistemaModelo',          N'Modelo',                   'texto',  NULL,   0, 4),
  ('sistemaNumeroSerie',     N'Número de série',          'texto',  NULL,   0, 5),
  ('sistemaCodigoEmpresa',   N'Empresa',                  'texto',  NULL,   0, 6),
  ('sistemaNumeroNfEntrada', N'NF de entrada',            'texto',  NULL,   1, 7),
  ('sistemaErpCodigoItem',   N'Código do item no ERP',    'texto',  NULL,   0, 8),
  ('sistemaObservacoes',     N'Observações livres',       'texto',  NULL,   0, 9)
) AS v([chave], [rotulo], [tipo_dado], [unidade], [obrigatorio], [ordem])
WHERE b.[eh_fixo] = 1
  AND NOT EXISTS (
    SELECT 1 FROM dbo.com_estoque_tipos_equipamento_campos AS c
    WHERE c.[tipo_equipamento_id] = b.[tipo_equipamento_id] AND c.[chave] = v.[chave]
  );

COMMIT TRANSACTION;
