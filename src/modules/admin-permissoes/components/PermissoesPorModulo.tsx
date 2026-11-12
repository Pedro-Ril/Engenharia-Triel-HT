"use client";

import { Fragment, useState } from "react";
import { LayoutGrid, UserPlus, Users, X } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import type { PortalModulo, PortalSetor, PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import { moduloCombinaBusca, usuarioCombinaBusca } from "../utils/permissoesFiltros";
import styles from "./AdminPermissoes.module.css";
import { AdicionarPessoasModal } from "./AdicionarPessoasModal";
import { rotuloDepartamento } from "./FiltrosUsuarios";
import type { OperacoesPermissoes, ParPermissao, SetorComModulos } from "./PermissoesPainel";

interface PermissoesPorModuloProps {
  usuarios: PortalUsuarioAdmin[];
  setores: PortalSetor[];
  setoresComModulos: SetorComModulos[];
  totalPorUsuario: Map<string, number>;
  totalPorModulo: Map<string, number>;
  operacoes: OperacoesPermissoes;
}

function formatarData(iso: string) {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "—" : data.toLocaleDateString("pt-BR");
}

export function PermissoesPorModulo({
  usuarios,
  setores,
  setoresComModulos,
  totalPorUsuario,
  totalPorModulo,
  operacoes,
}: PermissoesPorModuloProps) {
  const [moduloSelecionadoId, setModuloSelecionadoId] = useState<string | null>(null);
  const [buscaModulo, setBuscaModulo] = useState("");
  const [buscaPessoa, setBuscaPessoa] = useState("");
  const [removendo, setRemovendo] = useState<ParPermissao | null>(null);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  /* Um módulo ligado a dois setores aparece uma vez só, no primeiro. */
  const vistos = new Set<string>();
  const grupos = setoresComModulos
    .map(({ setor, modulos }) => ({
      setor,
      modulos: modulos.filter((modulo) => {
        if (vistos.has(modulo.id)) return false;
        vistos.add(modulo.id);
        return true;
      }),
    }))
    .filter((grupo) => grupo.modulos.length > 0);

  const gruposVisiveis = grupos
    .map((grupo) => ({ ...grupo, modulos: grupo.modulos.filter((modulo) => moduloCombinaBusca(modulo, buscaModulo)) }))
    .filter((grupo) => grupo.modulos.length > 0);

  const modulo: PortalModulo | null =
    grupos.flatMap((grupo) => grupo.modulos).find((item) => item.id === moduloSelecionadoId) ?? null;

  const comAcesso = modulo ? usuarios.filter((usuario) => operacoes.permissaoDe(usuario.id, modulo.id)) : [];
  const semAcesso = modulo ? usuarios.filter((usuario) => !operacoes.permissaoDe(usuario.id, modulo.id)) : [];
  const comAcessoVisiveis = comAcesso.filter((usuario) => usuarioCombinaBusca(usuario, buscaPessoa));

  const nomesSetores = modulo
    ? setores.filter((setor) => modulo.setorIds.includes(setor.id)).map((setor) => setor.nome).join(", ")
    : "";

  function selecionarModulo(id: string) {
    setModuloSelecionadoId(id);
    setBuscaPessoa("");
  }

  async function confirmarRemocao() {
    if (!removendo) return;

    setConfirmandoRemocao(true);
    try {
      await operacoes.revogar([removendo]);
      setRemovendo(null);
    } finally {
      setConfirmandoRemocao(false);
    }
  }

  return (
    <div className={styles.permissoesGrade}>
      <aside className={styles.colunaSelecao}>
        <Input
          type="search"
          aria-label="Buscar módulo"
          placeholder="Buscar módulo por nome ou endereço"
          value={buscaModulo}
          onChange={(event) => setBuscaModulo(event.target.value)}
        />

        <nav className={styles.listaRolavel} aria-label="Selecionar módulo">
          {gruposVisiveis.map(({ setor, modulos }) => (
            <Fragment key={setor.id}>
              <span className={styles.listaGrupoTitulo}>{setor.nome}</span>

              {modulos.map((item) => {
                const ativo = item.id === moduloSelecionadoId;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.usuarioItem} ${ativo ? styles.usuarioItemAtivo : ""}`}
                    aria-current={ativo ? "true" : undefined}
                    onClick={() => selecionarModulo(item.id)}
                  >
                    <span className={styles.itemTexto}>
                      <span className={styles.usuarioItemNome}>{item.nome}</span>
                      <span className={styles.itemSub}>{item.path}</span>
                    </span>

                    <Badge variant={ativo ? "primary" : "neutral"}>{totalPorModulo.get(item.id) ?? 0}</Badge>
                  </button>
                );
              })}
            </Fragment>
          ))}

          {gruposVisiveis.length === 0 && <p className={styles.semResultado}>Nenhum módulo encontrado.</p>}
        </nav>
      </aside>

      <div className={styles.painelPermissoesConteudo}>
        {modulo ? (
          <Card
            title={modulo.nome}
            description={`${modulo.path} · ${nomesSetores}. Administradores têm acesso a tudo e não aparecem aqui.`}
            actions={
              <Button onClick={() => setAdicionando(true)} disabled={semAcesso.length === 0}>
                <UserPlus size={15} />
                Adicionar pessoas
              </Button>
            }
          >
            {comAcesso.length === 0 ? (
              <EmptyState
                icon={<Users size={30} />}
                title="Ninguém tem acesso a este módulo"
                description='Use "Adicionar pessoas" para liberar o acesso a quem precisa.'
              />
            ) : (
              <Stack gap={16}>
                <Stack direction="row" gap={12} align="center" justify="between">
                  <span className={styles.contadorLista}>
                    {comAcesso.length} {comAcesso.length === 1 ? "pessoa com acesso" : "pessoas com acesso"}
                  </span>

                  {comAcesso.length > 8 && (
                    <div className={styles.filtroPessoas}>
                      <Input
                        type="search"
                        aria-label="Filtrar pessoas com acesso"
                        placeholder="Filtrar por nome ou departamento"
                        value={buscaPessoa}
                        onChange={(event) => setBuscaPessoa(event.target.value)}
                      />
                    </div>
                  )}
                </Stack>

                <Table minWidth={620}>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Pessoa</TableHeaderCell>
                      <TableHeaderCell>Departamento</TableHeaderCell>
                      <TableHeaderCell>Liberado em</TableHeaderCell>
                      <TableHeaderCell align="center">Remover</TableHeaderCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {comAcessoVisiveis.map((usuario) => {
                      const permissao = operacoes.permissaoDe(usuario.id, modulo.id);

                      return (
                        <TableRow key={usuario.id}>
                          <TableCell>
                            <strong>{usuario.nomeExibicao}</strong>
                            <div className={styles.usuarioSub}>{usuario.samAccountName}</div>
                          </TableCell>

                          <TableCell>{rotuloDepartamento(usuario.departamento)}</TableCell>

                          <TableCell>
                            {permissao ? formatarData(permissao.concedidoEm) : "—"}
                            {permissao?.concedidoPor && (
                              <div className={styles.usuarioSub}>por {permissao.concedidoPor}</div>
                            )}
                          </TableCell>

                          <TableCell align="center">
                            <IconButton
                              icon={<X size={15} />}
                              label={`Remover o acesso de ${usuario.nomeExibicao}`}
                              variant="danger"
                              size="small"
                              loading={operacoes.emAndamento(usuario.id, modulo.id)}
                              onClick={() => setRemovendo({ usuario, modulo })}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {comAcessoVisiveis.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <p className={styles.semResultado}>Ninguém encontrado com esse filtro.</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Stack>
            )}
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={<LayoutGrid size={32} />}
              title="Selecione um módulo"
              description="Escolha um módulo na lista ao lado para ver quem tem acesso e liberar para várias pessoas de uma vez."
            />
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={removendo !== null}
        title="Revogar acesso?"
        variant="warning"
        message={
          removendo ? `${removendo.usuario.nomeExibicao} perde o acesso a "${removendo.modulo.nome}" imediatamente.` : ""
        }
        confirmLabel="Revogar"
        loading={confirmandoRemocao}
        onConfirm={confirmarRemocao}
        onClose={() => {
          if (!confirmandoRemocao) setRemovendo(null);
        }}
      />

      {adicionando && modulo && (
        <AdicionarPessoasModal
          modulo={modulo}
          candidatos={semAcesso}
          totalPorUsuario={totalPorUsuario}
          onConfirmar={async (selecionados) => {
            await operacoes.conceder(
              selecionados.map((usuario) => ({ usuario, modulo })),
              (quantidade) =>
                `${quantidade} ${quantidade === 1 ? "pessoa recebeu" : "pessoas receberam"} acesso a "${modulo.nome}".`
            );
            setAdicionando(false);
          }}
          onClose={() => setAdicionando(false)}
        />
      )}
    </div>
  );
}
