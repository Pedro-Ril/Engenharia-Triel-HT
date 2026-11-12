"use client";

import { useState } from "react";
import { Copy, Search, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Stack } from "@/components/ui/Stack";

import type { PortalModulo, PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import { moduloCombinaBusca } from "../utils/permissoesFiltros";
import styles from "./AdminPermissoes.module.css";
import { CopiarAcessosModal } from "./CopiarAcessosModal";
import { FiltrosUsuarios, rotuloDepartamento, useFiltroUsuarios } from "./FiltrosUsuarios";
import type { OperacoesPermissoes, ParPermissao, SetorComModulos } from "./PermissoesPainel";

interface PermissoesPorUsuarioProps {
  usuarios: PortalUsuarioAdmin[];
  setoresComModulos: SetorComModulos[];
  totalModulos: number;
  totalPorUsuario: Map<string, number>;
  operacoes: OperacoesPermissoes;
}

interface Revogacao {
  pares: ParPermissao[];
  titulo: string;
  mensagem: string;
  resumo?: (quantidade: number) => string;
}

function plural(quantidade: number, singular: string, pluralTexto: string) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralTexto}`;
}

export function PermissoesPorUsuario({
  usuarios,
  setoresComModulos,
  totalModulos,
  totalPorUsuario,
  operacoes,
}: PermissoesPorUsuarioProps) {
  const filtro = useFiltroUsuarios(usuarios, totalPorUsuario);

  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState<string | null>(null);
  const [buscaModulo, setBuscaModulo] = useState("");
  const [revogando, setRevogando] = useState<Revogacao | null>(null);
  const [confirmandoRevogacao, setConfirmandoRevogacao] = useState(false);
  const [copiando, setCopiando] = useState(false);

  /* Se o usuário for desativado na aba Usuários, a seleção some sozinha. */
  const usuarioSelecionado = usuarios.find((usuario) => usuario.id === usuarioSelecionadoId) ?? null;

  const setoresVisiveis = setoresComModulos
    .map((grupo) => ({ ...grupo, modulos: grupo.modulos.filter((modulo) => moduloCombinaBusca(modulo, buscaModulo)) }))
    .filter((grupo) => grupo.modulos.length > 0);

  function modulosDoUsuario(usuarioId: string): PortalModulo[] {
    const vistos = new Set<string>();
    const resultado: PortalModulo[] = [];

    for (const { modulos } of setoresComModulos) {
      for (const modulo of modulos) {
        if (!vistos.has(modulo.id) && operacoes.permissaoDe(usuarioId, modulo.id)) {
          vistos.add(modulo.id);
          resultado.push(modulo);
        }
      }
    }

    return resultado;
  }

  async function confirmarRevogacao() {
    if (!revogando) return;

    setConfirmandoRevogacao(true);
    try {
      await operacoes.revogar(revogando.pares, revogando.resumo);
      setRevogando(null);
    } finally {
      setConfirmandoRevogacao(false);
    }
  }

  return (
    <div className={styles.permissoesGrade}>
      <aside className={styles.colunaSelecao}>
        <FiltrosUsuarios filtro={filtro} mostrarAcesso />

        <span className={styles.contadorLista}>
          {filtro.filtrados.length === usuarios.length
            ? plural(usuarios.length, "usuário", "usuários")
            : `${filtro.filtrados.length} de ${usuarios.length} usuários`}
        </span>

        <nav className={styles.listaRolavel} aria-label="Selecionar usuário">
          {filtro.filtrados.map((usuario) => {
            const ativo = usuario.id === usuarioSelecionadoId;

            return (
              <button
                key={usuario.id}
                type="button"
                className={`${styles.usuarioItem} ${ativo ? styles.usuarioItemAtivo : ""}`}
                aria-current={ativo ? "true" : undefined}
                onClick={() => setUsuarioSelecionadoId(usuario.id)}
              >
                <span className={styles.itemTexto}>
                  <span className={styles.usuarioItemNome}>{usuario.nomeExibicao}</span>
                  <span className={styles.itemSub}>
                    {rotuloDepartamento(usuario.departamento)} · {usuario.samAccountName}
                  </span>
                </span>

                <Badge variant={ativo ? "primary" : "neutral"}>{totalPorUsuario.get(usuario.id) ?? 0}</Badge>
              </button>
            );
          })}

          {filtro.filtrados.length === 0 && <p className={styles.semResultado}>Nenhum usuário encontrado.</p>}
        </nav>
      </aside>

      <div className={styles.painelPermissoesConteudo}>
        {usuarioSelecionado ? (
          <Stack gap={16}>
            <Card
              title={usuarioSelecionado.nomeExibicao}
              description={[
                rotuloDepartamento(usuarioSelecionado.departamento),
                usuarioSelecionado.samAccountName,
                usuarioSelecionado.email,
              ]
                .filter(Boolean)
                .join(" · ")}
              actions={
                <Stack direction="row" gap={10} align="center">
                  <Badge variant="primary">
                    {totalPorUsuario.get(usuarioSelecionado.id) ?? 0} de {totalModulos} módulos
                  </Badge>

                  <Button variant="secondary" onClick={() => setCopiando(true)}>
                    <Copy size={14} />
                    Copiar acessos de...
                  </Button>
                </Stack>
              }
            >
              <Input
                type="search"
                aria-label="Filtrar módulos"
                placeholder="Filtrar módulos por nome ou endereço"
                value={buscaModulo}
                onChange={(event) => setBuscaModulo(event.target.value)}
              />
            </Card>

            {setoresVisiveis.map(({ setor, modulos }) => {
              const marcados = modulos.filter((modulo) => operacoes.permissaoDe(usuarioSelecionado.id, modulo.id));
              const ocupado = modulos.some((modulo) => operacoes.emAndamento(usuarioSelecionado.id, modulo.id));
              const pares = (lista: PortalModulo[]) => lista.map((modulo) => ({ usuario: usuarioSelecionado, modulo }));

              return (
                <Card
                  key={setor.id}
                  title={setor.nome}
                  actions={
                    <Stack direction="row" gap={4} align="center">
                      <button
                        type="button"
                        className={styles.acaoLink}
                        disabled={ocupado || marcados.length === modulos.length}
                        onClick={() =>
                          operacoes.conceder(
                            pares(modulos),
                            (quantidade) =>
                              `${usuarioSelecionado.nomeExibicao} recebeu acesso a ${plural(quantidade, "módulo", "módulos")} de "${setor.nome}".`
                          )
                        }
                      >
                        Marcar todos
                      </button>

                      <button
                        type="button"
                        className={styles.acaoLink}
                        disabled={ocupado || marcados.length === 0}
                        onClick={() =>
                          setRevogando({
                            pares: pares(marcados),
                            titulo: "Desmarcar o setor inteiro?",
                            mensagem: `${usuarioSelecionado.nomeExibicao} perde o acesso a ${plural(marcados.length, "módulo", "módulos")} de "${setor.nome}" imediatamente.`,
                            resumo: (quantidade) =>
                              `${usuarioSelecionado.nomeExibicao} perdeu o acesso a ${plural(quantidade, "módulo", "módulos")} de "${setor.nome}".`,
                          })
                        }
                      >
                        Desmarcar todos
                      </button>
                    </Stack>
                  }
                >
                  <Stack gap={10}>
                    {modulos.map((modulo) => (
                      <Checkbox
                        key={modulo.id}
                        label={modulo.nome}
                        hint={modulo.path}
                        checked={Boolean(operacoes.permissaoDe(usuarioSelecionado.id, modulo.id))}
                        disabled={operacoes.emAndamento(usuarioSelecionado.id, modulo.id)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            operacoes.conceder([{ usuario: usuarioSelecionado, modulo }]);
                          } else {
                            setRevogando({
                              pares: [{ usuario: usuarioSelecionado, modulo }],
                              titulo: "Revogar acesso?",
                              mensagem: `${usuarioSelecionado.nomeExibicao} perde o acesso a "${modulo.nome}" imediatamente.`,
                            });
                          }
                        }}
                      />
                    ))}
                  </Stack>
                </Card>
              );
            })}

            {setoresVisiveis.length === 0 && (
              <Card>
                <EmptyState
                  icon={<Search size={28} />}
                  title="Nenhum módulo encontrado"
                  description="Tente outra palavra no filtro de módulos."
                />
              </Card>
            )}
          </Stack>
        ) : (
          <Card>
            <EmptyState
              icon={<UserRound size={32} />}
              title="Selecione um usuário"
              description="Busque pelo nome, login ou departamento na lista ao lado para ver e gerenciar os módulos liberados."
            />
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={revogando !== null}
        title={revogando?.titulo ?? ""}
        variant="warning"
        message={revogando?.mensagem ?? ""}
        confirmLabel="Revogar"
        loading={confirmandoRevogacao}
        onConfirm={confirmarRevogacao}
        onClose={() => {
          if (!confirmandoRevogacao) setRevogando(null);
        }}
      />

      {copiando && usuarioSelecionado && (
        <CopiarAcessosModal
          destino={usuarioSelecionado}
          usuarios={usuarios}
          totalPorUsuario={totalPorUsuario}
          modulosDoUsuario={modulosDoUsuario}
          onConfirmar={async (origem, modulos) => {
            await operacoes.conceder(
              modulos.map((modulo) => ({ usuario: usuarioSelecionado, modulo })),
              (quantidade) =>
                `${usuarioSelecionado.nomeExibicao} recebeu ${plural(quantidade, "acesso copiado", "acessos copiados")} de ${origem.nomeExibicao}.`
            );
            setCopiando(false);
          }}
          onClose={() => setCopiando(false)}
        />
      )}
    </div>
  );
}
