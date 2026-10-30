/*
 * As datas do Portal são gravadas com SYSDATETIME() (horário local do SQL
 * Server, sem fuso), mas o driver mssql lê DATETIME2 como se fosse UTC.
 * Para devolver o instante certo — inclusive para o outro sistema, que
 * recebe as datas em ISO com "Z" — a leitura anexa o fuso atual do
 * servidor (TODATETIMEOFFSET), e o driver converte direito.
 */
const FUSO_DO_SERVIDOR = "DATEPART(TZOFFSET, SYSDATETIMEOFFSET())";

/* Lista de colunas para SELECT/OUTPUT, com as de data já convertidas. `origem` = "INSERTED." no OUTPUT. */
export function colunasSql(colunas: string[], datas: string[], origem = ""): string {
  return colunas
    .map((coluna) =>
      datas.includes(coluna)
        ? `TODATETIMEOFFSET(${origem}[${coluna}], ${FUSO_DO_SERVIDOR}) AS [${coluna}]`
        : `${origem}[${coluna}]`
    )
    .join(", ");
}
