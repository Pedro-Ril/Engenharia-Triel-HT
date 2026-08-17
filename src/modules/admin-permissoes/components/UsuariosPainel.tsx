"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
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
  atualizarUsuario,
  excluirUsuario,
} from "../services/adminPermissoes.service";
import type { PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

interface UsuariosPainelProps {
  usuarios: PortalUsuarioAdmin[];
  onUsuarioAtualizado: (usuario: PortalUsuarioAdmin) => void;
  onUsuarioExcluido: (usuarioId: string) => void;
  onFeedback: FeedbackHandler;
}

export function UsuariosPainel({
  usuarios,
  onUsuarioAtualizado,
  onUsuarioExcluido,
  onFeedback,
}: UsuariosPainelProps) {
  const [codigosEmEdicao, setCodigosEmEdicao] = useState<
    Record<string, string>
  >({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [usuarioExcluindo, setUsuarioExcluindo] =
    useState<PortalUsuarioAdmin | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  async function salvarCodigoEmpresa(usuario: PortalUsuarioAdmin) {
    const codigo = codigosEmEdicao[usuario.id];
    if (codigo === undefined) return;

    setSalvandoId(usuario.id);

    try {
      const resultado = await atualizarUsuario(usuario.id, {
        codigoEmpresa: codigo.trim() || null,
        ativo: usuario.ativo,
      });

      if (resultado.ok && resultado.data) {
        onUsuarioAtualizado(resultado.data);
        setCodigosEmEdicao((atual) => {
          const proximo = { ...atual };
          delete proximo[usuario.id];
          return proximo;
        });
      } else {
        onFeedback(
          "danger",
          "Não foi possível salvar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvandoId(null);
    }
  }

  async function alternarAtivo(usuario: PortalUsuarioAdmin, ativo: boolean) {
    setSalvandoId(usuario.id);

    try {
      const resultado = await atualizarUsuario(usuario.id, {
        codigoEmpresa: usuario.codigoEmpresa,
        ativo,
      });

      if (resultado.ok && resultado.data) {
        onUsuarioAtualizado(resultado.data);
        onFeedback(
          "success",
          ativo ? "Usuário reativado" : "Usuário desativado",
          `${usuario.nomeExibicao} foi ${ativo ? "reativado" : "desativado"} com sucesso.`
        );
      } else {
        onFeedback(
          "danger",
          "Não foi possível atualizar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvandoId(null);
    }
  }

  async function handleConfirmarExclusao() {
    if (!usuarioExcluindo) return;

    setConfirmandoExclusao(true);

    try {
      const resultado = await excluirUsuario(usuarioExcluindo.id);

      if (resultado.ok) {
        onUsuarioExcluido(usuarioExcluindo.id);
        onFeedback(
          "success",
          "Usuário excluído",
          `"${usuarioExcluindo.nomeExibicao}" foi removido do portal.`
        );
        setUsuarioExcluindo(null);
      } else {
        onFeedback(
          "danger",
          "Não foi possível excluir o usuário",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setConfirmandoExclusao(false);
    }
  }

  if (usuarios.length === 0) {
    return (
      <p>
        Nenhum usuário logou no portal ainda. Assim que alguém entrar com o
        usuário de rede, ele aparece aqui.
      </p>
    );
  }

  return (
    <>
      <Table minWidth={900}>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Usuário</TableHeaderCell>
            <TableHeaderCell>E-mail</TableHeaderCell>
            <TableHeaderCell>Código de empresa</TableHeaderCell>
            <TableHeaderCell>Perfil</TableHeaderCell>
            <TableHeaderCell align="center">Ativo</TableHeaderCell>
            <TableHeaderCell align="center">Ações</TableHeaderCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {usuarios.map((usuario) => {
            const codigoAtual =
              codigosEmEdicao[usuario.id] ?? usuario.codigoEmpresa ?? "";

            return (
              <TableRow key={usuario.id}>
                <TableCell>
                  <strong>{usuario.nomeExibicao}</strong>
                  <div className={styles.usuarioSub}>
                    {usuario.samAccountName}
                  </div>
                </TableCell>

                <TableCell>{usuario.email ?? "—"}</TableCell>

                <TableCell>
                  <Input
                    className={styles.codigoInput}
                    value={codigoAtual}
                    placeholder="ex: 01"
                    onChange={(event) =>
                      setCodigosEmEdicao((atual) => ({
                        ...atual,
                        [usuario.id]: event.target.value,
                      }))
                    }
                    onBlur={() => {
                      if (codigosEmEdicao[usuario.id] !== undefined) {
                        salvarCodigoEmpresa(usuario);
                      }
                    }}
                    disabled={salvandoId === usuario.id}
                  />
                </TableCell>

                <TableCell>
                  {usuario.ehAdministrador ? (
                    <Badge variant="info">Administrador</Badge>
                  ) : (
                    <Badge variant="neutral">Usuário</Badge>
                  )}
                </TableCell>

                <TableCell align="center">
                  <div className={styles.checkboxCentro}>
                    <Switch
                      label=""
                      compact
                      checked={usuario.ativo}
                      disabled={salvandoId === usuario.id}
                      onChange={(event) =>
                        alternarAtivo(usuario, event.target.checked)
                      }
                    />
                  </div>
                </TableCell>

                <TableCell align="center">
                  <Stack direction="row" justify="center">
                    <IconButton
                      icon={<Trash2 size={15} />}
                      label="Excluir usuário"
                      size="small"
                      variant="danger"
                      onClick={() => setUsuarioExcluindo(usuario)}
                    />
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={usuarioExcluindo !== null}
        title="Excluir usuário"
        message={
          <>
            Tem certeza que deseja excluir <strong>{usuarioExcluindo?.nomeExibicao}</strong>?
            As permissões dele serão revogadas. Se a pessoa logar de novo, o
            cadastro é recriado do zero (sem as permissões atuais).
          </>
        }
        confirmLabel="Excluir"
        variant="danger"
        loading={confirmandoExclusao}
        onClose={() => setUsuarioExcluindo(null)}
        onConfirm={handleConfirmarExclusao}
      />
    </>
  );
}
