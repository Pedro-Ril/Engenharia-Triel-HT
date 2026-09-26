"use client";

import { useMemo, useState } from "react";
import { Boxes, GitCompare, Home, Layers, Search } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";

import { buscarEstruturaUltimaRevisao } from "../services/consultaUltimaRevisao.service";
import type { EstruturaUltimaRevisao, NoEstrutura3DX } from "../types/consultaUltimaRevisao.types";
import styles from "./ConsultaUltimaRevisao.module.css";

/*
 * Poda a árvore deixando só os itens fora da última revisão -- e os pais
 * que levam até eles, pra não perder de vista ONDE o item desatualizado
 * está montado. Mesma lógica de filtrarSemRoteiro no Roteiro de
 * Fabricação.
 */
function filtrarDesatualizados(no: NoEstrutura3DX): NoEstrutura3DX | null {
  const filhos = no.filhos
    .map(filtrarDesatualizados)
    .filter((filho): filho is NoEstrutura3DX => filho !== null);

  if (no.ultimaRevisao !== false && filhos.length === 0) return null;

  return { ...no, filhos };
}

/* Conta código único, não ocorrência: o mesmo item pode aparecer várias vezes na montagem. */
function contarCodigos(
  no: NoEstrutura3DX,
  apenasDesatualizados: boolean,
  vistos = new Set<string>()
): number {
  if (no.codigo && (!apenasDesatualizados || no.ultimaRevisao === false)) {
    vistos.add(no.codigo);
  }

  for (const filho of no.filhos) {
    contarCodigos(filho, apenasDesatualizados, vistos);
  }

  return vistos.size;
}

