"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import styles from "./EngenhariaVersatil.module.css";

const POR_PAGINA = 25;

export type VarianteSituacao = "success" | "info" | "neutral" | "warning" | "danger";

export interface LinhaArquivo {
  chave: string;
  pastaDestino: string;
  codigo: string;
  tipo: "pdf" | "dxf";
  arquivo: string | null;
  situacao: string;
  rotulo: string;
  variante: VarianteSituacao;
  mensagem?: string | null;
}

/*
 * Tabela dos arquivos (prévia ou resultado), com filtro pela situação e
 * 25 por página (um projeto passa fácil de 250 arquivos). As opções do
 * filtro vêm das situações que de fato aparecem. Paginação no próprio
 * navegador: a lista inteira já veio com a prévia/resultado.
 */
export function TabelaArquivos({ linhas }: { linhas: LinhaArquivo[] }) {
  const [filtro, setFiltro] = useState("todas");
  const [pagina, setPagina] = useState(1);

  const situacoes = [...new Map(linhas.map((l) => [l.situacao, l.rotulo])).entries()];
  const opcoes = [
    { value: "todas", label: `Todos (${linhas.length})` },
    ...situacoes.map(([valor, rotulo]) => ({
      value: valor,
      label: `${rotulo} (${linhas.filter((l) => l.situacao === valor).length})`,
    })),
  ];
  const filtradas = filtro === "todas" ? linhas : linhas.filter((l) => l.situacao === filtro);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  /* Lista nova (outra prévia) com menos páginas: fica na última que existe. */
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const visiveis = filtradas.slice(inicio, inicio + POR_PAGINA);

  return (
    <Stack gap={12}>
      <div className={styles.filtro}>
        <Field label="Mostrar">
          <Dropdown
            value={filtro}
            options={opcoes}
            onValueChange={(valor) => {
              setFiltro(valor);
              setPagina(1);
            }}
          />
        </Field>
      </div>
      <Table minWidth={760}>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Pasta</TableHeaderCell>
            <TableHeaderCell>Código</TableHeaderCell>
            <TableHeaderCell>Tipo</TableHeaderCell>
            <TableHeaderCell>Arquivo</TableHeaderCell>
            <TableHeaderCell>Situação</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visiveis.map((l) => (
            <TableRow key={l.chave}>
              <TableCell>{l.pastaDestino}</TableCell>
              <TableCell>
                <strong>{l.codigo}</strong>
              </TableCell>
              <TableCell>{l.tipo.toUpperCase()}</TableCell>
              <TableCell>{l.arquivo ?? <span className={styles.secundario}>—</span>}</TableCell>
              <TableCell>
                <Stack gap={4}>
                  <Badge variant={l.variante}>{l.rotulo}</Badge>
                  {l.mensagem && <span className={styles.mensagem}>{l.mensagem}</span>}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {filtradas.length > 0 && (
        <Stack direction="row" justify="between" align="center" gap={12} wrap>
          <span className={styles.secundario}>
            {filtradas.length > POR_PAGINA
              ? `${inicio + 1}–${inicio + visiveis.length} de ${filtradas.length} arquivo(s)`
              : `${filtradas.length} arquivo(s)`}
          </span>
          {totalPaginas > 1 && <Pagination page={paginaAtual} totalPages={totalPaginas} onPageChange={setPagina} />}
        </Stack>
      )}
    </Stack>
  );
}
