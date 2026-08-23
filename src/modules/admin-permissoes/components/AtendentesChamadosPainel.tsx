"use client";

import { useEffect, useState } from "react";
import { Headset } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import {
  adicionarAtendenteChamados,
  atualizarAceiteChamadosSetor,
  listarAtendentesChamados,
  listarSetoresAceiteChamados,
  removerAtendenteChamados,
} from "@/modules/chamados/services/chamados.service";
import type {
  ChamadosAtendente,
  SetorAceiteChamados,
} from "@/modules/chamados/types/chamados.types";

import { listarSetores, listarUsuarios } from "../services/adminPermissoes.service";
import type { PortalSetor, PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

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

  useEffect(() => {
    if (usuarioSelecionadoId && !usuarios.some((u) => u.id === usuarioSelecionadoId)) {
      setUsuarioSelecionadoId(usuarios[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarios]);

  useEffect(() => {
    async function carregar() {
      const [usuariosData, setoresData, atendentesData, setoresAceiteData] = await Promise.all([
        listarUsuarios(),
        listarSetores(),
        listarAtendentesChamados(),
        listarSetoresAceiteChamados(),
      ]);

      const usuariosAtivos = usuariosData
        .filter((usuario) => usuario.ativo)
        .sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao));

      setUsuarios(usuariosAtivos);
      setSetores(setoresData.filter((setor) => setor.ativo));
      setAtendentes(atendentesData);
      setSetoresAceite(setoresAceiteData);
      setUsuarioSelecionadoId(usuariosAtivos[0]?.id ?? null);
      setCarregando(false);
    }

    carregar();
  }, []);

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
    </Stack>
  );
}
