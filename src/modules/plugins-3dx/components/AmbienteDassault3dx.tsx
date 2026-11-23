"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, History, RefreshCw, Server, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { buscarVerificacaoAmbiente, verificarAmbienteAgora } from "../services/plugins3dx.service";
import type { Ambiente3dx, Servidor3dx, VerificacaoAmbiente3dx } from "../types/plugins3dx.types";
import {
  AMBIENTE,
  formatarDataHora,
  formatarDataHoraCurta,
  SITUACAO_VISUALIZACAO,
  STATUS_VERIFICACAO,
} from "../utils/exibicao";
import styles from "./Plugins3dx.module.css";

/* A verificação roda no servidor a cada ~15 min; a tela só relê o resultado de minuto em minuto. */
const RELEITURA_MS = 60_000;

export interface EstadoVerificacaoAmbiente {
  dados: VerificacaoAmbiente3dx | null;
  erro: string | null;
  carregando: boolean;
  verificando: boolean;
  verificarAgora: () => Promise<void>;
}

/*
 * Verificação do ambiente 3DX (lida uma vez na Visão geral e repartida): o card do ambiente usa a versão de cada
 * nó; o card do padrão de visualização usa a situação dos arquivos.
 */
export function useVerificacaoAmbiente(onFeedback: FeedbackHandler): EstadoVerificacaoAmbiente {
  const [dados, setDados] = useState<VerificacaoAmbiente3dx | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    function ler() {
      buscarVerificacaoAmbiente().then((resposta) => {
        if (cancelado) return;
        if (resposta.ok && resposta.data) {
          setDados(resposta.data);
          setErro(null);
        } else {
          setErro(resposta.message ?? "Não foi possível carregar a verificação do ambiente.");
        }
        setCarregando(false);
      });
    }
    ler();
    const timer = setInterval(ler, RELEITURA_MS);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, []);

  async function verificarAgora() {
    setVerificando(true);
    const resposta = await verificarAmbienteAgora();
    setVerificando(false);
    if (resposta.ok && resposta.data) {
      setDados(resposta.data);
      setErro(null);
      onFeedback("success", "Ambiente verificado", resposta.message ?? "");
    } else {
      onFeedback("danger", "Não foi possível verificar", resposta.message ?? "");
    }
  }

  return { dados, erro, carregando, verificando, verificarAgora };
}

function filtrar(servidores: Servidor3dx[] | undefined, ambiente: Ambiente3dx | null) {
  return (servidores ?? []).filter((s) => !ambiente || s.ambiente === ambiente);
}

function NomeServidor({ servidor }: { servidor: Servidor3dx }) {
  return (
    <div className={styles.celulaObjeto}>
      <span className={styles.nomeObjeto}>{servidor.nome}</span>
      <span className={styles.ambienteMini}>
        <span className={styles[`ponto_${servidor.ambiente}`]} aria-hidden="true" />
        {AMBIENTE[servidor.ambiente].label}
        {!servidor.ativo && " · inativo"}
      </span>
    </div>
  );
}

/*
 * Ambiente 3DEXPERIENCE (infraestrutura da Dassault): o build de cada nó do 3DSpace, desde quando, e se ele
 * responde. Um build novo = hotfix aplicado: hora de conferir as melhorias (autoteste dos plugins e o padrão de
 * visualização, nos cards abaixo).
 */
