"use client";

import { useMemo, useState } from "react";
import { Download, FileSearch, Home } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
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
import { separarCodigos } from "@/lib/conferencia-derivados/regra-codigo";
import { exportarPlanilha, nomeComData } from "@/lib/utils/exportar-planilha";

import {
  definicaoDoTipo,
  LIMITE_CODIGOS,
  TIPOS_ARQUIVO,
  type TipoArquivoDerivado,
} from "../constants/tipos-arquivo";
import { conferirArquivos } from "../services/conferenciaDerivados.service";
import type { ResultadoConferencia } from "../types/conferenciaDerivados.types";
import { lerCodigosDaPlanilha } from "../utils/ler-codigos-excel";
import styles from "./ConferenciaDerivadosPage.module.css";

type SituacaoCodigo = "falta" | "ok" | "nao-conferido";

const ROTULO_SITUACAO: Record<SituacaoCodigo, string> = {
  falta: "Falta",
  ok: "OK",
  "nao-conferido": "Não conferido",
};

export function ConferenciaDerivadosPage() {
  /* As três marcadas: é o "4 - Todos" do script, o uso mais comum. */
  const [tipos, setTipos] = useState<TipoArquivoDerivado[]>(["pdf", "dxf", "step"]);
  const [texto, setTexto] = useState("");
  const [importando, setImportando] = useState(false);
  const [avisoImportacao, setAvisoImportacao] = useState<{
    variante: "success" | "danger";
    mensagem: string;
  } | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<ResultadoConferencia | null>(null);
  /* Códigos na ordem em que foram conferidos -- a tabela segue ela. */
  const [codigosConferidos, setCodigosConferidos] = useState<string[]>([]);

  const codigos = useMemo(() => separarCodigos(texto), [texto]);

  function alternarTipo(tipo: TipoArquivoDerivado, marcado: boolean) {
    setTipos((atuais) =>
      marcado
        ? TIPOS_ARQUIVO.map((item) => item.tipo).filter((t) => t === tipo || atuais.includes(t))
        : atuais.filter((t) => t !== tipo)
    );
  }

  async function importarPlanilha(arquivos: File[]) {
    const arquivo = arquivos[0];
    if (!arquivo) return;

    setImportando(true);
    setAvisoImportacao(null);

    try {
      const lidos = await lerCodigosDaPlanilha(arquivo);

      if (lidos.codigos.length === 0) {
        setAvisoImportacao({
          variante: "danger",
          mensagem: `Nenhum código encontrado na ${lidos.coluna} de "${arquivo.name}".`,
        });
        return;
      }

      /* Soma ao que já está na caixa; repetidos somem na separação. */
      setTexto((atual) => [atual.trim(), lidos.codigos.join("\n")].filter(Boolean).join("\n"));
      setAvisoImportacao({
        variante: "success",
        mensagem: `${lidos.codigos.length} código(s) importado(s) da ${lidos.coluna} de "${arquivo.name}".`,
      });
    } catch (erroLeitura) {
      setAvisoImportacao({
        variante: "danger",
        mensagem:
          erroLeitura instanceof Error
            ? `Não foi possível ler "${arquivo.name}": ${erroLeitura.message}`
            : `Não foi possível ler "${arquivo.name}".`,
      });
    } finally {
      setImportando(false);
    }
  }

  async function conferir() {
    setErro("");

    if (tipos.length === 0) {
      setErro("Marque ao menos um tipo de arquivo.");
      return;
    }

    if (codigos.length === 0) {
      setErro("Informe ao menos um código.");
      return;
    }

    if (codigos.length > LIMITE_CODIGOS) {
      setErro(`São ${codigos.length} códigos; o limite por conferência é ${LIMITE_CODIGOS}.`);
      return;
    }

    setConferindo(true);
    setResultado(null);

    const resposta = await conferirArquivos(codigos, tipos);

    setConferindo(false);

    if (!resposta.ok || !resposta.data) {
      setErro(resposta.message ?? "Não foi possível fazer a conferência.");
      return;
    }

    setCodigosConferidos(codigos);
    setResultado(resposta.data);
  }

  /* Código -> situação em cada tipo conferido. */
  const situacoes = useMemo(() => {
    if (!resultado) return new Map<string, Record<string, SituacaoCodigo>>();

    const faltandoPorTipo = new Map(
      resultado.tipos.map((t) => [t.tipo, new Set(t.faltando)] as const)
    );

    return new Map(
      codigosConferidos.map((codigo) => {
        const porTipo: Record<string, SituacaoCodigo> = {};

        for (const t of resultado.tipos) {
          porTipo[t.tipo] = t.erro
            ? "nao-conferido"
            : faltandoPorTipo.get(t.tipo)?.has(codigo)
              ? "falta"
              : "ok";
        }

        return [codigo, porTipo];
      })
    );
  }, [resultado, codigosConferidos]);

  const linhasComFalta = useMemo(
    () =>
      codigosConferidos.filter((codigo) =>
        Object.values(situacoes.get(codigo) ?? {}).includes("falta")
      ),
    [codigosConferidos, situacoes]
  );

  const tiposConferidos = resultado?.tipos ?? [];
  const tiposComErro = tiposConferidos.filter((t) => t.erro);
  const tudoEncontrado =
    resultado !== null && tiposComErro.length === 0 && linhasComFalta.length === 0;

  async function exportar() {
    if (!resultado) return;

    await exportarPlanilha({
      nomeArquivo: nomeComData("conferencia-derivados"),
      nomeAba: "Conferência",
      cabecalho: ["Código", ...tiposConferidos.map((t) => definicaoDoTipo(t.tipo).rotulo)],
      /* Todos os códigos, não só os com falta: a planilha é o registro
         completo da conferência. */
      linhas: codigosConferidos.map((codigo) => [
        codigo,
        ...tiposConferidos.map((t) => ROTULO_SITUACAO[situacoes.get(codigo)?.[t.tipo] ?? "ok"]),
      ]),
    }).catch(() => {
      /* Fechar o "salvar como" sem escolher é desistência, não erro. */
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Conferência de Arquivos Derivados"
        description="Informe os códigos e veja quais ainda não têm PDF, DXF ou STEP nas pastas de rede."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Conferência de Arquivos Derivados", current: true },
        ]}
      />

      <Stack gap={20}>
        <Card title="O que conferir" description="Marque os tipos de arquivo que devem existir para cada código.">
          <div className={styles.tipos}>
            {TIPOS_ARQUIVO.map((definicao) => (
              <Checkbox
                key={definicao.tipo}
                label={definicao.rotulo}
                hint={definicao.descricao}
                checked={tipos.includes(definicao.tipo)}
                disabled={conferindo}
                onChange={(evento) => alternarTipo(definicao.tipo, evento.target.checked)}
              />
            ))}
          </div>
        </Card>

        <Card
          title="Códigos"
          description="Cole a lista — um por linha, ou separados por vírgula ou ponto e vírgula — ou importe de uma planilha."
        >
          <Stack gap={16}>
            <div className={styles.entrada}>
              <div className={styles.caixaCodigos}>
                <Textarea
                  value={texto}
                  onChange={(evento) => setTexto(evento.target.value)}
                  placeholder={"290215, 290219, 290220\n290221\n290245;290352"}
                  rows={10}
                  disabled={conferindo}
                  aria-label="Lista de códigos"
                />
                <span className={styles.contador}>
                  {codigos.length === 0
                    ? "Nenhum código"
                    : `${codigos.length} código${codigos.length === 1 ? "" : "s"}${codigos.length > LIMITE_CODIGOS ? ` — acima do limite de ${LIMITE_CODIGOS}` : ""}`}
                </span>
              </div>

              <div className={styles.importacao}>
                <FileUpload
                  label="Importar planilha"
                  description="Usa a coluna com cabeçalho “Código” (ou “Cód”); sem ela, a primeira coluna."
                  accept=".xlsx,.xls,.csv"
                  files={[]}
                  disabled={conferindo || importando}
                  onFilesChange={importarPlanilha}
                />
              </div>
            </div>

            {avisoImportacao && (
              <Alert variant={avisoImportacao.variante}>{avisoImportacao.mensagem}</Alert>
            )}

            {erro && <Alert variant="danger">{erro}</Alert>}

            <Stack direction="row" justify="end" gap={12}>
              <Button
                variant="secondary"
                disabled={conferindo || (!texto && !resultado)}
                onClick={() => {
                  setTexto("");
                  setResultado(null);
                  setAvisoImportacao(null);
                  setErro("");
                }}
              >
                Limpar
              </Button>
              <Button
                onClick={conferir}
                loading={conferindo}
                loadingLabel="Conferindo as pastas…"
                disabled={codigos.length === 0 || tipos.length === 0}
              >
                <FileSearch size={16} /> Conferir
              </Button>
            </Stack>

            {conferindo && (
              <p className={styles.dica}>
                A pasta de PDF tem centenas de milhares de arquivos; a leitura leva alguns segundos.
              </p>
            )}
          </Stack>
        </Card>

        {resultado && (
          <Card
            title="Resultado"
            description={`${resultado.totalCodigos} código(s) conferido(s) em ${(resultado.duracaoMs / 1000).toFixed(1)}s.`}
          >
            <Stack gap={16}>
              {tiposComErro.map((t) => (
                <Alert key={t.tipo} variant="warning" title={`${definicaoDoTipo(t.tipo).rotulo} não conferido`}>
                  {t.erro}
                </Alert>
              ))}

              <div className={styles.cartoes}>
                {tiposConferidos
                  .filter((t) => !t.erro)
                  .map((t) => (
                    <StatCard
                      key={t.tipo}
                      label={`${definicaoDoTipo(t.tipo).rotulo} faltando`}
                      value={t.faltando.length}
                      description={`${t.encontrados} de ${resultado.totalCodigos} encontrados · ${t.totalArquivosNaPasta.toLocaleString("pt-BR")} arquivos em ${t.pasta}`}
                      variant={t.faltando.length > 0 ? "danger" : "success"}
                    />
                  ))}
              </div>

              {tudoEncontrado && (
                <Alert variant="success" title="Nada faltando">
                  Todos os {resultado.totalCodigos} códigos têm os arquivos conferidos.
                </Alert>
              )}

              {linhasComFalta.length > 0 && (
                <>
                  <div className={styles.cabecalhoTabela}>
                    <strong>
                      {linhasComFalta.length} código{linhasComFalta.length === 1 ? "" : "s"} com arquivo faltando
                    </strong>
                    <Button variant="secondary" onClick={exportar}>
                      <Download size={16} /> Exportar Excel
                    </Button>
                  </div>

                  <div className={styles.tabelaRolavel}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Código</TableHeaderCell>
                          {tiposConferidos.map((t) => (
                            <TableHeaderCell key={t.tipo}>{definicaoDoTipo(t.tipo).rotulo}</TableHeaderCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {linhasComFalta.map((codigo) => (
                          <TableRow key={codigo}>
                            <TableCell>
                              <span className={styles.codigo}>{codigo}</span>
                            </TableCell>
                            {tiposConferidos.map((t) => {
                              const situacao = situacoes.get(codigo)?.[t.tipo] ?? "ok";
                              return (
                                <TableCell key={t.tipo}>
                                  <Badge
                                    variant={
                                      situacao === "falta"
                                        ? "danger"
                                        : situacao === "ok"
                                          ? "success"
                                          : "neutral"
                                    }
                                  >
                                    {ROTULO_SITUACAO[situacao]}
                                  </Badge>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              {!tudoEncontrado && linhasComFalta.length === 0 && (
                <Stack direction="row" justify="end">
                  <Button variant="secondary" onClick={exportar}>
                    <Download size={16} /> Exportar Excel
                  </Button>
                </Stack>
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    </PageContainer>
  );
}
