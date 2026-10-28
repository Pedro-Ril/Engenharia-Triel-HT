"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, GitBranch, Pencil, Plus, Trash2, X } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/Autocomplete";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { Tabs } from "@/components/ui/Tabs";
import { EMPRESAS_PEDIDO_COMPRA, nomeEmpresaPedidoCompra } from "@/lib/aprovacoes/empresas-pedido-compra";
import {
  centroCustoNaSugestaoDoTipo,
  criteriosAlcadaDoTipo,
  rotuloTipoAprovacao,
  TIPOS_APROVACAO,
  type TipoAprovacao,
} from "@/lib/aprovacoes/tipos-aprovacao";

import { excluirAlcada, listarAlcadas, salvarAlcada } from "../services/adminPermissoes.service";
import type {
  AlcadaConfig,
  HistoricoAlcada,
  PortalModulo,
  PortalPermissao,
  PortalUsuarioAdmin,
} from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AlcadasPainel.module.css";
import { RubricasAprovadoresCard } from "./RubricasAprovadoresCard";

interface AlcadasPainelProps {
  usuarios: PortalUsuarioAdmin[];
  permissoes: PortalPermissao[];
  modulos: PortalModulo[];
  onFeedback: FeedbackHandler;
}

interface NivelEdicao {
  /* Chave só da tela, para o React (nível novo ainda não tem id). */
  chave: string;
  id?: string;
  nome: string;
  usuarios: { id: string; nome: string }[];
}

interface SugestaoEdicao {
  chave: string;
  /* O nível que recebe -- pela chave da tela, para acompanhar o nível se ele mudar de posição. */
  nivelChave: string;
  empresa: string;
  centrosCusto: string;
  /* "" = todos do nível. */
  usuarioId: string;
}

interface Edicao {
  id?: string;
  tipo: TipoAprovacao;
  empresa: string;
  setor: string;
  niveis: NivelEdicao[];
  sugestoes: SugestaoEdicao[];
}

