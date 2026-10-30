"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";

import {
  buscarGravacaoFator,
  listarGravacoesFator,
  listarSeparacoes,
  type GravacaoFator,
  type ItemGravacaoFator,
  type Separacao,
  type TipoGravacaoFator,
} from "../services/engenhariaVersatil.service";
import styles from "./EngenhariaVersatil.module.css";

const POR_PAGINA = 20;

function formatarData(valorIso: string | null): string {
  return valorIso ? new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "-";
}

function num(valor: number | null, casas: number): string {
  return valor === null ? "—" : valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/* Texto digitado -> aplicado depois de 400 ms parado (padrão das buscas do Portal). */
function useDebounce(valor: string): string {
  const [aplicado, setAplicado] = useState(valor);
  useEffect(() => {
    const timer = setTimeout(() => setAplicado(valor.trim()), 400);
    return () => clearTimeout(timer);
  }, [valor]);
  return aplicado;
}

/*
 * Histórico da Engenharia Versátil em duas abas: as separações (pastas e
 * desenhos) e as gravações no ERP (fatores de conversão e ajustes de
 * peso). Cada aba guarda os próprios filtros e página.
 */
export function HistoricoVersatil({ recarga, onAbrirSeparacao }: { recarga: number; onAbrirSeparacao: (id: string) => void }) {
  const [aba, setAba] = useState("separacoes");

  return (
    <Card title="Histórico" description="Tudo o que o módulo fez, das ações mais recentes para as mais antigas. Clique numa linha para ver os detalhes.">
      <Tabs
        ariaLabel="Histórico da Engenharia Versátil"
        value={aba}
        onValueChange={setAba}
        items={[
          { value: "separacoes", label: "Separações", content: <HistoricoSeparacoes recarga={recarga} onAbrir={onAbrirSeparacao} /> },
          { value: "fatores", label: "Fatores e pesos", content: <HistoricoFatores recarga={recarga} /> },
        ]}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ separações */

function HistoricoSeparacoes({ recarga, onAbrir }: { recarga: number; onAbrir: (id: string) => void }) {
  const [projeto, setProjeto] = useState("");
  const [usuario, setUsuario] = useState("");
  const projetoAplicado = useDebounce(projeto);
  const usuarioAplicado = useDebounce(usuario);
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<{ itens: Separacao[]; total: number } | null>(null);
  /* Filtro novo volta para a página 1 (chave dos filtros muda -> página que vale é a 1). */
  const chaveFiltros = `${projetoAplicado}|${usuarioAplicado}`;
  const [chaveDaPagina, setChaveDaPagina] = useState(chaveFiltros);
  const paginaAtual = chaveDaPagina === chaveFiltros ? pagina : 1;

  useEffect(() => {
    let ativo = true;
    listarSeparacoes({ pagina: paginaAtual, porPagina: POR_PAGINA, projeto: projetoAplicado, usuario: usuarioAplicado }).then((r) => {
      if (ativo && r.ok && r.data) setDados(r.data);
    });
    return () => {
      ativo = false;
    };
  }, [paginaAtual, projetoAplicado, usuarioAplicado, recarga]);

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / POR_PAGINA)) : 1;
  const filtrando = Boolean(projetoAplicado || usuarioAplicado);

  return (
    <Stack gap={16}>
      <div className={styles.filtrosHistorico}>
        <Field label="Projeto" htmlFor="histSepProjeto">
          <Input id="histSepProjeto" value={projeto} placeholder="Ex.: 1111" onChange={(e) => setProjeto(e.target.value)} />
        </Field>
        <Field label="Quem" htmlFor="histSepUsuario">
          <Input id="histSepUsuario" value={usuario} placeholder="Nome" onChange={(e) => setUsuario(e.target.value)} />
        </Field>
      </div>

      {!dados ? (
        <Loader label="Carregando…" />
      ) : dados.itens.length === 0 ? (
        <EmptyState icon={<History size={28} />} title={filtrando ? "Nenhuma separação com esses filtros" : "Nenhuma separação ainda"} />
      ) : (
        <Table minWidth={820}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Quando</TableHeaderCell>
              <TableHeaderCell>Projeto</TableHeaderCell>
              <TableHeaderCell>Planilha</TableHeaderCell>
              <TableHeaderCell>Situação</TableHeaderCell>
              <TableHeaderCell align="right">Pastas</TableHeaderCell>
              <TableHeaderCell align="right">Copiados</TableHeaderCell>
              <TableHeaderCell align="right">Não encontrados</TableHeaderCell>
              <TableHeaderCell align="right">Erros</TableHeaderCell>
              <TableHeaderCell>Quem</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dados.itens.map((s) => (
              <TableRow key={s.id} style={{ cursor: "pointer" }} onClick={() => onAbrir(s.id)}>
                <TableCell>{formatarData(s.criadoEm)}</TableCell>
                <TableCell>
                  <strong>{s.numeroProjeto}</strong>
                </TableCell>
                <TableCell>{s.arquivoPlanilha}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "concluida" ? "success" : s.status === "erro" ? "danger" : "info"}>
                    {s.status === "concluida" ? "Concluída" : s.status === "erro" ? "Erro" : "Executando"}
                  </Badge>
                </TableCell>
                <TableCell align="right">{s.pastasCriadas}</TableCell>
                <TableCell align="right">{s.arquivosCopiados}</TableCell>
                <TableCell align="right">{s.arquivosNaoEncontrados}</TableCell>
                <TableCell align="right">{s.arquivosComErro}</TableCell>
                <TableCell>{s.usuarioNome}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {dados && dados.total > 0 && (
        <Stack direction="row" justify="between" align="center" gap={12} wrap>
          <span className={styles.secundario}>{dados.total} separação(ões)</span>
          {totalPaginas > 1 && (
            <Pagination
              page={paginaAtual}
              totalPages={totalPaginas}
              onPageChange={(p) => {
                setChaveDaPagina(chaveFiltros);
                setPagina(p);
              }}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}

/* ------------------------------------------------------------------ fatores e pesos */

const ACAO_ITEM: Record<string, { rotulo: string; variante: "success" | "info" | "neutral" | "danger" }> = {
  incluido: { rotulo: "Incluído", variante: "success" },
  alterado: { rotulo: "Alterado", variante: "success" },
  mantido: { rotulo: "Mantido", variante: "neutral" },
  peso_e_fator: { rotulo: "Peso e fator", variante: "info" },
  erro: { rotulo: "Erro", variante: "danger" },
};

const ORIGEM_PESO: Record<string, string> = { erp: "ERP", planilha: "Planilha", digitado: "Digitado" };

function HistoricoFatores({ recarga }: { recarga: number }) {
  const [projeto, setProjeto] = useState("");
  const [codigo, setCodigo] = useState("");
  const [usuario, setUsuario] = useState("");
  const [ambiente, setAmbiente] = useState<"" | "teste" | "producao">("");
  const [tipo, setTipo] = useState<"" | TipoGravacaoFator>("");
  const projetoAplicado = useDebounce(projeto);
  const codigoAplicado = useDebounce(codigo);
  const usuarioAplicado = useDebounce(usuario);
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<{ itens: GravacaoFator[]; total: number } | null>(null);
  const [aberta, setAberta] = useState<{ gravacao: GravacaoFator; itens: ItemGravacaoFator[] } | null>(null);
  const chaveFiltros = `${projetoAplicado}|${codigoAplicado}|${usuarioAplicado}|${ambiente}|${tipo}`;
  const [chaveDaPagina, setChaveDaPagina] = useState(chaveFiltros);
  const paginaAtual = chaveDaPagina === chaveFiltros ? pagina : 1;

  useEffect(() => {
    let ativo = true;
    listarGravacoesFator({
      pagina: paginaAtual,
      porPagina: POR_PAGINA,
      projeto: projetoAplicado,
      codigo: codigoAplicado,
      usuario: usuarioAplicado,
      ambiente,
      tipo,
    }).then((r) => {
      if (ativo && r.ok && r.data) setDados(r.data);
    });
    return () => {
      ativo = false;
    };
  }, [paginaAtual, projetoAplicado, codigoAplicado, usuarioAplicado, ambiente, tipo, recarga]);

  async function abrir(id: string) {
    const r = await buscarGravacaoFator(id);
    if (r.ok && r.data) setAberta(r.data);
  }

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / POR_PAGINA)) : 1;
  const filtrando = Boolean(projetoAplicado || codigoAplicado || usuarioAplicado || ambiente || tipo);

  return (
    <Stack gap={16}>
      <div className={styles.filtrosHistorico}>
        <Field label="Projeto" htmlFor="histFatProjeto">
          <Input id="histFatProjeto" value={projeto} placeholder="Ex.: 1111" onChange={(e) => setProjeto(e.target.value)} />
        </Field>
        <Field label="Item" htmlFor="histFatCodigo">
          <Input id="histFatCodigo" value={codigo} placeholder="Código" onChange={(e) => setCodigo(e.target.value)} />
        </Field>
        <Field label="Quem" htmlFor="histFatUsuario">
          <Input id="histFatUsuario" value={usuario} placeholder="Nome" onChange={(e) => setUsuario(e.target.value)} />
        </Field>
        <Field label="Ambiente">
          <Dropdown
            value={ambiente}
            options={[
              { value: "", label: "Todos" },
              { value: "teste", label: "Teste" },
              { value: "producao", label: "Produção" },
            ]}
            onValueChange={(v) => setAmbiente(v as "" | "teste" | "producao")}
          />
        </Field>
        <Field label="Tipo">
          <Dropdown
            value={tipo}
            options={[
              { value: "", label: "Todos" },
              { value: "fator", label: "Gravação de fatores" },
              { value: "peso", label: "Ajuste de peso" },
            ]}
            onValueChange={(v) => setTipo(v as "" | TipoGravacaoFator)}
          />
        </Field>
      </div>

      {!dados ? (
        <Loader label="Carregando…" />
      ) : dados.itens.length === 0 ? (
        <EmptyState icon={<History size={28} />} title={filtrando ? "Nenhuma gravação com esses filtros" : "Nenhuma gravação no ERP ainda"} />
      ) : (
        <Table minWidth={900}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Quando</TableHeaderCell>
              <TableHeaderCell>Projeto</TableHeaderCell>
              <TableHeaderCell>Tipo</TableHeaderCell>
              <TableHeaderCell>ERP</TableHeaderCell>
              <TableHeaderCell>Itens</TableHeaderCell>
              <TableHeaderCell align="right">Incluídos</TableHeaderCell>
              <TableHeaderCell align="right">Alterados</TableHeaderCell>
              <TableHeaderCell>Situação</TableHeaderCell>
              <TableHeaderCell>Quem</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {dados.itens.map((g) => (
              <TableRow key={g.id} style={{ cursor: "pointer" }} onClick={() => void abrir(g.id)}>
                <TableCell>{formatarData(g.criadoEm)}</TableCell>
                <TableCell>
                  <strong>{g.numeroProjeto}</strong>
                </TableCell>
                <TableCell>
                  <Badge variant={g.tipo === "peso" ? "info" : "neutral"}>{g.tipo === "peso" ? "Ajuste de peso" : "Fatores"}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={g.ambiente === "producao" ? "danger" : "warning"}>{g.ambiente === "producao" ? "Produção" : "Teste"}</Badge>
                </TableCell>
                <TableCell>
                  <span className={styles.codigosResumo}>
                    {g.codigos}
                    {g.totalItens > 5 ? ` +${g.totalItens - 5}` : ""}
                  </span>
                </TableCell>
                <TableCell align="right">{g.incluidos}</TableCell>
                <TableCell align="right">{g.alterados}</TableCell>
                <TableCell>
                  <Badge variant={g.status === "concluida" ? "success" : "danger"}>{g.status === "concluida" ? "Concluída" : "Erro"}</Badge>
                </TableCell>
                <TableCell>{g.usuarioNome}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {dados && dados.total > 0 && (
        <Stack direction="row" justify="between" align="center" gap={12} wrap>
          <span className={styles.secundario}>{dados.total} gravação(ões)</span>
          {totalPaginas > 1 && (
            <Pagination
              page={paginaAtual}
              totalPages={totalPaginas}
              onPageChange={(p) => {
                setChaveDaPagina(chaveFiltros);
                setPagina(p);
              }}
            />
          )}
        </Stack>
      )}

      {aberta && (
        <Modal
          open
          size="xlarge"
          title={`${aberta.gravacao.tipo === "peso" ? "Ajuste de peso" : "Gravação de fatores"} · projeto ${aberta.gravacao.numeroProjeto}`}
          description={`${aberta.gravacao.usuarioNome} · ${formatarData(aberta.gravacao.criadoEm)} · ERP ${aberta.gravacao.ambiente === "producao" ? "Produção" : "Teste"}, empresa ${aberta.gravacao.codEmpresa}`}
          onClose={() => setAberta(null)}
          footer={
            <Button variant="secondary" onClick={() => setAberta(null)}>
              Fechar
            </Button>
          }
        >
          <Stack gap={12}>
            {aberta.gravacao.mensagem && <span className={styles.secundario}>{aberta.gravacao.mensagem}</span>}
            <Table minWidth={980}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Código</TableHeaderCell>
                  <TableHeaderCell>Unid.</TableHeaderCell>
                  <TableHeaderCell align="right">Peso planilha</TableHeaderCell>
                  <TableHeaderCell align="right">Peso ERP (antes → depois)</TableHeaderCell>
                  <TableHeaderCell align="right">Bruto (antes → depois)</TableHeaderCell>
                  <TableHeaderCell align="right">Fator (antes → depois)</TableHeaderCell>
                  <TableHeaderCell>Peso usado</TableHeaderCell>
                  <TableHeaderCell>Resultado</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {aberta.itens.map((i) => (
                  <TableRow key={i.ordem}>
                    <TableCell>
                      <strong>{i.codigo}</strong>
                    </TableCell>
                    <TableCell>{i.unidEstoque ?? "—"}</TableCell>
                    <TableCell align="right">
                      <span className={styles.numero}>{num(i.pesoPlanilha, 4)}</span>
                    </TableCell>
                    <TableCell align="right">
                      <span className={styles.numero}>
                        {num(i.pesoErp, 4)}
                        {i.pesoNovo !== null && ` → ${num(i.pesoNovo, 4)}`}
                      </span>
                    </TableCell>
                    <TableCell align="right">
                      <span className={styles.numero}>
                        {i.pesoBrtAntes === null && i.pesoBrtNovo === null ? "—" : `${num(i.pesoBrtAntes, 4)} → ${num(i.pesoBrtNovo, 4)}`}
                      </span>
                    </TableCell>
                    <TableCell align="right">
                      <span className={styles.numero}>
                        {num(i.taxaAntes, 6)} → {num(i.taxaNova, 6)}
                      </span>
                    </TableCell>
                    <TableCell>{ORIGEM_PESO[i.origemPeso] ?? i.origemPeso}</TableCell>
                    <TableCell>
                      <Stack gap={4}>
                        <Badge variant={(ACAO_ITEM[i.acao] ?? ACAO_ITEM.erro).variante}>{(ACAO_ITEM[i.acao] ?? { rotulo: i.acao }).rotulo}</Badge>
                        {i.mensagem && <span className={styles.mensagem}>{i.mensagem}</span>}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Stack>
        </Modal>
      )}
    </Stack>
  );
}
