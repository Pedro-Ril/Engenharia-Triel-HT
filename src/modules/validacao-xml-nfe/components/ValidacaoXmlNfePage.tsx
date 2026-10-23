"use client";

import { useEffect, useState } from "react";
import { ChevronRight, CircleCheck, CircleX, Download, FileCheck2, Home, Lightbulb, RefreshCw } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FileUpload } from "@/components/ui/FileUpload";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { StatCard } from "@/components/ui/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";

import { EXEMPLOS_NFE } from "../constants/exemplos-nfe";
import {
  listarValidacoes,
  registrarValidacao,
  urlDownloadXml,
} from "../services/validacaoXmlNfe.service";
import type {
  Apontamento,
  CampoVeiculo,
  ItemNota,
  NotaValidada,
  RegistroValidacao,
  ResultadoArquivo,
  SituacaoNota,
  SituacaoRegistro,
} from "../types/validacaoXmlNfe.types";
import { validarXmlNfe } from "../utils/validar-nfe";
import styles from "./ValidacaoXmlNfePage.module.css";

const ROTULO_SITUACAO: Record<SituacaoNota, string> = {
  valido: "Válido",
  invalido: "Inválido",
};

const VARIANTE_SITUACAO: Record<SituacaoNota, "success" | "danger"> = {
  valido: "success",
  invalido: "danger",
};

const ROTULO_REGISTRO: Record<SituacaoRegistro, string> = {
  ...ROTULO_SITUACAO,
  falha: "XML inválido",
};

const VARIANTE_REGISTRO: Record<SituacaoRegistro, "success" | "danger"> = {
  ...VARIANTE_SITUACAO,
  falha: "danger",
};