let contadorChave = 0;
const novaChave = () => `n${++contadorChave}`;

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/* "Usitec · setor Manutenção", ou "Padrão" quando a regra vale para tudo. */
function tituloRegra(alcada: Pick<AlcadaConfig, "empresa" | "setor">): string {
  const partes = [
    alcada.empresa !== null ? nomeEmpresaPedidoCompra(alcada.empresa) : null,
    alcada.setor ? `Setor ${alcada.setor}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Padrão";
}

/* "Usitec · CC 90.02, 90.90", ou "Qualquer empresa". */
function quandoSugestao(sugestao: { empresa: number | null; centrosCusto: string | null }): string {
  const partes = [
    sugestao.empresa !== null ? nomeEmpresaPedidoCompra(sugestao.empresa) : "Qualquer empresa",
    sugestao.centrosCusto ? `centros de custo ${sugestao.centrosCusto}` : null,
  ].filter(Boolean);
  return partes.join(" · ");
}

/* Específicas primeiro (empresa + setor), a padrão por último -- a ordem em que casam. */
function pesoRegra(alcada: Pick<AlcadaConfig, "empresa" | "setor">): number {
  return (alcada.empresa !== null ? 2 : 0) + (alcada.setor ? 1 : 0);
}

/*
 * Alçadas de aprovação: para cada tipo, as regras (padrão, por empresa,
 * por setor), e em cada regra a cadeia de níveis com as pessoas de
 * cada um. Todos os níveis aprovam em sequência; dentro do nível,
 * basta uma pessoa.
 */
export function AlcadasPainel({ usuarios, permissoes, modulos, onFeedback }: AlcadasPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [alcadas, setAlcadas] = useState<AlcadaConfig[]>([]);
  const [historico, setHistorico] = useState<HistoricoAlcada[]>([]);
  const [setores, setSetores] = useState<string[]>([]);
  const [tipo, setTipo] = useState<TipoAprovacao>(TIPOS_APROVACAO[0].valor);
  const [recarga, setRecarga] = useState(0);

  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<AlcadaConfig | null>(null);
  const [processandoRemocao, setProcessandoRemocao] = useState(false);

  useEffect(() => {
    let ativo = true;
    listarAlcadas().then((resultado) => {
      if (!ativo) return;
      if (resultado.ok && resultado.data) {
        setAlcadas(resultado.data.alcadas);
        setHistorico(resultado.data.historico);
        setSetores(resultado.data.setores);
        setErroCarga(null);
      } else {
        setErroCarga(resultado.message ?? "Não foi possível carregar as alçadas.");
      }
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [recarga]);

  /*
   * Estar na alçada não abre o Painel de Aprovações: a pessoa também
   * precisa da permissão do módulo (ou ser administradora). Sem ela, o
   * pedido chega ao nível e ninguém consegue decidir -- a tela avisa.
   */
  const semAcessoAoPainel = useMemo(() => {
    const modulo = modulos.find((m) => m.chave === "aprovacoes-painel");
    const comPermissao = new Set(
      permissoes.filter((p) => modulo && p.moduloId === modulo.id).map((p) => p.usuarioId.toUpperCase())
    );
    return new Set(
      usuarios
        .filter((u) => !u.ehAdministrador && !comPermissao.has(u.id.toUpperCase()))
        .map((u) => u.id.toUpperCase())
    );
  }, [usuarios, permissoes, modulos]);

  const opcoesUsuarios = useMemo<AutocompleteOption[]>(
    () =>
      usuarios
        .filter((usuario) => usuario.ativo)
        .sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao, "pt-BR"))
        .map((usuario) => ({ value: usuario.id, label: usuario.nomeExibicao })),
    [usuarios]
  );

  const alcadasDoTipo = alcadas
    .filter((alcada) => alcada.tipo === tipo)
    .sort((a, b) => pesoRegra(b) - pesoRegra(a) || tituloRegra(a).localeCompare(tituloRegra(b), "pt-BR"));
  const criterios = criteriosAlcadaDoTipo(tipo);
  const temPadrao = alcadasDoTipo.some((alcada) => alcada.empresa === null && !alcada.setor);

  function abrirNova() {
    setErroEdicao(null);
    setEdicao({
      tipo,
      empresa: "",
      setor: "",
      niveis: [{ chave: novaChave(), nome: "", usuarios: [] }],
      sugestoes: [],
    });
  }

  function abrirEdicao(alcada: AlcadaConfig) {
    setErroEdicao(null);
    const niveis = alcada.niveis.map((nivel) => ({
      chave: novaChave(),
      id: nivel.id,
      nome: nivel.nome,
      usuarios: nivel.usuarios.map((u) => ({ ...u })),
    }));
    const chavePorNivel = new Map(niveis.map((nivel) => [nivel.id!.toUpperCase(), nivel.chave]));

    setEdicao({
      id: alcada.id,
      tipo: alcada.tipo as TipoAprovacao,
      empresa: alcada.empresa !== null ? String(alcada.empresa) : "",
      setor: alcada.setor ?? "",
      niveis,
      sugestoes: alcada.sugestoes.map((sugestao) => ({
        chave: novaChave(),
        nivelChave: chavePorNivel.get(sugestao.nivelId.toUpperCase()) ?? "",
        empresa: sugestao.empresa !== null ? String(sugestao.empresa) : "",
        centrosCusto: sugestao.centrosCusto ?? "",
        usuarioId: sugestao.usuarioId ?? "",
      })),
    });
  }

  function alterarSugestao(chave: string, mudar: (sugestao: SugestaoEdicao) => SugestaoEdicao) {
    setEdicao((atual) =>
      atual
        ? { ...atual, sugestoes: atual.sugestoes.map((sugestao) => (sugestao.chave === chave ? mudar(sugestao) : sugestao)) }
        : atual
    );
  }

  function alterarNivel(chave: string, mudar: (nivel: NivelEdicao) => NivelEdicao) {
    setEdicao((atual) =>
      atual ? { ...atual, niveis: atual.niveis.map((nivel) => (nivel.chave === chave ? mudar(nivel) : nivel)) } : atual
    );
  }

  function moverNivel(indice: number, direcao: -1 | 1) {
    setEdicao((atual) => {
      if (!atual) return atual;
      const niveis = [...atual.niveis];
      const destino = indice + direcao;
      if (destino < 0 || destino >= niveis.length) return atual;
      [niveis[indice], niveis[destino]] = [niveis[destino], niveis[indice]];
      return { ...atual, niveis };
    });
  }

  async function handleSalvar() {
    if (!edicao) return;
    setSalvando(true);
    setErroEdicao(null);

    try {
      const resultado = await salvarAlcada(
        {
          tipo: edicao.tipo,
          empresa: edicao.empresa ? Number(edicao.empresa) : null,
          setor: edicao.setor.trim() || null,
          niveis: edicao.niveis.map((nivel) => ({
            id: nivel.id,
            nome: nivel.nome,
            usuarioIds: nivel.usuarios.map((u) => u.id),
          })),
          sugestoes: edicao.sugestoes.map((sugestao) => ({
            nivelIndice: edicao.niveis.findIndex((nivel) => nivel.chave === sugestao.nivelChave),
            empresa: sugestao.empresa ? Number(sugestao.empresa) : null,
            centrosCusto: sugestao.centrosCusto.trim() || null,
            usuarioId: sugestao.usuarioId || null,
          })),
        },
        edicao.id
      );

      if (resultado.ok) {
        onFeedback("success", edicao.id ? "Alçada salva" : "Alçada criada", "Vale para as próximas solicitações.");
        setEdicao(null);
        setRecarga((n) => n + 1);
      } else {
        setErroEdicao(resultado.message ?? "Não foi possível salvar a alçada.");
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleRemover() {
    if (!removendo) return;
    setProcessandoRemocao(true);

    try {
      const resultado = await excluirAlcada(removendo.id);
      if (resultado.ok) {
        onFeedback("success", "Alçada removida", `${tituloRegra(removendo)} não vale mais.`);
        setRemovendo(null);
        setRecarga((n) => n + 1);
      } else {
        onFeedback("danger", "Não foi possível remover", resultado.message ?? "Tente novamente.");
      }
    } finally {
      setProcessandoRemocao(false);
    }
  }

  if (carregando) return <Loader label="Carregando alçadas..." />;
  if (erroCarga) return <Alert variant="danger">{erroCarga}</Alert>;

  const historicoDoTipo = historico.filter((linha) => linha.tipo === tipo);

  const conteudo = (
    <Stack gap={20}>
      <Alert variant="info" title="Como a alçada funciona">
        A solicitação passa pelos níveis em ordem e só é aprovada quando todos aprovam; em cada nível, basta uma
        das pessoas. Qualquer nível pode devolver ao solicitante, que ajusta e reenvia (recomeça do nível 1).
        {criterios.length > 0 &&
          ` Vale a regra mais específica: ${criterios.includes("empresa") ? "a da empresa" : "a do setor"}; sem ela, a padrão.`}
      </Alert>

      {!temPadrao && alcadasDoTipo.length > 0 && (
        <Alert variant="warning" title="Sem alçada padrão">
          Solicitações que não casarem com nenhuma regra abaixo serão recusadas no envio. Crie uma regra sem{" "}
          {criterios.includes("empresa") ? "empresa" : "setor"} para servir de padrão.
        </Alert>
      )}

      <Stack direction="row" justify="end">
        <Button onClick={abrirNova}>
          <Plus size={16} />
          Nova alçada
        </Button>
      </Stack>

      {alcadasDoTipo.length === 0 ? (
        <EmptyState
          icon={<GitBranch size={28} />}
          title={`Nenhuma alçada de ${rotuloTipoAprovacao(tipo)}`}
          description="Sem alçada, as solicitações deste tipo não podem ser enviadas para aprovação."
        />
      ) : (
        alcadasDoTipo.map((alcada) => (
          <Card
            key={alcada.id}
            title={tituloRegra(alcada)}
            description={`Atualizada em ${formatarData(alcada.atualizadoEm)}${alcada.atualizadoPor ? ` por ${alcada.atualizadoPor}` : ""}`}
            actions={
              <Stack direction="row" gap={4}>
                <IconButton icon={<Pencil size={15} />} label="Editar alçada" size="small" onClick={() => abrirEdicao(alcada)} />
                <IconButton icon={<Trash2 size={15} />} label="Remover alçada" size="small" onClick={() => setRemovendo(alcada)} />
              </Stack>
            }
          >
            <Stack gap={16}>
              <div className={styles.cadeia}>
                {alcada.niveis.map((nivel, indice) => (
                  <div key={nivel.id} className={styles.cadeiaPasso}>
                    {indice > 0 && <ChevronRight size={18} className={styles.seta} aria-hidden="true" />}
                    <div className={styles.nivel}>
                      <span className={styles.nivelOrdem}>Nível {nivel.ordem}</span>
                      <strong className={styles.nivelNome}>{nivel.nome}</strong>
                      <span className={styles.nivelPessoas}>{nivel.usuarios.map((u) => u.nome).join(", ")}</span>
                      {nivel.usuarios.some((u) => semAcessoAoPainel.has(u.id.toUpperCase())) && (
                        <span className={styles.semAcesso}>
                          Sem acesso ao painel:{" "}
                          {nivel.usuarios
                            .filter((u) => semAcessoAoPainel.has(u.id.toUpperCase()))
                            .map((u) => u.nome)
                            .join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {alcada.sugestoes.length > 0 && (
                <Stack gap={6}>
                  <span className={styles.sugestoesTitulo}>Sugestões de direcionamento</span>
                  <ul className={styles.sugestoes}>
                    {alcada.sugestoes.map((sugestao) => (
                      <li key={sugestao.id}>
                        <span>{quandoSugestao(sugestao)}</span>
                        <ChevronRight size={14} className={styles.seta} aria-hidden="true" />
                        <span>
                          {alcada.niveis.find((n) => n.id === sugestao.nivelId)?.nome}:{" "}
                          <strong>{sugestao.usuarioNome ?? "todos do nível"}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Stack>
              )}
            </Stack>
          </Card>
        ))
      )}

      {tipo === "pedido_compra" && (
        <RubricasAprovadoresCard onFeedback={onFeedback} onAlterado={() => setRecarga((n) => n + 1)} />
      )}

      <Card title="Histórico de mudanças" description="Quem mudou as alçadas deste tipo, e o quê.">
        {historicoDoTipo.length === 0 ? (
          <span className={styles.vazio}>Nenhuma mudança registrada.</span>
        ) : (
          <ul className={styles.historico}>
            {historicoDoTipo.map((linha, indice) => (
              <li key={indice}>
                <span className={styles.historicoQuando}>
                  {formatarData(linha.criadoEm)} · {linha.usuarioNome ?? "sistema"}
                </span>
                <span>{linha.descricao}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Stack>
  );

  return (
    <>
      <Tabs
        ariaLabel="Tipo de aprovação"
        value={tipo}
        onValueChange={(valor) => setTipo(valor as TipoAprovacao)}
        items={TIPOS_APROVACAO.map((t) => ({ value: t.valor, label: t.label, content: conteudo }))}
      />

      <Modal
        open={edicao !== null}
        size="large"
        title={edicao?.id ? "Editar alçada" : "Nova alçada"}
        description={edicao ? rotuloTipoAprovacao(edicao.tipo) : undefined}
        closeOnOverlay={false}
        onClose={() => setEdicao(null)}
        footer={
          <Stack direction="row" justify="end" gap={8}>
            <Button variant="secondary" onClick={() => setEdicao(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSalvar()} loading={salvando}>
              Salvar alçada
            </Button>
          </Stack>
        }
      >
        {edicao && (
          <Stack gap={20}>
            {criterios.length > 0 && (
              <FormGrid columns={2}>
                {criterios.includes("empresa") && (
                  <Field label="Empresa" hint="Em branco: vale para todas (alçada padrão).">
                    <Dropdown
                      value={edicao.empresa}
                      options={[
                        { value: "", label: "Todas as empresas" },
                        ...EMPRESAS_PEDIDO_COMPRA.map((e) => ({ value: String(e.codigo), label: e.nome })),
                      ]}
                      onValueChange={(valor) => setEdicao({ ...edicao, empresa: valor })}
                    />
                  </Field>
                )}
                {criterios.includes("setor") && (
                  <Field label="Setor" htmlFor="alcadaSetor" hint="Como vem do RH. Em branco: vale para todos (alçada padrão).">
                    <Input
                      id="alcadaSetor"
                      list="alcadaSetores"
                      value={edicao.setor}
                      placeholder="Todos os setores"
                      onChange={(evento) => setEdicao({ ...edicao, setor: evento.target.value })}
                    />
                    <datalist id="alcadaSetores">
                      {setores.map((setor) => (
                        <option key={setor} value={setor} />
                      ))}
                    </datalist>
                  </Field>
                )}
              </FormGrid>
            )}

            <Stack gap={12}>
              <strong>Níveis (em ordem de aprovação)</strong>

              {edicao.niveis.map((nivel, indice) => {
                const jaUsados = new Set(edicao.niveis.flatMap((n) => n.usuarios.map((u) => u.id)));

                return (
                  <div key={nivel.chave} className={styles.nivelEdicao}>
                    <div className={styles.nivelEdicaoTopo}>
                      <span className={styles.nivelOrdem}>Nível {indice + 1}</span>
                      <Stack direction="row" gap={4}>
                        <IconButton
                          icon={<ArrowUp size={15} />}
                          label="Subir nível"
                          size="small"
                          disabled={indice === 0}
                          onClick={() => moverNivel(indice, -1)}
                        />
                        <IconButton
                          icon={<ArrowDown size={15} />}
                          label="Descer nível"
                          size="small"
                          disabled={indice === edicao.niveis.length - 1}
                          onClick={() => moverNivel(indice, 1)}
                        />
                        <IconButton
                          icon={<Trash2 size={15} />}
                          label="Remover nível"
                          size="small"
                          disabled={edicao.niveis.length === 1}
                          onClick={() =>
                            setEdicao({
                              ...edicao,
                              niveis: edicao.niveis.filter((n) => n.chave !== nivel.chave),
                              sugestoes: edicao.sugestoes.filter((s) => s.nivelChave !== nivel.chave),
                            })
                          }
                        />
                      </Stack>
                    </div>

                    <FormGrid columns={2}>
                      <Field label="Nome do nível" htmlFor={`nivel-${nivel.chave}`}>
                        <Input
                          id={`nivel-${nivel.chave}`}
                          value={nivel.nome}
                          placeholder="Ex.: Gerência, Diretoria"
                          onChange={(evento) => alterarNivel(nivel.chave, (n) => ({ ...n, nome: evento.target.value }))}
                        />
                      </Field>

                      <Field label="Adicionar aprovador">
                        <Autocomplete
                          key={`${nivel.chave}-${nivel.usuarios.length}`}
                          options={opcoesUsuarios.filter((o) => !jaUsados.has(o.value))}
                          placeholder="Digite o nome..."
                          maxOptions={30}
                          onSelect={(opcao) => {
                            if (!opcao) return;
                            alterarNivel(nivel.chave, (n) => ({
                              ...n,
                              usuarios: [...n.usuarios, { id: opcao.value, nome: opcao.label }],
                            }));
                          }}
                        />
                      </Field>
                    </FormGrid>

                    <div className={styles.pessoas}>
                      {nivel.usuarios.length === 0 ? (
                        <span className={styles.vazio}>Nenhum aprovador neste nível.</span>
                      ) : (
                        nivel.usuarios.map((usuario) => (
                          <span
                            key={usuario.id}
                            className={`${styles.pessoa} ${semAcessoAoPainel.has(usuario.id.toUpperCase()) ? styles.pessoaSemAcesso : ""}`}
                            title={
                              semAcessoAoPainel.has(usuario.id.toUpperCase())
                                ? "Sem a permissão do módulo Painel de Aprovações: não vai conseguir decidir. Conceda em Administração → Permissões."
                                : undefined
                            }
                          >
                            {usuario.nome}
                            <button
                              type="button"
                              className={styles.pessoaRemover}
                              aria-label={`Tirar ${usuario.nome} do nível`}
                              onClick={() =>
                                setEdicao({
                                  ...edicao,
                                  niveis: edicao.niveis.map((n) =>
                                    n.chave === nivel.chave ? { ...n, usuarios: n.usuarios.filter((u) => u.id !== usuario.id) } : n
                                  ),
                                  sugestoes: edicao.sugestoes.map((s) =>
                                    s.nivelChave === nivel.chave && s.usuarioId === usuario.id ? { ...s, usuarioId: "" } : s
                                  ),
                                })
                              }
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}

              <Stack direction="row">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setEdicao({ ...edicao, niveis: [...edicao.niveis, { chave: novaChave(), nome: "", usuarios: [] }] })
                  }
                >
                  <Plus size={16} />
                  Adicionar nível
                </Button>
              </Stack>
            </Stack>

            {edicao.niveis.length > 1 && (
              <Stack gap={12}>
                <Stack gap={4}>
                  <strong>Sugestões de direcionamento</strong>
                  <span className={styles.ajuda}>
                    Quando um nível aprova, quem do próximo nível já vem escolhido para decidir (quem aprova pode
                    trocar, ou deixar para todos). Vale a sugestão mais específica: empresa com centro de custo, depois só
                    a empresa, depois a geral. O centro de custo vale quando mais da metade dos itens do pedido está
                    nele.
                  </span>
                </Stack>

                {edicao.sugestoes.map((sugestao) => {
                  const destino = edicao.niveis.find((n) => n.chave === sugestao.nivelChave);
                  const comCentroCusto = centroCustoNaSugestaoDoTipo(edicao.tipo);

                  return (
                    <div key={sugestao.chave} className={styles.sugestaoEdicao}>
                      <FormGrid columns={comCentroCusto ? 4 : 3}>
                        <Field label="Nível que recebe">
                          <Dropdown
                            value={sugestao.nivelChave}
                            options={edicao.niveis.slice(1).map((nivel) => ({
                              value: nivel.chave,
                              label: `Nível ${edicao.niveis.indexOf(nivel) + 1}${nivel.nome ? ` · ${nivel.nome}` : ""}`,
                            }))}
                            onValueChange={(valor) =>
                              alterarSugestao(sugestao.chave, (s) => ({ ...s, nivelChave: valor, usuarioId: "" }))
                            }
                          />
                        </Field>
                        {criterios.includes("empresa") && (
                          <Field label="Empresa">
                            <Dropdown
                              value={sugestao.empresa}
                              options={[
                                { value: "", label: "Qualquer empresa" },
                                ...EMPRESAS_PEDIDO_COMPRA.filter((e) => !edicao.empresa || String(e.codigo) === edicao.empresa).map(
                                  (e) => ({ value: String(e.codigo), label: e.nome })
                                ),
                              ]}
                              onValueChange={(valor) => alterarSugestao(sugestao.chave, (s) => ({ ...s, empresa: valor }))}
                            />
                          </Field>
                        )}
                        {comCentroCusto && (
                          <Field label="Centros de custo" htmlFor={`cc-${sugestao.chave}`}>
                            <Input
                              id={`cc-${sugestao.chave}`}
                              value={sugestao.centrosCusto}
                              placeholder="Qualquer (ex.: 90.02, 90.90)"
                              onChange={(evento) =>
                                alterarSugestao(sugestao.chave, (s) => ({ ...s, centrosCusto: evento.target.value }))
                              }
                            />
                          </Field>
                        )}
                        <Field label="Direcionar para">
                          <Dropdown
                            value={sugestao.usuarioId}
                            options={[
                              { value: "", label: "Todos do nível" },
                              ...(destino?.usuarios ?? []).map((u) => ({ value: u.id, label: u.nome })),
                            ]}
                            onValueChange={(valor) => alterarSugestao(sugestao.chave, (s) => ({ ...s, usuarioId: valor }))}
                          />
                        </Field>
                      </FormGrid>
                      <IconButton
                        icon={<Trash2 size={15} />}
                        label="Remover sugestão"
                        size="small"
                        onClick={() =>
                          setEdicao({ ...edicao, sugestoes: edicao.sugestoes.filter((s) => s.chave !== sugestao.chave) })
                        }
                      />
                    </div>
                  );
                })}

                <Stack direction="row">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setEdicao({
                        ...edicao,
                        sugestoes: [
                          ...edicao.sugestoes,
                          {
                            chave: novaChave(),
                            nivelChave: edicao.niveis[1].chave,
                            empresa: edicao.empresa,
                            centrosCusto: "",
                            usuarioId: "",
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={16} />
                    Adicionar sugestão
                  </Button>
                </Stack>
              </Stack>
            )}

            {edicao.niveis.some((n) => n.usuarios.some((u) => semAcessoAoPainel.has(u.id.toUpperCase()))) && (
              <Alert variant="warning" title="Aprovador sem acesso ao Painel de Aprovações">
                Quem está marcado em amarelo não tem a permissão do módulo Painel de Aprovações e não vai
                conseguir decidir. Conceda o módulo em Administração → Permissões.
              </Alert>
            )}

            {erroEdicao && <Alert variant="danger">{erroEdicao}</Alert>}
          </Stack>
        )}
      </Modal>

      <ConfirmDialog
        open={removendo !== null}
        title="Remover alçada?"
        variant="danger"
        message={
          removendo
            ? `A regra "${tituloRegra(removendo)}" deixa de valer para as próximas solicitações. O que já está na fila continua com a cadeia que tinha.`
            : ""
        }
        confirmLabel="Remover"
        loading={processandoRemocao}
        onConfirm={handleRemover}
        onClose={() => setRemovendo(null)}
      />
    </>
  );
}
