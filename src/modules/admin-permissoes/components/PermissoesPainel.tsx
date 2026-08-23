"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Stack } from "@/components/ui/Stack";

import {
  concederPermissao,
  revogarPermissao,
} from "../services/adminPermissoes.service";
import type {
  PortalModulo,
  PortalPermissao,
  PortalSetor,
  PortalUsuarioAdmin,
} from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

interface PermissoesPainelProps {
  setores: PortalSetor[];
  modulos: PortalModulo[];
  usuarios: PortalUsuarioAdmin[];
  permissoes: PortalPermissao[];
  onPermissaoCriada: (permissao: PortalPermissao) => void;
  onPermissaoRemovida: (permissaoId: string) => void;
  onFeedback: FeedbackHandler;
}

export function PermissoesPainel({
  setores,
  modulos,
  usuarios,
  permissoes,
  onPermissaoCriada,
  onPermissaoRemovida,
  onFeedback,
}: PermissoesPainelProps) {
  const usuariosAtivos = usuarios
    .filter((usuario) => usuario.ativo && !usuario.ehAdministrador)
    .sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao));

  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState<
    string | null
  >(usuariosAtivos[0]?.id ?? null);

  const [alterando, setAlterando] = useState<string | null>(null);
  const [revogando, setRevogando] = useState<{
    usuario: PortalUsuarioAdmin;
    modulo: PortalModulo;
  } | null>(null);

  /*
   * Se o usuário selecionado for desativado (aba Usuários) ou
   * deixar de existir enquanto esta aba está aberta, a seleção
   * fica "órfã" — troca sozinha em vez de só sumir sem explicação.
   */
  useEffect(() => {
    if (usuarioSelecionadoId && !usuariosAtivos.some((u) => u.id === usuarioSelecionadoId)) {
      setUsuarioSelecionadoId(usuariosAtivos[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuariosAtivos]);

  /*
   * Só faz sentido conceder acesso individual a módulos que
   * não são públicos — módulos públicos já liberam sozinhos.
   */
  const modulosRestritos = modulos.filter(
    (modulo) =>
      modulo.ativo && !modulo.publicoSemLogin && !modulo.publicoAutenticado
  );

  const setoresComModulosRestritos = setores
    .map((setor) => ({
      setor,
      modulos: modulosRestritos
        .filter((modulo) => modulo.setorIds.includes(setor.id))
        .sort((a, b) => a.ordem - b.ordem),
    }))
    .filter((grupo) => grupo.modulos.length > 0);

  function permissoesDoUsuario(usuarioId: string) {
    return permissoes.filter((permissao) => permissao.usuarioId === usuarioId);
  }

  function temPermissao(usuarioId: string, moduloId: string) {
    return permissoes.find(
      (permissao) =>
        permissao.usuarioId === usuarioId && permissao.moduloId === moduloId
    );
  }

  async function alternar(
    usuario: PortalUsuarioAdmin,
    modulo: PortalModulo,
    marcar: boolean
  ) {
    const chave = `${usuario.id}:${modulo.id}`;
    setAlterando(chave);

    try {
      if (marcar) {
        const resultado = await concederPermissao({
          usuarioId: usuario.id,
          moduloId: modulo.id,
        });

        if (resultado.ok && resultado.data) {
          onPermissaoCriada(resultado.data);
          onFeedback(
            "success",
            "Acesso concedido",
            `${usuario.nomeExibicao} agora tem acesso a "${modulo.nome}".`
          );
        } else {
          onFeedback(
            "danger",
            "Não foi possível conceder o acesso",
            resultado.message ?? "Tente novamente em instantes."
          );
        }
      } else {
        const existente = temPermissao(usuario.id, modulo.id);

        if (existente) {
          const resultado = await revogarPermissao(existente.id);

          if (resultado.ok) {
            onPermissaoRemovida(existente.id);
            onFeedback(
              "success",
              "Acesso revogado",
              `${usuario.nomeExibicao} perdeu o acesso a "${modulo.nome}".`
            );
          } else {
            onFeedback(
              "danger",
              "Não foi possível revogar o acesso",
              resultado.message ?? "Tente novamente em instantes."
            );
          }
        }
      }
    } finally {
      setAlterando(null);
    }
  }

  if (modulosRestritos.length === 0) {
    return (
      <p>
        Nenhum módulo restrito cadastrado — todos os módulos ativos estão
        marcados como públicos. Ajuste isso na aba &quot;Setores e
        módulos&quot; para liberar acesso individual por usuário.
      </p>
    );
  }

  if (usuariosAtivos.length === 0) {
    return (
      <p>
        Nenhum usuário disponível para receber permissões — administradores
        já têm acesso a tudo automaticamente e não aparecem aqui.
      </p>
    );
  }

  const usuarioSelecionado = usuariosAtivos.find(
    (usuario) => usuario.id === usuarioSelecionadoId
  );

  return (
    <div className={styles.painelPermissoes}>
      <nav className={styles.listaUsuarios} aria-label="Selecionar usuário">
        {usuariosAtivos.map((usuario) => {
          const total = permissoesDoUsuario(usuario.id).length;
          const ativo = usuario.id === usuarioSelecionadoId;

          return (
            <button
              key={usuario.id}
              type="button"
              className={`${styles.usuarioItem} ${
                ativo ? styles.usuarioItemAtivo : ""
              }`}
              onClick={() => setUsuarioSelecionadoId(usuario.id)}
            >
              <span className={styles.usuarioItemNome}>
                {usuario.nomeExibicao}
              </span>

              <Badge variant={ativo ? "danger" : "neutral"}>{total}</Badge>
            </button>
          );
        })}
      </nav>

      <div className={styles.painelPermissoesConteudo}>
        {usuarioSelecionado ? (
          <Stack gap={16}>
            {setoresComModulosRestritos.map(({ setor, modulos: modulosDoSetor }) => (
              <Card key={setor.id} title={setor.nome}>
                <Stack gap={10}>
                  {modulosDoSetor.map((modulo) => {
                    const chave = `${usuarioSelecionado.id}:${modulo.id}`;

                    return (
                      <Checkbox
                        key={modulo.id}
                        label={modulo.nome}
                        hint={modulo.path}
                        checked={Boolean(
                          temPermissao(usuarioSelecionado.id, modulo.id)
                        )}
                        disabled={alterando === chave}
                        onChange={(event) => {
                          if (event.target.checked) {
                            alternar(usuarioSelecionado, modulo, true);
                          } else {
                            setRevogando({ usuario: usuarioSelecionado, modulo });
                          }
                        }}
                      />
                    );
                  })}
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <EmptyState
            icon={<UserRound size={32} />}
            title="Selecione um usuário"
            description="Escolha um usuário na lista ao lado para ver e gerenciar os módulos liberados para ele."
          />
        )}
      </div>

      <ConfirmDialog
        open={revogando !== null}
        title="Revogar acesso?"
        variant="warning"
        message={
          revogando
            ? `${revogando.usuario.nomeExibicao} perde o acesso a "${revogando.modulo.nome}" imediatamente.`
            : ""
        }
        confirmLabel="Revogar"
        loading={revogando ? alterando === `${revogando.usuario.id}:${revogando.modulo.id}` : false}
        onConfirm={async () => {
          if (!revogando) return;
          await alternar(revogando.usuario, revogando.modulo, false);
          setRevogando(null);
        }}
        onClose={() => setRevogando(null)}
      />
    </div>
  );
}
