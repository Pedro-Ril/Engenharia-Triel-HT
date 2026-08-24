"use client";

import { useEffect, useMemo, useState } from "react";
import { Headset, Pencil, Plus, Tags, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import {
  adicionarAtendenteChamados,
  atualizarAceiteChamadosSetor,
  atualizarCategoriaChamados,
  criarCategoriaChamados,
  excluirCategoriaChamados,
  listarAtendentesChamados,
  listarCategoriasChamados,
  listarSetoresAceiteChamados,
  removerAtendenteChamados,
} from "@/modules/chamados/services/chamados.service";
import type {
  CategoriaChamado,
  ChamadosAtendente,
  SetorAceiteChamados,
} from "@/modules/chamados/types/chamados.types";

import { listarSetores, listarUsuarios } from "../services/adminPermissoes.service";
import type { PortalSetor, PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

function novaCategoriaInicial() {
  return { setorId: "", nome: "", ordem: "0" };
}

interface AtendentesChamadosPainelProps {
  onFeedback: FeedbackHandler;
}

export function AtendentesChamadosPainel({ onFeedback }: AtendentesChamadosPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [usuarios, setUsuarios] = useState<PortalUsuarioAdmin[]>([]);
  const [setores, setSetores] = useState<PortalSetor[]>([]);
  const [setoresAceite, setSetoresAceite] = useState<SetorAceiteChamados[]>([]);
  const [atendentes, setAtendentes] = useState<ChamadosAtendente[]>([]);
  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState<string | null>(null);
  const [alterando, setAlterando] = useState<string | null>(null);
  const [alterandoAceite, setAlterandoAceite] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<{
    usuario: PortalUsuarioAdmin;
    setor: PortalSetor;
  } | null>(null);

  const [categorias, setCategorias] = useState<CategoriaChamado[]>([]);
  const [novaCategoria, setNovaCategoria] = useState(novaCategoriaInicial());
  const [criandoCategoria, setCriandoCategoria] = useState(false);
  const [erroCategoria, setErroCategoria] = useState<string | null>(null);
  const [alterandoAtivoCategoria, setAlterandoAtivoCategoria] = useState<string | null>(null);

  const [categoriaEditando, setCategoriaEditando] = useState<CategoriaChamado | null>(null);
  const [formCategoriaEdicao, setFormCategoriaEdicao] = useState({ nome: "", ordem: "0" });
  const [salvandoCategoriaEdicao, setSalvandoCategoriaEdicao] = useState(false);
  const [erroCategoriaEdicao, setErroCategoriaEdicao] = useState<string | null>(null);

  const [categoriaExcluindo, setCategoriaExcluindo] = useState<CategoriaChamado | null>(null);
  const [confirmandoExclusaoCategoria, setConfirmandoExclusaoCategoria] = useState(false);
  const [erroExclusaoCategoria, setErroExclusaoCategoria] = useState<string | null>(null);

  useEffect(() => {
    if (usuarioSelecionadoId && !usuarios.some((u) => u.id === usuarioSelecionadoId)) {
      setUsuarioSelecionadoId(usuarios[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarios]);

  useEffect(() => {
    async function carregar() {
      const [usuariosData, setoresData, atendentesData, setoresAceiteData, categoriasData] =
        await Promise.all([
          listarUsuarios(),
          listarSetores(),
          listarAtendentesChamados(),
          listarSetoresAceiteChamados(),
          listarCategoriasChamados(),
        ]);

      const usuariosAtivos = usuariosData
        .filter((usuario) => usuario.ativo)
        .sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao));

      setUsuarios(usuariosAtivos);
      setSetores(setoresData.filter((setor) => setor.ativo));
      setAtendentes(atendentesData);
      setSetoresAceite(setoresAceiteData);
      setCategorias(categoriasData);
      setUsuarioSelecionadoId(usuariosAtivos[0]?.id ?? null);
      setCarregando(false);
    }

    carregar();
  }, []);

  const categoriasPorSetor = useMemo(() => {
    const mapa = new Map<string, { setorNome: string; itens: CategoriaChamado[] }>();

    for (const categoria of categorias) {
      if (!mapa.has(categoria.setorId)) {
        mapa.set(categoria.setorId, { setorNome: categoria.setorNome, itens: [] });
      }
      mapa.get(categoria.setorId)?.itens.push(categoria);
    }

    return Array.from(mapa.values()).sort((a, b) => a.setorNome.localeCompare(b.setorNome, "pt-BR"));
  }, [categorias]);

  if (carregando) {
    return <Loader label="Carregando atendentes de chamados..." />;
  }

  function atendentesDoUsuario(usuarioId: string) {
    return atendentes.filter((atendente) => atendente.usuarioId === usuarioId);
  }

  function buscarAtendente(usuarioId: string, setorId: string) {
    return atendentes.find(
      (atendente) => atendente.usuarioId === usuarioId && atendente.setorId === setorId
    );
  }

  async function alternarAceiteChamados(setor: SetorAceiteChamados, aceitar: boolean) {
    setAlterandoAceite(setor.id);

    try {
      const resultado = await atualizarAceiteChamadosSetor(setor.id, aceitar);

      if (resultado.ok) {
        setSetoresAceite((atual) =>
          atual.map((item) =>
            item.id === setor.id ? { ...item, aceitaChamados: aceitar } : item
          )
        );
      } else {
        onFeedback(
          "danger",
          "Não foi possível atualizar o setor",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setAlterandoAceite(null);
    }
  }

  async function alternar(usuario: PortalUsuarioAdmin, setor: PortalSetor, marcar: boolean) {
    const chave = `${usuario.id}:${setor.id}`;
    setAlterando(chave);

    try {
      if (marcar) {
        const resultado = await adicionarAtendenteChamados({
          usuarioId: usuario.id,
          setorId: setor.id,
        });

        if (resultado.ok && resultado.data) {
          setAtendentes((atual) => [...atual, resultado.data as ChamadosAtendente]);
        } else {
          onFeedback(
            "danger",
            "Não foi possível adicionar o atendente",
            resultado.message ?? "Tente novamente em instantes."
          );
        }
      } else {
        const existente = buscarAtendente(usuario.id, setor.id);
        if (!existente) return;

        const resultado = await removerAtendenteChamados(existente.id);

        if (resultado.ok) {
          setAtendentes((atual) => atual.filter((item) => item.id !== existente.id));
        } else {
          onFeedback(
            "danger",
            "Não foi possível remover o atendente",
            resultado.message ?? "Tente novamente em instantes."
          );
        }
      }
    } finally {
      setAlterando(null);
    }
  }

  async function handleCriarCategoria() {
    setErroCategoria(null);
    setCriandoCategoria(true);

    try {
      const resultado = await criarCategoriaChamados({
        setorId: novaCategoria.setorId,
        nome: novaCategoria.nome,
        ordem: Number(novaCategoria.ordem) || 0,
      });

      if (resultado.ok && resultado.data) {
        setCategorias((atual) => [...atual, resultado.data as CategoriaChamado]);
        setNovaCategoria(novaCategoriaInicial());
        onFeedback("success", "Categoria criada", `"${resultado.data.nome}" foi cadastrada.`);
      } else {
        setErroCategoria(resultado.message ?? "Não foi possível criar a categoria.");
      }
    } finally {
      setCriandoCategoria(false);
    }
  }

  async function alternarAtivoCategoria(categoria: CategoriaChamado, ativo: boolean) {
    setAlterandoAtivoCategoria(categoria.id);

    try {
      const resultado = await atualizarCategoriaChamados(categoria.id, { ativo });

      if (resultado.ok && resultado.data) {
        setCategorias((atual) =>
          atual.map((item) => (item.id === categoria.id ? (resultado.data as CategoriaChamado) : item))
        );
      } else {
        onFeedback(
          "danger",
          "Não foi possível atualizar a categoria",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setAlterandoAtivoCategoria(null);
    }
  }

  function abrirEdicaoCategoria(categoria: CategoriaChamado) {
    setCategoriaEditando(categoria);
    setErroCategoriaEdicao(null);
    setFormCategoriaEdicao({ nome: categoria.nome, ordem: String(categoria.ordem) });
  }

  async function handleSalvarEdicaoCategoria() {
    if (!categoriaEditando) return;

    setErroCategoriaEdicao(null);
    setSalvandoCategoriaEdicao(true);

    try {
      const resultado = await atualizarCategoriaChamados(categoriaEditando.id, {
        nome: formCategoriaEdicao.nome,
        ordem: Number(formCategoriaEdicao.ordem) || 0,
      });

      if (resultado.ok && resultado.data) {
        setCategorias((atual) =>
          atual.map((item) =>
            item.id === categoriaEditando.id ? (resultado.data as CategoriaChamado) : item
          )
        );
        onFeedback("success", "Categoria atualizada", `"${resultado.data.nome}" foi atualizada.`);
        setCategoriaEditando(null);
      } else {
        setErroCategoriaEdicao(resultado.message ?? "Não foi possível salvar as alterações.");
      }
    } finally {
      setSalvandoCategoriaEdicao(false);
    }
  }

  async function handleConfirmarExclusaoCategoria() {
    if (!categoriaExcluindo) return;

    setErroExclusaoCategoria(null);
    setConfirmandoExclusaoCategoria(true);

    try {
      const resultado = await excluirCategoriaChamados(categoriaExcluindo.id);

      if (resultado.ok) {
        setCategorias((atual) => atual.filter((item) => item.id !== categoriaExcluindo.id));
        onFeedback("success", "Categoria excluída", `"${categoriaExcluindo.nome}" foi removida.`);
        setCategoriaExcluindo(null);
      } else {
        setErroExclusaoCategoria(
          resultado.message ?? "Não foi possível excluir a categoria."
        );
      }
    } finally {
      setConfirmandoExclusaoCategoria(false);
    }
  }

  const usuarioSelecionado = usuarios.find((usuario) => usuario.id === usuarioSelecionadoId);

  return (
    <Stack gap={20}>
      <Card
        title="Setores que aceitam chamados"
        description='Só os setores habilitados aqui aparecem no formulário público de abertura de chamado ("/chamados"). Setores novos começam desabilitados.'
      >
        {setoresAceite.length === 0 ? (
          <EmptyState
            icon={<Headset size={28} />}
            title="Nenhum setor ativo cadastrado"
            description="Cadastre setores em Administração → Setores e módulos."
          />
        ) : (
          <Stack direction="row" gap={24} wrap>
            {setoresAceite.map((setor) => (
              <Switch
                key={setor.id}
                label={setor.nome}
                checked={setor.aceitaChamados}
                disabled={alterandoAceite === setor.id}
                onChange={(event) => alternarAceiteChamados(setor, event.target.checked)}
              />
            ))}
          </Stack>
        )}
      </Card>

      <Card
        title="Categorias de chamados"
        description="Cada setor tem sua própria lista — quem abre um chamado escolhe entre as categorias do setor selecionado. Categoria inativa some do formulário de abertura, mas continua aparecendo nos chamados que já a usam."
      >
        <Stack gap={16}>
          {categorias.length === 0 && (
            <EmptyState
              icon={<Tags size={28} />}
              title="Nenhuma categoria cadastrada"
              description="Cadastre a primeira categoria usando o formulário abaixo."
            />
          )}

          <FormGrid columns={3}>
            <Field label="Setor">
              <Dropdown
                value={novaCategoria.setorId}
                placeholder="Selecione o setor"
                options={setores.map((setor) => ({ value: setor.id, label: setor.nome }))}
                onValueChange={(valor) =>
                  setNovaCategoria((atual) => ({ ...atual, setorId: valor }))
                }
              />
            </Field>

            <Field label="Nome">
              <Input
                value={novaCategoria.nome}
                onChange={(event) =>
                  setNovaCategoria((atual) => ({ ...atual, nome: event.target.value }))
                }
              />
            </Field>

            <Field label="Ordem">
              <NumberInput
                value={novaCategoria.ordem}
                onChange={(event) =>
                  setNovaCategoria((atual) => ({ ...atual, ordem: event.target.value }))
                }
              />
            </Field>
          </FormGrid>

          {erroCategoria && <Alert variant="danger">{erroCategoria}</Alert>}

          <Stack direction="row" justify="end">
            <Button
              variant="secondary"
              onClick={handleCriarCategoria}
              loading={criandoCategoria}
              disabled={!novaCategoria.setorId || !novaCategoria.nome}
            >
              <Plus size={16} />
              Nova categoria
            </Button>
          </Stack>
        </Stack>
      </Card>

      {categoriasPorSetor.map((grupo) => (
        <Card key={grupo.setorNome} title={grupo.setorNome} description={`${grupo.itens.length} categoria(s)`}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Nome</TableHeaderCell>
                <TableHeaderCell align="center">Ordem</TableHeaderCell>
                <TableHeaderCell align="center">Ativo</TableHeaderCell>
                <TableHeaderCell align="center">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {grupo.itens.map((categoria) => (
                <TableRow key={categoria.id}>
                  <TableCell>{categoria.nome}</TableCell>
                  <TableCell align="center">{categoria.ordem}</TableCell>
                  <TableCell align="center">
                    <div className={styles.checkboxCentro}>
                      <Switch
                        label=""
                        compact
                        checked={categoria.ativo}
                        disabled={alterandoAtivoCategoria === categoria.id}
                        onChange={(event) =>
                          alternarAtivoCategoria(categoria, event.target.checked)
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" gap={6} justify="center">
                      <IconButton
                        icon={<Pencil size={15} />}
                        label={`Editar categoria ${categoria.nome}`}
                        size="small"
                        onClick={() => abrirEdicaoCategoria(categoria)}
                      />
                      <IconButton
                        icon={<Trash2 size={15} />}
                        label={`Excluir categoria ${categoria.nome}`}
                        size="small"
                        variant="danger"
                        onClick={() => setCategoriaExcluindo(categoria)}
                      />
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}

      <Card
        title="Atendentes de chamados"
        description="Defina quais usuários atendem chamados de cada setor — independente de ser administrador. Administradores sempre atendem todos os setores."
      >
        {usuarios.length === 0 ? (
          <EmptyState
            icon={<Headset size={28} />}
            title="Nenhum usuário disponível"
            description="Usuários aparecem aqui depois de fazer login pelo menos uma vez."
          />
        ) : (
          <div className={styles.painelPermissoes}>
            <div className={styles.listaUsuarios}>
              {usuarios.map((usuario) => (
                <button
                  key={usuario.id}
                  type="button"
                  className={`${styles.usuarioItem} ${
                    usuario.id === usuarioSelecionadoId ? styles.usuarioItemAtivo : ""
                  }`}
                  onClick={() => setUsuarioSelecionadoId(usuario.id)}
                >
                  <span className={styles.usuarioItemNome}>{usuario.nomeExibicao}</span>
                  <span>{atendentesDoUsuario(usuario.id).length}</span>
                </button>
              ))}
            </div>

            <div className={styles.painelPermissoesConteudo}>
              {usuarioSelecionado && (
                <Stack gap={16}>
                  <p className={styles.usuarioSub}>
                    Setores atendidos por <strong>{usuarioSelecionado.nomeExibicao}</strong>
                    {usuarioSelecionado.ehAdministrador &&
                      " — já é administrador, então atende todos os setores independente da seleção abaixo."}
                  </p>

                  <Stack direction="row" gap={16} wrap>
                    {setores.map((setor) => {
                      const marcado = Boolean(buscarAtendente(usuarioSelecionado.id, setor.id));
                      const chave = `${usuarioSelecionado.id}:${setor.id}`;

                      return (
                        <Checkbox
                          key={setor.id}
                          label={setor.nome}
                          checked={marcado}
                          disabled={alterando === chave}
                          onChange={(event) => {
                            if (event.target.checked) {
                              alternar(usuarioSelecionado, setor, true);
                            } else {
                              setRemovendo({ usuario: usuarioSelecionado, setor });
                            }
                          }}
                        />
                      );
                    })}
                  </Stack>
                </Stack>
              )}
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={removendo !== null}
        title="Remover atendente?"
        variant="warning"
        message={
          removendo
            ? `${removendo.usuario.nomeExibicao} deixa de atender chamados do setor "${removendo.setor.nome}".`
            : ""
        }
        confirmLabel="Remover"
        loading={removendo ? alterando === `${removendo.usuario.id}:${removendo.setor.id}` : false}
        onConfirm={async () => {
          if (!removendo) return;
          await alternar(removendo.usuario, removendo.setor, false);
          setRemovendo(null);
        }}
        onClose={() => setRemovendo(null)}
      />

      <Modal
        open={categoriaEditando !== null}
        title="Editar categoria"
        size="small"
        onClose={() => setCategoriaEditando(null)}
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={() => setCategoriaEditando(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarEdicaoCategoria}
              loading={salvandoCategoriaEdicao}
              disabled={!formCategoriaEdicao.nome}
            >
              Salvar
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          <Field label="Nome">
            <Input
              value={formCategoriaEdicao.nome}
              onChange={(event) =>
                setFormCategoriaEdicao((atual) => ({ ...atual, nome: event.target.value }))
              }
            />
          </Field>

          <Field label="Ordem">
            <NumberInput
              value={formCategoriaEdicao.ordem}
              onChange={(event) =>
                setFormCategoriaEdicao((atual) => ({ ...atual, ordem: event.target.value }))
              }
            />
          </Field>

          {erroCategoriaEdicao && <Alert variant="danger">{erroCategoriaEdicao}</Alert>}
        </Stack>
      </Modal>

      <ConfirmDialog
        open={categoriaExcluindo !== null}
        title="Excluir categoria?"
        variant="danger"
        message={
          categoriaExcluindo
            ? erroExclusaoCategoria ??
              `"${categoriaExcluindo.nome}" será removida. Se já houver chamados com esta categoria, a exclusão não será possível — desative-a nesse caso.`
            : ""
        }
        confirmLabel="Excluir"
        loading={confirmandoExclusaoCategoria}
        onConfirm={handleConfirmarExclusaoCategoria}
        onClose={() => {
          setCategoriaExcluindo(null);
          setErroExclusaoCategoria(null);
        }}
      />
    </Stack>
  );
}
