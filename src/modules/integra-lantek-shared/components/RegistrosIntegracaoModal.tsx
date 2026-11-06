"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import {
  buscarRegistroLantek,
  listarRegistrosLantek,
  type EventoLantekDetalhe,
  type EventoLantekResumo,
  type ModuloLantek,
  type TipoEventoLantek,
} from "../services/registros.service";
import styles from "./RegistrosIntegracaoModal.module.css";

/*
 * Registros da Integra Lantek: cada pesquisa de ordem/lote no ERP, cada
 * busca de DXF e cada exportação, com o detalhe por peça -- para achar em
 * que etapa um DXF trocou de peça. Lista com filtro (ordem, lote, item,
 * DXF) e, ao clicar, o detalhe do registro.
 */

const POR_PAGINA = 20;

const ETAPA: Record<TipoEventoLantek, { texto: string; variant: "info" | "neutral" | "success" }> = {
  pesquisa_erp: { texto: "Pesquisa no ERP", variant: "info" },
  validacao_dxf: { texto: "Busca de DXF", variant: "neutral" },
  exportacao: { texto: "Exportação", variant: "success" },
};

function dataHora(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? iso
    : data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* Nome do arquivo (o caminho inteiro fica no title). */
function nomeArquivo(caminho: string | null | undefined): string {
  if (!caminho) return "—";
  return caminho.split(/[\\/]/).pop() || caminho;
}

function texto(valor: unknown): string {
  return valor === null || valor === undefined || valor === "" ? "—" : String(valor);
}

interface Props {
  open: boolean;
  modulo: ModuloLantek;
  onClose: () => void;
}

export function RegistrosIntegracaoModal({ open, modulo, onClose }: Props) {
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [itens, setItens] = useState<EventoLantekResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<EventoLantekDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  /* Busca com debounce de 400 ms. */
  useEffect(() => {
    const temporizador = setTimeout(() => {
      setBusca(buscaDigitada);
      setPagina(1);
    }, 400);
    return () => clearTimeout(temporizador);
  }, [buscaDigitada]);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true);
    listarRegistrosLantek({ modulo, busca, pagina, porPagina: POR_PAGINA }).then((resultado) => {
      if (cancelado) return;
      if (resultado.ok && resultado.data) {
        setItens(resultado.data.itens);
        setTotal(resultado.data.total);
        setErro(null);
      } else {
        setErro(resultado.message ?? "Não foi possível carregar os registros.");
      }
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
  }, [open, modulo, busca, pagina]);

  async function abrirDetalhe(id: string) {
    setCarregandoDetalhe(true);
    const resultado = await buscarRegistroLantek(id);
    setCarregandoDetalhe(false);
    if (resultado.ok && resultado.data) setDetalhe(resultado.data);
    else setErro(resultado.message ?? "Não foi possível carregar o registro.");
  }

  function fechar() {
    setDetalhe(null);
    onClose();
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <Modal
      open={open}
      size="xlarge"
      title={detalhe ? ETAPA[detalhe.tipo].texto : "Registros da integração"}
      description={
        detalhe
          ? `${dataHora(detalhe.criadoEm)} · ${detalhe.usuarioNome ?? "—"}`
          : "Pesquisas de ordem e lote no ERP, buscas de DXF e exportações, com o detalhe por peça."
      }
      onClose={fechar}
    >
      {detalhe ? (
        <Stack gap={16}>
          <div>
            <Button variant="secondary" onClick={() => setDetalhe(null)}>
              <ArrowLeft size={16} />
              Voltar à lista
            </Button>
          </div>
          <p className={styles.resumo}>{detalhe.resumo}</p>
          {detalhe.erro && <Alert variant="danger">{detalhe.erro}</Alert>}
          <DetalheRegistro detalhe={detalhe} />
        </Stack>
      ) : (
        <Stack gap={16}>
          <Input
            value={buscaDigitada}
            onChange={(event) => setBuscaDigitada(event.target.value)}
            placeholder="Filtrar por ordem, lote, item, desenho, DXF ou usuário"
          />
          {erro && <Alert variant="danger">{erro}</Alert>}
          {carregando || carregandoDetalhe ? (
            <Loader label="Carregando registros..." />
          ) : itens.length === 0 ? (
            <EmptyState title="Nenhum registro" description="Os registros aparecem a partir das próximas pesquisas e exportações." />
          ) : (
            <div className={styles.tabelaRolagem}>
              <Table minWidth={900}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Quando</TableHeaderCell>
                    <TableHeaderCell>Etapa</TableHeaderCell>
                    <TableHeaderCell>Resumo</TableHeaderCell>
                    <TableHeaderCell>Usuário</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {itens.map((item) => (
                    <TableRow key={item.id} className={styles.linhaClicavel} onClick={() => abrirDetalhe(item.id)}>
                      <TableCell>
                        <span className={styles.semQuebra}>{dataHora(item.criadoEm)}</span>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" gap={6} align="center">
                          <Badge variant={item.sucesso ? ETAPA[item.tipo].variant : "danger"}>{ETAPA[item.tipo].texto}</Badge>
                          {(item.totalAlertas ?? 0) > 0 && <Badge variant="warning">{item.totalAlertas} alerta(s)</Badge>}
                        </Stack>
                      </TableCell>
                      <TableCell>{item.resumo}</TableCell>
                      <TableCell>{item.usuarioNome ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPaginas > 1 && <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />}
        </Stack>
      )}
    </Modal>
  );
}

function DetalheRegistro({ detalhe }: { detalhe: EventoLantekDetalhe }) {
  if (detalhe.tipo === "exportacao") {
    if (detalhe.itensExportados.length === 0) return <EmptyState title="Sem linhas registradas" />;
    return (
      <div className={styles.tabelaRolagem}>
        <Table minWidth={1300}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>#</TableHeaderCell>
              <TableHeaderCell>Ordem</TableHeaderCell>
              <TableHeaderCell>Lote</TableHeaderCell>
              <TableHeaderCell>Item</TableHeaderCell>
              <TableHeaderCell>Desenho</TableHeaderCell>
              <TableHeaderCell>Qtde</TableHeaderCell>
              <TableHeaderCell>DXF na planilha</TableHeaderCell>
              <TableHeaderCell>DXF que a busca escolhe</TableHeaderCell>
              <TableHeaderCell>Arquivo</TableHeaderCell>
              <TableHeaderCell>Alertas</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {detalhe.itensExportados.map((item) => (
              <TableRow key={item.linha} className={item.alertas ? styles.linhaAlerta : undefined}>
                <TableCell>{item.linha}</TableCell>
                <TableCell>{texto(item.numOrdem)}</TableCell>
                <TableCell>{texto(item.numLote)}</TableCell>
                <TableCell>{texto(item.codItem)}</TableCell>
                <TableCell>{texto(item.codDesenho)}</TableCell>
                <TableCell>{texto(item.qtde)}</TableCell>
                <TableCell>
                  <span title={item.dxfExportado ?? ""}>{nomeArquivo(item.dxfExportado)}</span>
                </TableCell>
                <TableCell>
                  <span title={item.dxfServidor ?? ""}>
                    {nomeArquivo(item.dxfServidor)}
                    {item.origemServidor === "cod_desenho" ? " (pelo desenho)" : item.origemServidor === "codigo" ? " (pelo item)" : ""}
                  </span>
                  {item.candidatosCodigo.length + item.candidatosDesenho.length > 1 && (
                    <span className={styles.candidatos} title={[...item.candidatosCodigo, ...item.candidatosDesenho].join("\n")}>
                      {item.candidatosCodigo.length} pelo item · {item.candidatosDesenho.length} pelo desenho
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <span className={styles.semQuebra}>
                    {item.dxfModificadoEm ?? "—"}
                    {item.dxfTamanho !== null ? ` · ${(item.dxfTamanho / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB` : ""}
                  </span>
                </TableCell>
                <TableCell>{item.alertas ? <span className={styles.alerta}>{item.alertas}</span> : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  const linhas = Array.isArray(detalhe.resultado) ? (detalhe.resultado as Record<string, unknown>[]) : [];

  if (detalhe.tipo === "pesquisa_erp") {
    if (linhas.length === 0) return <EmptyState title="O ERP não devolveu linhas" />;
    return (
      <div className={styles.tabelaRolagem}>
        <Table minWidth={1100}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Ordem</TableHeaderCell>
              <TableHeaderCell>Lote</TableHeaderCell>
              <TableHeaderCell>Item</TableHeaderCell>
              <TableHeaderCell>Desenho</TableHeaderCell>
              <TableHeaderCell>Descrição</TableHeaderCell>
              <TableHeaderCell>Qtde</TableHeaderCell>
              <TableHeaderCell>MP</TableHeaderCell>
              <TableHeaderCell>Máquina</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {linhas.map((linha, indice) => (
              <TableRow key={indice} className={linha.cod_item !== linha.cod_desenho && linha.cod_desenho ? styles.linhaDestaque : undefined}>
                <TableCell>{texto(linha.num_ordem)}</TableCell>
                <TableCell>{texto(linha.num_lote_pro)}</TableCell>
                <TableCell>{texto(linha.cod_item)}</TableCell>
                <TableCell>{texto(linha.cod_desenho)}</TableCell>
                <TableCell>{texto(linha.desc_tecnica)}</TableCell>
                <TableCell>{texto(linha.qtde)}</TableCell>
                <TableCell>{texto(linha.cod_item_mp)}</TableCell>
                <TableCell>{texto(linha.descricao_maquina)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className={styles.legenda}>Em destaque: linhas em que o código do desenho é diferente do código do item.</p>
      </div>
    );
  }

  if (linhas.length === 0) return <EmptyState title="Nenhum item na busca de DXF" />;
  return (
    <div className={styles.tabelaRolagem}>
      <Table minWidth={1000}>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Item</TableHeaderCell>
            <TableHeaderCell>Desenho</TableHeaderCell>
            <TableHeaderCell>Achou por</TableHeaderCell>
            <TableHeaderCell>DXF escolhido</TableHeaderCell>
            <TableHeaderCell>Outros com o mesmo nome</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {linhas.map((linha, indice) => {
            const caminhos = Array.isArray(linha.caminhos) ? (linha.caminhos as string[]) : [];
            const suspeito = linha.origem === "codigo" && linha.codDesenho && linha.codDesenho !== linha.codigo;
            return (
              <TableRow key={indice} className={!linha.caminho || linha.duplicado || suspeito ? styles.linhaAlerta : undefined}>
                <TableCell>{texto(linha.codigo)}</TableCell>
                <TableCell>{texto(linha.codDesenho)}</TableCell>
                <TableCell>
                  {linha.origem === "codigo" ? "Código do item" : linha.origem === "cod_desenho" ? "Código do desenho" : "Não achou"}
                </TableCell>
                <TableCell>
                  <span title={String(linha.caminho ?? "")}>{nomeArquivo(linha.caminho as string)}</span>
                </TableCell>
                <TableCell>
                  {caminhos.length > 1 ? (
                    <span className={styles.alerta} title={caminhos.join("\n")}>
                      {caminhos.length} arquivos: {caminhos.map((c) => c.split(/[\\/]/).slice(-2).join("\\")).join(" · ")}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className={styles.legenda}>
        Em destaque: sem DXF, mais de um DXF com o mesmo nome, ou DXF achado pelo código do item quando o desenho tem outro código.
      </p>
    </div>
  );
}