function formatarMoeda(valor: number | null): string {
  if (valor === null) return "-";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataHora(valor: string): string {
  if (!valor) return "-";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleString("pt-BR");
}

function formatarDocumento(valor: string): string {
  if (/^\d{14}$/.test(valor)) {
    return valor.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (/^\d{11}$/.test(valor)) {
    return valor.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return valor || "-";
}

function Dado({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={styles.dado}>
      <dt>{rotulo}</dt>
      <dd className={destaque ? styles.dadoDestaque : undefined}>{valor || "-"}</dd>
    </div>
  );
}

/* Recusados primeiro, mantendo a ordem do schema dentro de cada grupo. */
function camposRecusadosPrimeiro(campos: CampoVeiculo[]): CampoVeiculo[] {
  return [...campos.filter((c) => c.motivoRecusa), ...campos.filter((c) => !c.motivoRecusa)];
}

function ResumoSchema({ campos }: { campos: CampoVeiculo[] }) {
  const recusados = campos.filter((c) => c.motivoRecusa).length;

  return recusados > 0 ? (
    <Badge variant="danger">SEFAZ: {recusados === 1 ? "1 campo recusado" : `${recusados} campos recusados`}</Badge>
  ) : (
    <Badge variant="success">SEFAZ: {campos.length} campos aceitos</Badge>
  );
}

function ItemDaNota({ item }: { item: ItemNota }) {
  return (
    <div className={styles.item}>
      <div className={styles.itemCabecalho}>
        <strong>
          Item {item.numeroItem} · {item.codigo}
        </strong>
        <span>{item.descricao}</span>
      </div>

      <dl className={styles.grade}>
        <Dado rotulo="NCM" valor={item.ncm} />
        <Dado rotulo="CFOP" valor={item.cfop} />
        <Dado rotulo="Quantidade" valor={item.quantidade} />
        <Dado rotulo="Valor" valor={formatarMoeda(item.valor)} />
        <Dado rotulo="Pedido" valor={item.pedido} />
      </dl>

      {item.ehVeiculo && (
        /* Vem fechado: o resumo já diz se o bloco veio e se passa no schema. */
        <details className={styles.veiculo}>
          <summary className={styles.veiculoTitulo}>
            <ChevronRight size={16} className={styles.veiculoSeta} aria-hidden="true" />
            Dados do veículo (veicProd)
            {item.veiculo ? (
              <Badge variant="success">Presente</Badge>
            ) : (
              <Badge variant="danger">Ausente</Badge>
            )}
            {item.veiculo && <ResumoSchema campos={item.veiculo} />}
          </summary>

          {item.veiculo ? (
            <>
              {/*
                Grade compacta: um bloco por campo, com o resultado do
                schema. Os recusados vêm primeiro -- é o que a pessoa
                precisa ver. A tabela com a regra de cada campo fica
                logo abaixo, recolhida.
              */}
              <ul className={styles.camposVeiculo}>
                {camposRecusadosPrimeiro(item.veiculo).map((campo) => (
                  <li
                    key={campo.tag}
                    className={
                      campo.motivoRecusa ? `${styles.campoVeiculo} ${styles.campoRecusado}` : styles.campoVeiculo
                    }
                    title={`${campo.tag} — regra do schema: ${campo.regra}`}
                  >
                    <span className={styles.campoRotulo}>
                      {campo.motivoRecusa ? (
                        <CircleX size={14} aria-label="Recusado" />
                      ) : (
                        <CircleCheck size={14} aria-label="Aceito" />
                      )}
                      {campo.rotulo}
                    </span>
                    <span
                      className={
                        campo.tag === "chassi" || campo.tag === "nMotor"
                          ? `${styles.campoValor} ${styles.dadoDestaque}`
                          : styles.campoValor
                      }
                    >
                      {campo.presente ? (
                        <>
                          {/* Aspas deixam visível espaço no começo/fim, que o schema recusa. */}
                          &ldquo;{campo.valor}&rdquo;
                          {campo.significado && <small className={styles.significado}> {campo.significado}</small>}
                        </>
                      ) : (
                        <em className={styles.ausenteCampo}>não veio</em>
                      )}
                    </span>
                    {campo.motivoRecusa && <small className={styles.campoMotivo}>{campo.motivoRecusa}</small>}
                  </li>
                ))}
              </ul>

              <details className={styles.textoLivre}>
                <summary>Ver as regras do schema (SEFAZ) campo a campo</summary>
                <div className={styles.tabela}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Campo</TableHeaderCell>
                        <TableHeaderCell>Valor no XML</TableHeaderCell>
                        <TableHeaderCell>Regra do schema (SEFAZ)</TableHeaderCell>
                        <TableHeaderCell>Resultado</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {item.veiculo.map((campo) => (
                        <TableRow key={campo.tag}>
                          <TableCell>
                            <span className={styles.campoSchema}>
                              {campo.rotulo}
                              <code>{campo.tag}</code>
                            </span>
                          </TableCell>
                          <TableCell>
                            {campo.presente ? (
                              <span className={campo.tag === "chassi" || campo.tag === "nMotor" ? styles.dadoDestaque : undefined}>
                                {/* Aspas deixam visível espaço no começo/fim, que o schema recusa. */}
                                &ldquo;{campo.valor}&rdquo;
                                {campo.significado && <small className={styles.significado}> {campo.significado}</small>}
                              </span>
                            ) : (
                              <em className={styles.ausenteCampo}>não veio</em>
                            )}
                          </TableCell>
                          <TableCell>{campo.regra}</TableCell>
                          <TableCell>
                            {campo.motivoRecusa ? (
                              <span className={styles.recusado}>
                                <CircleX size={15} aria-hidden="true" /> {campo.motivoRecusa}
                              </span>
                            ) : (
                              <span className={styles.aceito}>
                                <CircleCheck size={15} aria-hidden="true" /> Aceito
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            </>
          ) : (
            <>
              <p className={styles.ausente}>
                O XML não traz o grupo do veículo. No texto do item aparecem:
              </p>
              <dl className={styles.grade}>
                <Dado rotulo="Chassi (só no texto)" valor={item.noTexto.chassi} destaque />
                <Dado rotulo="Motor (só no texto)" valor={item.noTexto.motor} destaque />
                <Dado rotulo="Carroceria (só no texto)" valor={item.noTexto.carroceria} />
              </dl>
            </>
          )}
        </details>
      )}

      {item.textoAdicional && (
        <details className={styles.textoLivre}>
          <summary>Texto do item (infAdProd)</summary>
          <p>{item.textoAdicional}</p>
        </details>
      )}
    </div>
  );
}

function plural(n: number, singular: string, pluralTexto: string) {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

function CartaoNota({
  nota,
  aberta,
  onAlternar,
}: {
  nota: NotaValidada;
  aberta: boolean;
  onAlternar: () => void;
}) {
  const sefaz = nota.apontamentos.filter((a) => a.origem === "sefaz");
  const erros = nota.apontamentos.filter((a) => a.origem === "conferencia" && a.severidade === "erro");
  const avisos = nota.apontamentos.filter((a) => a.origem === "conferencia" && a.severidade === "aviso");
  const temVeicProd = nota.itens.some((item) => item.veiculo);
  const prefixo = (item?: number) => (item ? `Item ${item}: ` : "");
  const listar = (lista: Apontamento[]) => (
    <ul className={styles.lista}>
      {lista.map((a, i) => (
        <li key={i}>
          {prefixo(a.item)}
          {a.mensagem}
        </li>
      ))}
    </ul>
  );

  return (
    <div className={aberta ? `${styles.nota} ${styles.notaAberta}` : styles.nota}>
      {/* A linha resume a nota; os detalhes só aparecem ao abrir. */}
      <button type="button" className={styles.notaLinha} aria-expanded={aberta} onClick={onAlternar}>
        <span className={styles.notaInicio}>
          <ChevronRight size={18} className={styles.notaSeta} aria-hidden="true" />
          <span className={styles.notaSituacao}>
            <Badge variant={VARIANTE_SITUACAO[nota.situacao]}>{ROTULO_SITUACAO[nota.situacao]}</Badge>
          </span>
          <span className={styles.notaTitulo}>
            <strong>
              NF-e {nota.numero || "?"} · série {nota.serie || "?"}
            </strong>
            <small>{nota.arquivo}</small>
          </span>
        </span>
        <span className={styles.notaDestinatario}>{nota.destinatario.nome || "Destinatário não informado"}</span>
        <span className={styles.notaContagens}>
          {sefaz.length > 0 ? (
            <Badge variant="danger">SEFAZ: {plural(sefaz.length, "problema", "problemas")}</Badge>
          ) : (
            temVeicProd && <Badge variant="success">SEFAZ: aceito</Badge>
          )}
          {erros.length > 0 && <Badge variant="danger">{plural(erros.length, "erro", "erros")}</Badge>}
          {avisos.length > 0 && <Badge variant="warning">{plural(avisos.length, "aviso", "avisos")}</Badge>}
        </span>
      </button>

      {aberta && (
        <div className={styles.notaDetalhe}>
          <Stack gap={16}>
            {sefaz.length > 0 ? (
              <Alert
                variant="danger"
                title={`Validação SEFAZ: ${sefaz.length === 1 ? "1 problema" : `${sefaz.length} problemas`} — a SEFAZ rejeitaria esta nota`}
              >
                {listar(sefaz)}
              </Alert>
            ) : (
              temVeicProd && (
                <Alert variant="success" title="Validação SEFAZ: grupo do veículo aceito">
                  O veicProd passa em todas as regras do schema oficial da NF-e 4.00: os 24 campos, na ordem, com tamanho e formato aceitos.
                </Alert>
              )
            )}

            {erros.length > 0 && (
              <Alert variant="danger" title={`Conferência interna: ${erros.length === 1 ? "1 erro" : `${erros.length} erros`}`}>
                {listar(erros)}
              </Alert>
            )}

            {avisos.length > 0 && (
              <Alert variant="warning" title={`Conferência interna: ${avisos.length === 1 ? "1 aviso" : `${avisos.length} avisos`}`}>
                {listar(avisos)}
              </Alert>
            )}

            {nota.situacao === "valido" && erros.length === 0 && avisos.length === 0 && (
              <Alert variant="success" title="Tudo certo">
                A nota traz o grupo do veículo completo e os dados conferem com o texto do item.
              </Alert>
            )}

            <dl className={styles.grade}>
              <Dado rotulo="Chave de acesso" valor={nota.chave} />
              <Dado rotulo="Emissão" valor={formatarDataHora(nota.emissao)} />
              <Dado rotulo="Natureza da operação" valor={nota.naturezaOperacao} />
              <Dado rotulo="Valor total" valor={formatarMoeda(nota.valorTotal)} />
              <Dado rotulo="Emitente" valor={`${nota.emitente.nome} (${formatarDocumento(nota.emitente.cnpj)})`} />
              <Dado
                rotulo="Destinatário"
                valor={`${nota.destinatario.nome} (${formatarDocumento(nota.destinatario.documento)})${nota.destinatario.uf ? ` — ${nota.destinatario.uf}` : ""}`}
              />
              <Dado
                rotulo="Autorização"
                valor={
                  nota.protocolo
                    ? `${nota.protocolo.status} – ${nota.protocolo.motivo} (protocolo ${nota.protocolo.numero})`
                    : "Sem protocolo"
                }
              />
              <Dado
                rotulo="Peso dos volumes"
                valor={
                  nota.pesoVolumes.liquido !== null
                    ? `${nota.pesoVolumes.liquido.toLocaleString("pt-BR")} kg líquido · ${(nota.pesoVolumes.bruto ?? 0).toLocaleString("pt-BR")} kg bruto`
                    : "-"
                }
              />
            </dl>

            {nota.itens.map((item) => (
              <ItemDaNota key={item.numeroItem} item={item} />
            ))}

            {nota.informacoesComplementares && (
              <details className={styles.textoLivre}>
                <summary>Informações complementares da nota (infCpl)</summary>
                <p>{nota.informacoesComplementares}</p>
              </details>
            )}
          </Stack>
        </div>
      )}
    </div>
  );
}

function resumoApontamentos(registro: RegistroValidacao): string {
  const partes = [
    registro.qtdErros ? `${registro.qtdErros} erro${registro.qtdErros === 1 ? "" : "s"}` : "",
    registro.qtdAvisos ? `${registro.qtdAvisos} aviso${registro.qtdAvisos === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  return partes.join(" · ") || String(registro.apontamentos.length);
}

function UltimasValidacoes({
  registros,
  carregando,
  erro,
  onAtualizar,
}: {
  registros: RegistroValidacao[];
  carregando: boolean;
  erro: string;
  onAtualizar: () => void;
}) {
  return (
    <Card
      title="Últimas validações"
      description="As 50 validações mais recentes, de todos os usuários, com o XML para baixar."
      actions={
        <Button variant="secondary" onClick={onAtualizar} loading={carregando} loadingLabel="Atualizando…">
          <RefreshCw size={16} /> Atualizar
        </Button>
      }
    >
      <Stack gap={16}>
        {erro && <Alert variant="danger">{erro}</Alert>}

        {!erro && registros.length === 0 && !carregando && (
          <p className={styles.vazio}>Nenhuma validação registrada ainda.</p>
        )}

        {registros.length > 0 && (
          <div className={styles.tabela}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Quando</TableHeaderCell>
                  <TableHeaderCell>Usuário</TableHeaderCell>
                  <TableHeaderCell>Nota</TableHeaderCell>
                  <TableHeaderCell>Destinatário</TableHeaderCell>
                  <TableHeaderCell>Situação</TableHeaderCell>
                  <TableHeaderCell>Apontamentos</TableHeaderCell>
                  <TableHeaderCell>XML</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {registros.map((registro) => (
                  <TableRow key={registro.id}>
                    <TableCell>{formatarDataHora(registro.criadoEm)}</TableCell>
                    <TableCell>{registro.usuarioNome}</TableCell>
                    <TableCell>
                      <span className={styles.notaCelula} title={registro.chaveAcesso ?? undefined}>
                        {registro.numeroNota
                          ? `NF-e ${registro.numeroNota}${registro.serie ? ` · série ${registro.serie}` : ""}`
                          : "-"}
                        <small>{registro.arquivo}</small>
                      </span>
                    </TableCell>
                    <TableCell>{registro.destinatario ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={VARIANTE_REGISTRO[registro.situacao]}>
                        {ROTULO_REGISTRO[registro.situacao]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {registro.apontamentos.length === 0 ? (
                        "Nenhum"
                      ) : (
                        <details className={styles.apontamentosCelula}>
                          <summary>{resumoApontamentos(registro)}</summary>
                          <ul className={styles.lista}>
                            {registro.apontamentos.map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </TableCell>
                    <TableCell>
                      <a className={styles.baixar} href={urlDownloadXml(registro.id)} download>
                        <Download size={14} /> Baixar
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Stack>
    </Card>
  );
}

export function ValidacaoXmlNfePage() {
  const [resultados, setResultados] = useState<ResultadoArquivo[]>([]);
  const [textoColado, setTextoColado] = useState("");
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
  /* Índices (entre as notas) das que estão abertas. */
  const [abertas, setAbertas] = useState<Set<number>>(new Set());
  const [historico, setHistorico] = useState<RegistroValidacao[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);
  const [erroHistorico, setErroHistorico] = useState("");

  async function carregarHistorico() {
    setCarregandoHistorico(true);
    const resposta = await listarValidacoes();
    setCarregandoHistorico(false);

    if (!resposta.ok || !resposta.data) {
      setErroHistorico(resposta.message ?? "Não foi possível carregar as últimas validações.");
      return;
    }

    setErroHistorico("");
    setHistorico(resposta.data);
  }

  useEffect(() => {
    let ativo = true;

    listarValidacoes().then((resposta) => {
      if (!ativo) return;
      setCarregandoHistorico(false);
      if (resposta.ok && resposta.data) setHistorico(resposta.data);
      else setErroHistorico(resposta.message ?? "Não foi possível carregar as últimas validações.");
    });

    return () => {
      ativo = false;
    };
  }, []);

  /*
   * Confere no navegador e, fora os exemplos, grava cada validação no
   * histórico com o XML. Se gravar falhar, o resultado continua na tela
   * -- só avisa que não ficou registrado.
   */
  async function validar(arquivos: { arquivo: string; conteudo: string }[], gravar = true) {
    setErro("");
    const novos = arquivos.map(({ arquivo, conteudo }) => validarXmlNfe(arquivo, conteudo));
    setResultados(novos);
    /* Sempre recolhidas: a linha já dá a situação; o detalhe abre quem quiser. */
    setAbertas(new Set());

    if (!gravar) return;

    const respostas = await Promise.all(
      novos.map((resultado, i) => registrarValidacao(resultado, arquivos[i].conteudo))
    );
    const falhas = respostas.filter((r) => !r.ok);

    if (falhas.length > 0) {
      const quantas = falhas.length === novos.length ? "ela não ficou registrada" : `${falhas.length} de ${novos.length} não ficaram registradas`;
      setErro(`A conferência está abaixo, mas ${quantas} no histórico: ${falhas[0].message ?? "erro ao gravar."}`);
    }

    await carregarHistorico();
  }

  async function aoEscolherArquivos(arquivos: File[]) {
    if (arquivos.length === 0) return;

    setLendo(true);
    try {
      await validar(
        await Promise.all(arquivos.map(async (arquivo) => ({ arquivo: arquivo.name, conteudo: await arquivo.text() })))
      );
    } catch {
      setErro("Não foi possível ler os arquivos escolhidos.");
    } finally {
      setLendo(false);
    }
  }

  const notas = resultados.flatMap((r) => (r.tipo === "nota" ? [r.nota] : []));
  const falhas = resultados.flatMap((r) => (r.tipo === "falha" ? [r.falha] : []));
  const contar = (situacao: SituacaoNota) => notas.filter((n) => n.situacao === situacao).length;

  return (
    <PageContainer>
      <PageHeader
        title="Validação de XML de NF-e"
        description="Confira se a nota de veículo traz o grupo do veículo novo (chassi, motor, cor, anos…) e se os dados batem com o texto da nota."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Validação de XML de NF-e", current: true },
        ]}
      />

      <Stack gap={20}>
        <Card
          title="XML da nota"
          description="Escolha um ou mais arquivos .xml, ou cole o conteúdo. Cada validação fica registrada nas Últimas validações, com o XML para baixar."
          actions={
            /* Discretos no canto: exemplo é para a primeira vez, não para o dia a dia. */
            <Stack direction="row" gap={8}>
              <Button
                variant="secondary"
                title={`Valida duas notas reais, sem gravar no histórico: ${EXEMPLOS_NFE.map((e) => `${e.arquivo} (${e.descricao.toLowerCase()})`).join("; ")}.`}
                onClick={() =>
                  void validar(
                    EXEMPLOS_NFE.map(({ arquivo, conteudo }) => ({ arquivo: `Exemplo — ${arquivo}`, conteudo })),
                    false
                  )
                }
              >
                <Lightbulb size={16} /> Ver exemplo
              </Button>
              <Button
                variant="secondary"
                disabled={resultados.length === 0 && !textoColado}
                onClick={() => {
                  setResultados([]);
                  setAbertas(new Set());
                  setTextoColado("");
                  setErro("");
                }}
              >
                Limpar
              </Button>
            </Stack>
          }
        >
          <Stack gap={16}>
            <div className={styles.entrada}>
              <FileUpload
                label="Arquivos XML"
                description="Arraste ou escolha os XMLs autorizados das notas."
                accept=".xml,text/xml,application/xml"
                multiple
                maxSizeMB={5}
                files={[]}
                disabled={lendo}
                onFilesChange={aoEscolherArquivos}
              />

              <div className={styles.colar}>
                <Textarea
                  value={textoColado}
                  onChange={(evento) => setTextoColado(evento.target.value)}
                  placeholder={'<?xml version="1.0" encoding="UTF-8"?><nfeProc …'}
                  rows={6}
                  aria-label="Conteúdo do XML"
                />
                <Stack direction="row" justify="end" gap={12}>
                  <Button
                    variant="secondary"
                    disabled={!textoColado.trim()}
                    onClick={() => void validar([{ arquivo: "XML colado", conteudo: textoColado }])}
                  >
                    <FileCheck2 size={16} /> Validar XML colado
                  </Button>
                </Stack>
              </div>
            </div>

            {erro && <Alert variant="warning">{erro}</Alert>}
          </Stack>
        </Card>

        {resultados.length > 0 && (
          <div className={styles.resumo}>
            <StatCard label="Notas conferidas" value={notas.length} variant="info" />
            <StatCard label="Válidas" value={contar("valido")} variant="success" />
            <StatCard label="Inválidas" value={contar("invalido") + falhas.length} variant="danger" />
          </div>
        )}

        {falhas.map((falha, i) => (
          <Alert key={`${falha.arquivo}-${i}`} variant="danger" title={`${falha.arquivo}: não foi possível conferir`}>
            {falha.mensagem}
          </Alert>
        ))}

        {notas.length > 0 && (
          <Card
            title="Notas conferidas"
            description="Clique numa nota para ver o detalhe."
            actions={
              notas.length > 1 && (
                <Stack direction="row" gap={8}>
                  <Button variant="secondary" onClick={() => setAbertas(new Set(notas.map((_, i) => i)))}>
                    Abrir todas
                  </Button>
                  <Button variant="secondary" onClick={() => setAbertas(new Set())}>
                    Recolher todas
                  </Button>
                </Stack>
              )
            }
          >
            <div className={styles.listaNotas}>
              {notas.map((nota, i) => (
                <CartaoNota
                  key={`${nota.arquivo}-${nota.chave}-${i}`}
                  nota={nota}
                  aberta={abertas.has(i)}
                  onAlternar={() =>
                    setAbertas((atual) => {
                      const proximo = new Set(atual);
                      if (proximo.has(i)) proximo.delete(i);
                      else proximo.add(i);
                      return proximo;
                    })
                  }
                />
              ))}
            </div>
          </Card>
        )}

        <UltimasValidacoes
          registros={historico}
          carregando={carregandoHistorico}
          erro={erroHistorico}
          onAtualizar={() => void carregarHistorico()}
        />
      </Stack>
    </PageContainer>
  );
}
