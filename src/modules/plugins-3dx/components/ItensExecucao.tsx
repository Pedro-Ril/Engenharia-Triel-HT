"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import type { ItemExecucao3dx } from "../types/plugins3dx.types";
import { ACAO_ITEM, rotuloObjeto } from "../utils/exibicao";
import styles from "./Plugins3dx.module.css";

const POR_PAGINA = 20;
/*
 * Título (pode ser longo): antes em cima, depois embaixo. Demais ações (revisões: "rev F (6 instâncias) → G"):
 * numa linha só. Decide pelo tipo de ação, não pelo tamanho, para a mesma tabela não misturar os dois jeitos.
 */
function deParaEmpilhado(acao: string): boolean {
  return acao.includes("titulo");
}
const SO_FALHAS = "__falhas";

/*
 * Objetos de uma execução, no detalhe. Uma liberação pode trazer centenas de linhas quase iguais (ex.: 122 usos em
 * conjuntos não liberados): filtra por tipo de ação (com a contagem de cada um), atalho "Só falhas" e pagina.
 * Montado com key = id da execução, então o filtro volta ao início ao abrir outra.
 */
export function ItensExecucao({ itens }: { itens: ItemExecucao3dx[] }) {
  const [filtro, setFiltro] = useState("");
  const [pagina, setPagina] = useState(1);

  const porAcao = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const item of itens) contagem.set(item.acao, (contagem.get(item.acao) ?? 0) + 1);
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  }, [itens]);
  const totalFalhas = useMemo(() => itens.filter((item) => !item.sucesso).length, [itens]);

  const filtrados =
    filtro === ""
      ? itens
      : filtro === SO_FALHAS
        ? itens.filter((item) => !item.sucesso)
        : itens.filter((item) => item.acao === filtro);
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);
  /* Filtrando uma ação só, a coluna Ação seria a mesma em todas as linhas. */
  const mostrarAcao = filtro === "" || filtro === SO_FALHAS;

  function escolher(valor: string) {
    setFiltro(valor);
    setPagina(1);
  }

  const opcoes = [
    { valor: "", label: "Todos", total: itens.length },
    ...porAcao.map(([acao, total]) => ({ valor: acao, label: ACAO_ITEM[acao] ?? acao, total })),
    ...(totalFalhas > 0 ? [{ valor: SO_FALHAS, label: "Só falhas", total: totalFalhas }] : []),
  ];

  return (
    <Stack gap={12}>
      <h4 className={styles.tituloSecao}>Objetos ({itens.length})</h4>

      {itens.length === 0 ? (
        <span className={styles.textoSecundario}>Nenhum objeto alterado nesta execução.</span>
      ) : (
        <>
          {opcoes.length > 2 && (
            <div className={styles.grupoOpcoes} role="group" aria-label="Filtrar objetos por ação">
              {opcoes.map((opcao) => (
                <button
                  key={opcao.valor}
                  type="button"
                  className={`${styles.opcao} ${filtro === opcao.valor ? styles.opcaoAtiva : ""}`}
                  aria-pressed={filtro === opcao.valor}
                  onClick={() => escolher(opcao.valor)}
                >
                  {opcao.label} <span className={styles.contagemOpcao}>{opcao.total}</span>
                </button>
              ))}
            </div>
          )}

          <Table minWidth={860}>
            <TableHead>
              <TableRow>
                {mostrarAcao && <TableHeaderCell>Ação</TableHeaderCell>}
                <TableHeaderCell>Objeto</TableHeaderCell>
                <TableHeaderCell>De → para</TableHeaderCell>
                <TableHeaderCell align="center">Resultado</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visiveis.map((item) => (
                <TableRow key={item.id}>
                  {mostrarAcao && (
                    <TableCell className={styles.celulaAcaoItem}>{ACAO_ITEM[item.acao] ?? item.acao}</TableCell>
                  )}
                  <TableCell className={styles.celulaObjetoItem}>
                    <div className={styles.celulaObjeto}>
                      <span className={styles.nomeObjeto}>
                        {rotuloObjeto(item.alvoNome, item.alvoRevisao, item.alvoTitulo)}
                      </span>
                      {(item.alvoEstado || item.alvoOwner) && (
                        <span className={styles.textoSecundario}>
                          {[item.alvoEstado, item.alvoOwner && `responsável: ${item.alvoOwner}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                      {item.mensagem && (
                        <span className={item.sucesso ? styles.textoSecundario : styles.noErro}>{item.mensagem}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className={styles.celulaDePara}>
                    <div className={deParaEmpilhado(item.acao) ? styles.dePara : styles.deParaLinha}>
                      <span className={styles.deParaAntes}>{item.valorAntes ?? "—"}</span>
                      <span className={styles.deParaDepois}>
                        <span className={styles.deParaSeta}>→</span>
                        {item.valorDepois ?? "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell align="center">
                    <Badge variant={item.sucesso ? "success" : "danger"}>{item.sucesso ? "OK" : "Falha"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPaginas > 1 && (
            <Stack direction="row" justify="between" align="center" wrap>
              <span className={styles.textoSecundario}>
                {(paginaAtual - 1) * POR_PAGINA + 1}–{Math.min(paginaAtual * POR_PAGINA, filtrados.length)} de{" "}
                {filtrados.length}
              </span>
              <Pagination page={paginaAtual} totalPages={totalPaginas} onPageChange={setPagina} />
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