function NoArvore({ no, expandidoInicial }: { no: NoEstrutura3DX; expandidoInicial: boolean }) {
  const [expandido, setExpandido] = useState(no.nivel === 0 || expandidoInicial);

  const temFilhos = no.filhos.length > 0;
  const desatualizado = no.ultimaRevisao === false;

  return (
    <div className={styles.no}>
      <div className={`${styles.linha} ${desatualizado ? styles.linhaDesatualizada : ""}`}>
        <button
          type="button"
          className={styles.botaoExpandir}
          disabled={!temFilhos}
          aria-label={temFilhos ? (expandido ? "Recolher" : "Expandir") : undefined}
          onClick={() => setExpandido((atual) => !atual)}
        >
          {temFilhos ? (expandido ? "▾" : "▸") : "•"}
        </button>

        <div className={styles.conteudo}>
          <div className={styles.topo}>
            <strong className={styles.codigo}>
              {no.codigo || "-"}
              {no.revisao ? ` | Rev. ${no.revisao}` : ""}
            </strong>

            {no.ultimaRevisao === false ? (
              <Badge variant="danger">Fora da última revisão</Badge>
            ) : no.ultimaRevisao === true ? (
              <Badge variant="success">Última revisão</Badge>
            ) : (
              <Badge variant="neutral">Revisão não informada</Badge>
            )}

            {no.tipoint && <span className={styles.meta}>{no.tipoint}</span>}
            {no.instanciaNome && <span className={styles.meta}>{no.instanciaNome}</span>}
          </div>

          <span className={styles.descricao}>{no.descricao || "Sem descrição"}</span>
        </div>
      </div>

      {temFilhos && expandido && (
        <div className={styles.filhos}>
          {no.filhos.map((filho, indice) => (
            <NoArvore
              key={`${filho.physicalId || filho.codigo}-${indice}`}
              no={filho}
              expandidoInicial={expandidoInicial}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ConsultaUltimaRevisaoPage() {
  const [codigoDigitado, setCodigoDigitado] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [estrutura, setEstrutura] = useState<EstruturaUltimaRevisao | null>(null);
  /* Ligado por padrão: a pergunta que traz alguém aqui é "o que está desatualizado?", e a estrutura inteira costuma passar de cem linhas. */
  const [apenasDesatualizados, setApenasDesatualizados] = useState(true);

  async function handleBuscar() {
    const codigo = codigoDigitado.trim();
    if (!codigo || carregando) return;

    setCarregando(true);
    setErro(null);
    setEstrutura(null);

    try {
      const resultado = await buscarEstruturaUltimaRevisao(codigo);

      if (resultado.ok && resultado.data) {
        setEstrutura(resultado.data);
      } else {
        setErro(resultado.message ?? "Não foi possível consultar a estrutura.");
      }
    } catch {
      setErro("Não foi possível falar com o serviço de estrutura. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  const totalItens = useMemo(
    () => (estrutura ? contarCodigos(estrutura.raiz, false) : 0),
    [estrutura]
  );

  const totalDesatualizados = useMemo(
    () => (estrutura ? contarCodigos(estrutura.raiz, true) : 0),
    [estrutura]
  );

  const arvoreVisivel = useMemo(() => {
    if (!estrutura) return null;
    if (!apenasDesatualizados) return estrutura.raiz;
    return filtrarDesatualizados(estrutura.raiz);
  }, [estrutura, apenasDesatualizados]);

  return (
    <PageContainer>
      <PageHeader
        title="Consulta Última Revisão"
        description="Explode a estrutura do item no 3DX e aponta os componentes que não estão na última revisão."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Consulta Última Revisão", current: true, icon: <GitCompare size={14} /> },
        ]}
      />

      <Card>
        <Stack gap={16}>
          <Stack direction="row" gap={12} align="end" wrap>
            <Field label="Código do item">
              <Input
                value={codigoDigitado}
                placeholder="Ex.: 295007"
                disabled={carregando}
                onChange={(event) => setCodigoDigitado(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleBuscar();
                }}
              />
            </Field>

            <Button onClick={handleBuscar} loading={carregando} disabled={!codigoDigitado.trim()}>
              <Search size={16} />
              Consultar
            </Button>
          </Stack>

          {erro && <Alert variant="danger">{erro}</Alert>}
        </Stack>
      </Card>

      {carregando && (
        <Card>
          <Loader label="Explodindo a estrutura no 3DX..." />
        </Card>
      )}

      {estrutura && !carregando && (
        <>
          <FormGrid columns={3}>
            {/* O 3DX conta ocorrências (o mesmo item repetido em vários lugares); aqui o que importa é quantos códigos diferentes existem. */}
            <StatCard
              label="Itens únicos"
              value={totalItens}
              description="Códigos diferentes na estrutura."
              icon={<Boxes />}
            />

            <StatCard
              label="Fora da última revisão"
              value={totalDesatualizados}
              description={
                totalDesatualizados === 0
                  ? "Tudo atualizado."
                  : "Precisam ser revisados na montagem."
              }
              icon={<GitCompare />}
              variant={totalDesatualizados > 0 ? "danger" : "success"}
            />

            <StatCard
              label="Ocorrências na montagem"
              value={estrutura.totalItens}
              description={`${estrutura.totalInstancias} instância(s) posicionada(s).`}
              icon={<Layers />}
            />
          </FormGrid>

          <Card
            title={`${estrutura.codigo}${estrutura.revisao ? ` | Rev. ${estrutura.revisao}` : ""}`}
            description={estrutura.descricao || undefined}
          >
            <Stack gap={16}>
              <Switch
                label="Mostrar apenas itens fora da última revisão"
                checked={apenasDesatualizados}
                onChange={(event) => setApenasDesatualizados(event.target.checked)}
              />

              {totalDesatualizados === 0 && (
                <Alert variant="success">
                  Todos os itens desta estrutura estão na última revisão. Desligue o filtro para ver a
                  estrutura completa.
                </Alert>
              )}

              {totalDesatualizados > 0 && (
                <span className={styles.resumoFiltro}>
                  {totalDesatualizados} item(ns) fora da última revisão
                  {apenasDesatualizados ? " — a árvore abaixo mostra o caminho até cada um." : "."}
                </span>
              )}

              {arvoreVisivel && (
                /* A key remonta a árvore ao trocar o filtro, pra os nós reabrirem já expandidos nos itens filtrados. */
                <div className={styles.arvore} key={apenasDesatualizados ? "filtrada" : "completa"}>
                  <NoArvore no={arvoreVisivel} expandidoInicial={apenasDesatualizados} />
                </div>
              )}
            </Stack>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