export function AmbienteDassault3dx({
  ambiente,
  estado,
}: {
  ambiente: Ambiente3dx | null;
  estado: EstadoVerificacaoAmbiente;
}) {
  const { dados, erro, carregando, verificando, verificarAgora } = estado;
  const servidores = filtrar(dados?.servidores, ambiente);

  const descricao =
    "Versão da Dassault em cada nó do 3DSpace. Quando muda, houve hotfix: confira as melhorias abaixo." +
    (dados
      ? ` Conferido a cada ${dados.intervaloMinutos} min` +
        (dados.ultimaVerificacaoEm ? `; última vez em ${formatarDataHoraCurta(dados.ultimaVerificacaoEm)}.` : ".")
      : "");

  return (
    <Card
      title="Ambiente 3DEXPERIENCE"
      description={descricao}
      actions={
        <Button variant="secondary" onClick={verificarAgora} loading={verificando} disabled={!dados}>
          <RefreshCw size={15} />
          Verificar agora
        </Button>
      }
    >
      {carregando ? (
        <Loader label="Carregando verificação do ambiente..." />
      ) : erro || !dados ? (
        <EmptyState icon={<ShieldCheck size={26} />} title="Verificação indisponível" description={erro ?? ""} />
      ) : servidores.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={26} />}
          title="Nenhum servidor"
          description={ambiente ? "Nenhum nó do 3DSpace cadastrado neste ambiente." : "Nenhum nó do 3DSpace cadastrado."}
        />
      ) : (
        <Table minWidth={720}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Servidor</TableHeaderCell>
              <TableHeaderCell>Versão do 3DEXPERIENCE</TableHeaderCell>
              <TableHeaderCell>Situação</TableHeaderCell>
              <TableHeaderCell align="right">Verificado</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {servidores.map((servidor) => {
              const versao = servidor.versao3dx;
              return (
                <TableRow key={servidor.id} className={servidor.ativo ? undefined : styles.linhaInativa}>
                  <TableCell>
                    <NomeServidor servidor={servidor} />
                  </TableCell>
                  <TableCell>
                    {!versao ? (
                      <span className={styles.textoSecundario}>ainda não verificado</span>
                    ) : (
                      <div className={styles.celulaObjeto}>
                        <span className={styles.mono}>{versao.valor ?? "—"}</span>
                        {versao.status !== "erro" && (
                          <span className={styles.textoSecundario} title={formatarDataHora(versao.mudouEm)}>
                            nesta versão desde {formatarDataHoraCurta(versao.mudouEm)}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {!versao ? (
                      <span className={styles.textoSecundario}>—</span>
                    ) : (
                      <div className={styles.celulaObjeto}>
                        <span>
                          <Badge variant={STATUS_VERIFICACAO[versao.status].variante}>
                            {versao.status === "ok"
                              ? "Respondendo"
                              : versao.status === "erro"
                                ? "Sem resposta"
                                : STATUS_VERIFICACAO[versao.status].label}
                          </Badge>
                        </span>
                        {versao.mensagem && versao.status !== "ok" && (
                          <span className={versao.status === "erro" ? styles.noErro : styles.textoSecundario}>
                            {versao.mensagem}
                            {versao.status === "erro" && ` (desde ${formatarDataHoraCurta(versao.mudouEm)})`}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell align="right" style={{ whiteSpace: "nowrap" }}>
                    <span
                      className={styles.textoSecundario}
                      title={versao ? formatarDataHora(versao.verificadoEm) : undefined}
                    >
                      {versao ? formatarDataHoraCurta(versao.verificadoEm) : "—"}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

/*
 * Padrão de visualização do "Abrir com" (3DPlay e 3D Navigate): melhoria da Triel-HT que NÃO é plugin -- é um
 * ajuste em 4 arquivos estáticos do 3DSpace, aplicado por script (plugins-3dx/triel-visualizacao). Por isso não tem
 * modo nem fila; o que importa é se continua aplicado em cada nó (um hotfix pode voltar o arquivo ao original).
 */
export function PadraoVisualizacao3dx({
  ambiente,
  estado,
  temVersoes,
  onVerVersoes,
}: {
  ambiente: Ambiente3dx | null;
  estado: EstadoVerificacaoAmbiente;
  temVersoes: boolean;
  onVerVersoes: () => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const { dados, erro, carregando } = estado;
  /* Erro na verificação já aparece no card do ambiente; aqui só some. */
  if (carregando || erro || !dados) return null;
  const servidores = filtrar(dados.servidores, ambiente);

  return (
    <Card
      title='Padrão de visualização ("Abrir com")'
      description="Ajuste de arquivos, não é plugin: o 3DPlay e o 3D Navigate abrem com qualidade alta, todas as arestas, sem perspectiva e a vista padrão da Triel-HT. Aplicado por script em 4 arquivos do 3DSpace; um hotfix da Dassault pode desfazer."
      actions={
        temVersoes ? (
          <Button variant="secondary" onClick={onVerVersoes}>
            <History size={15} />
            Versões
          </Button>
        ) : undefined
      }
    >
      <div className={styles.nos}>
        {servidores.map((servidor) => {
          const visualizacao = servidor.visualizacao;
          const situacao = visualizacao?.valor as keyof typeof SITUACAO_VISUALIZACAO | null | undefined;
          const arquivos = visualizacao?.arquivos ?? [];
          const expandido = aberto === servidor.id;
          return (
            <div key={servidor.id} className={styles.noComArquivos}>
              <div className={styles.no}>
                <div className={styles.noIdentificacao}>
                  <span className={styles.noIcone} aria-hidden="true">
                    <Server size={16} />
                  </span>
                  <div className={styles.noInfo}>
                    <span className={styles.noNome}>{servidor.nome}</span>
                    <span className={styles.textoSecundario}>
                      {visualizacao
                        ? `${situacao === "aplicado" ? "aplicado" : "nesta situação"} desde ${formatarDataHoraCurta(visualizacao.mudouEm)} · verificado em ${formatarDataHoraCurta(visualizacao.verificadoEm)}`
                        : "ainda não verificado"}
                    </span>
                    {visualizacao?.mensagem && visualizacao.status !== "ok" && (
                      <span className={visualizacao.status === "erro" ? styles.noErro : styles.textoSecundario}>
                        {visualizacao.mensagem}
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.noStatus}>
                  <Badge variant={AMBIENTE[servidor.ambiente].variante}>{AMBIENTE[servidor.ambiente].label}</Badge>
                  {visualizacao &&
                    (situacao && SITUACAO_VISUALIZACAO[situacao] ? (
                      <Badge variant={SITUACAO_VISUALIZACAO[situacao].variante}>
                        {SITUACAO_VISUALIZACAO[situacao].label}
                      </Badge>
                    ) : (
                      <Badge variant={STATUS_VERIFICACAO[visualizacao.status].variante}>
                        {visualizacao.status === "erro" ? "Sem resposta" : STATUS_VERIFICACAO[visualizacao.status].label}
                      </Badge>
                    ))}
                  {arquivos.length > 0 && (
                    <button
                      type="button"
                      className={styles.botaoArquivos}
                      aria-expanded={expandido}
                      onClick={() => setAberto((atual) => (atual === servidor.id ? null : servidor.id))}
                    >
                      {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {arquivos.length} arquivos
                    </button>
                  )}
                </div>
              </div>

              {expandido && (
                <ul className={styles.listaArquivos}>
                  {arquivos.map((arquivo) => (
                    <li key={arquivo.caminho} className={styles.itemArquivo}>
                      <span>
                        <Badge variant={SITUACAO_VISUALIZACAO[arquivo.situacao].variante}>
                          {SITUACAO_VISUALIZACAO[arquivo.situacao].label}
                        </Badge>
                      </span>
                      <div className={styles.celulaObjeto}>
                        <span>{arquivo.descricao}</span>
                        <span className={`${styles.mono} ${styles.textoSecundario}`}>{arquivo.caminho}</span>
                        {arquivo.mensagem && <span className={styles.textoSecundario}>{arquivo.mensagem}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
