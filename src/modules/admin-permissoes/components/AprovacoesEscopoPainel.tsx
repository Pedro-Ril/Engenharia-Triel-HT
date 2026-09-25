"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Trash2, TrendingUp, UserRound } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/Autocomplete";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";

import type { FuncionarioRh } from "@/modules/aprovacoes/types/aprovacoes.types";

import {
  adicionarRegraEscopoUsuario,
  contarRegrasEscopoPorUsuario,
  listarFuncionariosRhAdmin,
  listarRegrasEscopoUsuario,
  removerRegraEscopoUsuario,
} from "../services/adminPermissoes.service";
import type { PortalModulo, PortalPermissao, PortalUsuarioAdmin, RegraEscopo } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

interface AprovacoesEscopoPainelProps {
  usuarios: PortalUsuarioAdmin[];
  permissoes: PortalPermissao[];
  modulos: PortalModulo[];
  onFeedback: FeedbackHandler;
}

export function AprovacoesEscopoPainel({ usuarios, permissoes, modulos, onFeedback }: AprovacoesEscopoPainelProps) {
  const moduloSolicitar = modulos.find((modulo) => modulo.chave === "aprovacoes-solicitar-aumento");

  const usuariosComAcesso = useMemo(() => {
    if (!moduloSolicitar) return [];

    const idsComPermissao = new Set(
      permissoes.filter((p) => p.moduloId === moduloSolicitar.id).map((p) => p.usuarioId)
    );

    return usuarios
      .filter((usuario) => usuario.ativo && (usuario.ehAdministrador || idsComPermissao.has(usuario.id)))
      .sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao, "pt-BR"));
  }, [usuarios, permissoes, moduloSolicitar]);

  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState<string | null>(
    usuariosComAcesso[0]?.id ?? null
  );

  const [carregando, setCarregando] = useState(false);
  const [erroFuncionarios, setErroFuncionarios] = useState<string | null>(null);
  const [funcionarios, setFuncionarios] = useState<FuncionarioRh[]>([]);
  const [regras, setRegras] = useState<RegraEscopo[]>([]);
  const [contagemPorUsuario, setContagemPorUsuario] = useState<Record<string, number>>({});
  const [alterando, setAlterando] = useState<string | null>(null);
  const [chaveBuscaSetor, setChaveBuscaSetor] = useState(0);
  const [chaveBuscaColaborador, setChaveBuscaColaborador] = useState(0);

  useEffect(() => {
    if (usuarioSelecionadoId && !usuariosComAcesso.some((u) => u.id === usuarioSelecionadoId)) {
      setUsuarioSelecionadoId(usuariosComAcesso[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuariosComAcesso]);

  /* Independente de qual usuário está selecionado -- alimenta o badge de TODAS as linhas da lista. */
  useEffect(() => {
    contarRegrasEscopoPorUsuario().then((resultado) => {
      if (resultado.ok && resultado.data) setContagemPorUsuario(resultado.data);
    });
  }, []);

  useEffect(() => {
    if (!usuarioSelecionadoId) return;

    let cancelado = false;
    setCarregando(true);
    setErroFuncionarios(null);

    Promise.all([
      listarFuncionariosRhAdmin(usuarioSelecionadoId),
      listarRegrasEscopoUsuario(usuarioSelecionadoId),
    ]).then(([funcionariosResultado, regrasResultado]) => {
      if (cancelado) return;

      if (funcionariosResultado.ok && funcionariosResultado.data) {
        setFuncionarios(funcionariosResultado.data);
      } else {
        setFuncionarios([]);
        setErroFuncionarios(
          funcionariosResultado.message ?? "Não foi possível carregar os colaboradores do RH."
        );
      }

      if (regrasResultado.ok && regrasResultado.data) {
        setRegras(regrasResultado.data);
      } else {
        setRegras([]);
      }

      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [usuarioSelecionadoId]);

  const unidadesPermitidas = regras.filter((r) => r.tipo === "unidade_permitida");
  const setoresExcluidos = regras.filter((r) => r.tipo === "setor_excluido");
  const colaboradoresExcluidos = regras.filter((r) => r.tipo === "colaborador_excluido");

  /* Todas as unidades existentes -- essa lista de opções NÃO é filtrada pelas próprias unidades permitidas (senão não daria pra escolher a primeira). */
  const unidades = useMemo(() => {
    const unicas = new Set<string>();
    for (const f of funcionarios) if (f.departamento) unicas.add(f.departamento);
    return [...unicas].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [funcionarios]);

  /*
   * Setor e colaborador só fazem sentido excluir DENTRO do que o
   * usuário já enxerga -- sem unidade permitida marcada, ele não vê
   * ninguém mesmo, então nem faz sentido oferecer exceção pra
   * setor/colaborador de fora disso.
   */
  const unidadesPermitidasValores = useMemo(
    () => new Set(unidadesPermitidas.map((r) => r.valor)),
    [unidadesPermitidas]
  );

  const funcionariosNasUnidadesPermitidas = useMemo(
    () => funcionarios.filter((f) => f.departamento && unidadesPermitidasValores.has(f.departamento)),
    [funcionarios, unidadesPermitidasValores]
  );

  const setores = useMemo(() => {
    const unicos = new Set<string>();
    for (const f of funcionariosNasUnidadesPermitidas) if (f.setor) unicos.add(f.setor);
    return [...unicos].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [funcionariosNasUnidadesPermitidas]);

  const codigosJaExcluidos = new Set(colaboradoresExcluidos.map((r) => r.valor));
  const opcoesColaborador = useMemo<AutocompleteOption[]>(
    () =>
      funcionariosNasUnidadesPermitidas
        .filter((f) => !codigosJaExcluidos.has(f.codigo))
        .map((f) => ({ value: f.codigo, label: `${f.nome}${f.departamento ? ` — ${f.departamento}` : ""}` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [funcionariosNasUnidadesPermitidas, colaboradoresExcluidos]
  );

  const setoresJaExcluidos = new Set(setoresExcluidos.map((r) => r.valor));
  const opcoesSetor = useMemo<AutocompleteOption[]>(
    () => setores.filter((setor) => !setoresJaExcluidos.has(setor)).map((setor) => ({ value: setor, label: setor })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setores, setoresExcluidos]
  );

  async function alternarRegra(
    tipo: RegraEscopo["tipo"],
    valor: string,
    valorRotulo: string | null,
    marcar: boolean
  ) {
    if (!usuarioSelecionadoId) return;
    const chave = `${tipo}:${valor}`;
    setAlterando(chave);

    try {
      if (marcar) {
        const resultado = await adicionarRegraEscopoUsuario({
          usuarioId: usuarioSelecionadoId,
          tipo,
          valor,
          valorRotulo,
        });

        if (resultado.ok && resultado.data) {
          setRegras((atual) => [...atual, resultado.data as RegraEscopo]);
          setContagemPorUsuario((atual) => ({
            ...atual,
            [usuarioSelecionadoId]: (atual[usuarioSelecionadoId] ?? 0) + 1,
          }));
        } else {
          onFeedback("danger", "Não foi possível salvar", resultado.message ?? "Tente novamente em instantes.");
        }
      } else {
        const existente = regras.find((r) => r.tipo === tipo && r.valor === valor);
        if (!existente) return;

        const resultado = await removerRegraEscopoUsuario(existente.id);

        if (resultado.ok) {
          setRegras((atual) => atual.filter((r) => r.id !== existente.id));
          setContagemPorUsuario((atual) => ({
            ...atual,
            [usuarioSelecionadoId]: Math.max(0, (atual[usuarioSelecionadoId] ?? 1) - 1),
          }));
        } else {
          onFeedback("danger", "Não foi possível remover", resultado.message ?? "Tente novamente em instantes.");
        }
      }
    } finally {
      setAlterando(null);
    }
  }

  async function handleAdicionarSetorExcluido(opcao: AutocompleteOption | null) {
    if (!opcao) return;

    await alternarRegra("setor_excluido", opcao.value, null, true);
    setChaveBuscaSetor((atual) => atual + 1);
  }

  async function handleAdicionarColaboradorExcluido(opcao: AutocompleteOption | null) {
    if (!opcao) return;
    const funcionario = funcionarios.find((f) => f.codigo === opcao.value);
    if (!funcionario) return;

    await alternarRegra("colaborador_excluido", funcionario.codigo, funcionario.nome, true);
    setChaveBuscaColaborador((atual) => atual + 1);
  }

  const usuarioSelecionado = usuariosComAcesso.find((u) => u.id === usuarioSelecionadoId);

  if (!moduloSolicitar) {
    return (
      <p>
        O módulo &quot;Reajuste Salarial&quot; ainda não existe em Setores e Módulos — nada para
        configurar aqui.
      </p>
    );
  }

  if (usuariosComAcesso.length === 0) {
    return (
      <p>
        Nenhum usuário com acesso a &quot;Reajuste Salarial&quot; ainda — conceda o acesso em
        Permissões antes de configurar o escopo.
      </p>
    );
  }

  return (
    <div className={styles.painelPermissoes}>
      <nav className={styles.listaUsuarios} aria-label="Selecionar usuário">
        {usuariosComAcesso.map((usuario) => {
          const total = contagemPorUsuario[usuario.id] ?? 0;
          const ativo = usuario.id === usuarioSelecionadoId;

          return (
            <button
              key={usuario.id}
              type="button"
              className={`${styles.usuarioItem} ${ativo ? styles.usuarioItemAtivo : ""}`}
              onClick={() => setUsuarioSelecionadoId(usuario.id)}
            >
              <span className={styles.usuarioItemNome}>{usuario.nomeExibicao}</span>
              <Badge variant={ativo ? "primary" : "neutral"}>{total}</Badge>
            </button>
          );
        })}
      </nav>

      <div className={styles.painelPermissoesConteudo}>
        {!usuarioSelecionado ? (
          <EmptyState
            icon={<UserRound size={32} />}
            title="Selecione um usuário"
            description="Escolha um usuário na lista ao lado para configurar quais colaboradores ele pode ver."
          />
        ) : !usuarioSelecionado.codigoEmpresa ? (
          <Alert variant="warning">
            {usuarioSelecionado.nomeExibicao} não tem uma empresa cadastrada no portal — configure isso
            primeiro (aba Usuários) antes de definir o escopo, senão a busca de colaboradores nem funciona
            para ele.
          </Alert>
        ) : carregando ? (
          <Loader label="Carregando colaboradores do RH..." />
        ) : erroFuncionarios ? (
          <Alert variant="danger">{erroFuncionarios}</Alert>
        ) : (
          <Stack gap={16}>
            {unidadesPermitidas.length === 0 ? (
              <Alert variant="warning">
                Nenhuma unidade liberada — <strong>{usuarioSelecionado.nomeExibicao}</strong> não consegue
                ver nenhum colaborador na tela de Reajuste Salarial até que pelo menos uma unidade seja
                marcada abaixo.
              </Alert>
            ) : (
              <p className={styles.usuarioSub}>
                <strong>{usuarioSelecionado.nomeExibicao}</strong> só vê colaboradores das unidades marcadas
                abaixo.
              </p>
            )}

            <Card
              title="Unidades permitidas"
              description="Obrigatório marcar pelo menos uma — sem nenhuma marcada, o usuário não vê nenhum colaborador."
            >
              {unidades.length === 0 ? (
                <EmptyState icon={<TrendingUp size={24} />} title="Nenhuma unidade encontrada" />
              ) : (
                <Stack direction="row" gap={16} wrap>
                  {unidades.map((unidade) => {
                    const chave = `unidade_permitida:${unidade}`;
                    return (
                      <Checkbox
                        key={unidade}
                        label={unidade}
                        checked={unidadesPermitidas.some((r) => r.valor === unidade)}
                        disabled={alterando === chave}
                        onChange={(event) =>
                          alternarRegra("unidade_permitida", unidade, null, event.target.checked)
                        }
                      />
                    );
                  })}
                </Stack>
              )}
            </Card>

            <Card
              title="Setores excluídos"
              description="Nunca aparecem para este usuário, mesmo dentro de uma unidade permitida."
              allowOverflow
            >
              {setores.length === 0 ? (
                <EmptyState icon={<Ban size={24} />} title="Nenhum setor encontrado" />
              ) : (
                <Stack gap={12}>
                  <Autocomplete
                    key={chaveBuscaSetor}
                    options={opcoesSetor}
                    onSelect={handleAdicionarSetorExcluido}
                    placeholder="Digite o nome do setor para excluir"
                    maxOptions={30}
                  />

                  {setoresExcluidos.length > 0 && (
                    <Stack gap={8}>
                      {setoresExcluidos.map((regra) => (
                        <Stack key={regra.id} direction="row" justify="between" align="center">
                          <span>{regra.valorRotulo ?? regra.valor}</span>
                          <IconButton
                            icon={<Trash2 size={15} />}
                            label={`Remover exclusão de ${regra.valorRotulo ?? regra.valor}`}
                            variant="danger"
                            size="small"
                            disabled={alterando === `setor_excluido:${regra.valor}`}
                            onClick={() => alternarRegra("setor_excluido", regra.valor, null, false)}
                          />
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Stack>
              )}
            </Card>

            <Card
              title="Colaboradores excluídos"
              description="Bloqueia um colaborador específico, independente de unidade/setor."
              allowOverflow
            >
              {funcionariosNasUnidadesPermitidas.length === 0 ? (
                <EmptyState icon={<Ban size={24} />} title="Nenhum colaborador encontrado" />
              ) : (
                <Stack gap={12}>
                  <Autocomplete
                    key={chaveBuscaColaborador}
                    options={opcoesColaborador}
                    onSelect={handleAdicionarColaboradorExcluido}
                    placeholder="Digite o nome do colaborador para excluir"
                    maxOptions={30}
                  />

                  {colaboradoresExcluidos.length > 0 && (
                    <Stack gap={8}>
                      {colaboradoresExcluidos.map((regra) => (
                        <Stack key={regra.id} direction="row" justify="between" align="center">
                          <span>{regra.valorRotulo ?? regra.valor}</span>
                          <IconButton
                            icon={<Trash2 size={15} />}
                            label={`Remover exclusão de ${regra.valorRotulo ?? regra.valor}`}
                            variant="danger"
                            size="small"
                            disabled={alterando === `colaborador_excluido:${regra.valor}`}
                            onClick={() => alternarRegra("colaborador_excluido", regra.valor, null, false)}
                          />
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Stack>
              )}
            </Card>
          </Stack>
        )}
      </div>
    </div>
  );
}
