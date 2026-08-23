"use client";

import { useState } from "react";
import { Download, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
  importarUsuariosAd,
} from "../services/adminPermissoes.service";
import type { PortalPermissao, PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

interface UsuariosPainelProps {
  usuarios: PortalUsuarioAdmin[];
  permissoes: PortalPermissao[];
  onUsuarioAtualizado: (usuario: PortalUsuarioAdmin) => void;
  onUsuarioExcluido: (usuarioId: string) => void;
  onUsuariosImportados: (usuarios: PortalUsuarioAdmin[]) => void;
  onFeedback: FeedbackHandler;
}

export function UsuariosPainel({
  usuarios,
  permissoes,
  onUsuarioAtualizado,
  onUsuarioExcluido,
  onUsuariosImportados,
  onFeedback,
}: UsuariosPainelProps) {
  const [codigosEmEdicao, setCodigosEmEdicao] = useState<
    Record<string, string>
  >({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [usuarioExcluindo, setUsuarioExcluindo] =
    useState<PortalUsuarioAdmin | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [importando, setImportando] = useState(false);
  const [confirmandoImportar, setConfirmandoImportar] = useState(false);

  async function handleImportarAd() {
    setConfirmandoImportar(false);
    setImportando(true);

    try {
      const resultado = await importarUsuariosAd();

      if (resultado.ok && resultado.data) {
        onUsuariosImportados(resultado.data.usuarios);
        onFeedback(
          "success",
          "Importação concluída",
          resultado.message ?? "Usuários importados do Active Directory."
        );
      } else {
        onFeedback(
          "danger",
          "Não foi possível importar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setImportando(false);
    }
  }

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

  const botaoImportar = (
    <Stack direction="row" justify="end">
      <Button
        variant="secondary"
        onClick={() => setConfirmandoImportar(true)}
        loading={importando}
      >
        <Download size={16} />
        Importar do AD
      </Button>
    </Stack>
  );

  if (usuarios.length === 0) {
    return (
      <Stack gap={16}>
        {botaoImportar}

        <p>
          Nenhum usuário logou no portal ainda ou foi importado do AD. Use o
          botão acima para trazer os usuários do grupo configurado.
        </p>
      </Stack>
    );
  }

  return (
    <Stack gap={16}>
      {botaoImportar}

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
            Tem certeza que deseja excluir <strong>{usuarioExcluindo?.nomeExibicao}</strong>?{" "}
            {(() => {
              const total = usuarioExcluindo
                ? permissoes.filter((p) => p.usuarioId === usuarioExcluindo.id).length
                : 0;
              return total > 0
                ? `${total} permissão(ões) concedida(s) a essa pessoa serão revogadas.`
                : "Essa pessoa não tem nenhuma permissão individual concedida.";
            })()}{" "}
            Se a pessoa logar de novo, o cadastro é recriado do zero (sem as permissões atuais).
          </>
        }
        confirmLabel="Excluir"
        variant="danger"
        loading={confirmandoExclusao}
        onClose={() => setUsuarioExcluindo(null)}
        onConfirm={handleConfirmarExclusao}
      />

      <ConfirmDialog
        open={confirmandoImportar}
        title="Importar usuários do AD?"
        message="Isso atualiza nome, e-mail e status de administrador de todo usuário já cadastrado que também existir no grupo do Active Directory, além de trazer usuários novos."
        confirmLabel="Importar"
        loading={importando}
        onClose={() => setConfirmandoImportar(false)}
        onConfirm={handleImportarAd}
      />
    </Stack>
  );
}
