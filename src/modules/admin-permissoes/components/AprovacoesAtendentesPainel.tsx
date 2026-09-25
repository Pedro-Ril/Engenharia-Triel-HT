"use client";

import { useEffect, useMemo, useState } from "react";
import { Gavel } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Stack } from "@/components/ui/Stack";
import { TIPOS_APROVACAO } from "@/lib/aprovacoes/tipos-aprovacao";

import {
  adicionarAtendenteAprovacao,
  listarAtendentesAprovacoes,
  removerAtendenteAprovacao,
} from "../services/adminPermissoes.service";
import type {
  AprovacaoAtendente,
  PortalModulo,
  PortalPermissao,
  PortalUsuarioAdmin,
} from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

interface AprovacoesAtendentesPainelProps {
  usuarios: PortalUsuarioAdmin[];
  permissoes: PortalPermissao[];
  modulos: PortalModulo[];
  onFeedback: FeedbackHandler;
}

const OPCOES_SIM_NAO = [
  { value: "nao", label: "Não" },
  { value: "sim", label: "Sim" },
];

/*
 * Quem decide as pendências do painel da direção. A resposta é sim/não
 * por tipo de aprovação -- "não" é o padrão, então quem nunca foi
 * marcado simplesmente não aprova nada.
 *
 * A lista só traz quem já pode abrir o Painel de Aprovações: marcar
 * alguém sem acesso ao módulo não faria efeito nenhum.
 */
export function AprovacoesAtendentesPainel({
  usuarios,
  permissoes,
  modulos,
  onFeedback,
}: AprovacoesAtendentesPainelProps) {
  const moduloPainel = modulos.find((modulo) => modulo.chave === "aprovacoes-painel");

  const usuariosComAcesso = useMemo(() => {
    if (!moduloPainel) return [];

    const idsComPermissao = new Set(
      permissoes.filter((p) => p.moduloId === moduloPainel.id).map((p) => p.usuarioId)
    );

    return usuarios
      .filter((usuario) => usuario.ativo && (usuario.ehAdministrador || idsComPermissao.has(usuario.id)))
      .sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao, "pt-BR"));
  }, [usuarios, permissoes, moduloPainel]);

  const [carregando, setCarregando] = useState(true);
  const [atendentes, setAtendentes] = useState<AprovacaoAtendente[]>([]);
  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState<string | null>(null);
  const [alterando, setAlterando] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<{
    usuario: PortalUsuarioAdmin;
    tipo: string;
    tipoLabel: string;
  } | null>(null);

  useEffect(() => {
    listarAtendentesAprovacoes().then((resultado) => {
      if (resultado.ok && resultado.data) setAtendentes(resultado.data);
      setCarregando(false);
    });
  }, []);

  useEffect(() => {
    if (!usuarioSelecionadoId || !usuariosComAcesso.some((u) => u.id === usuarioSelecionadoId)) {
      setUsuarioSelecionadoId(usuariosComAcesso[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuariosComAcesso]);

  function aprova(usuarioId: string, tipo: string) {
    return atendentes.some((item) => item.usuarioId === usuarioId && item.tipo === tipo);
  }

  async function definir(usuario: PortalUsuarioAdmin, tipo: string, aprovar: boolean) {
    const chave = `${usuario.id}:${tipo}`;
    setAlterando(chave);

    try {
      if (aprovar) {
        const resultado = await adicionarAtendenteAprovacao({ usuarioId: usuario.id, tipo });

        if (resultado.ok && resultado.data) {
          setAtendentes((atual) => [...atual, resultado.data as AprovacaoAtendente]);
        } else {
          onFeedback(
            "danger",
            "Não foi possível liberar o aprovador",
            resultado.message ?? "Tente novamente em instantes."
          );
        }
      } else {
        const resultado = await removerAtendenteAprovacao(usuario.id, tipo);

        if (resultado.ok) {
          setAtendentes((atual) =>
            atual.filter((item) => !(item.usuarioId === usuario.id && item.tipo === tipo))
          );
        } else {
          onFeedback(
            "danger",
            "Não foi possível remover o aprovador",
            resultado.message ?? "Tente novamente em instantes."
          );
        }
      }
    } finally {
      setAlterando(null);
    }
  }

  if (carregando) {
    return <Loader label="Carregando aprovadores..." />;
  }

  const usuarioSelecionado = usuariosComAcesso.find((usuario) => usuario.id === usuarioSelecionadoId);

  return (
    <Stack gap={20}>
      <Alert variant="info" title="Como a fila do painel é liberada">
        Só quem estiver com &quot;Sim&quot; abaixo vê e decide as pendências — inclusive administradores,
        que aqui não têm acesso automático. A lista traz apenas quem já tem permissão para o módulo
        &quot;Painel de Aprovações&quot;; para incluir mais alguém, conceda o módulo em Administração →
        Permissões.
      </Alert>

      <Card
        title="Aprovadores"
        description="Defina, por usuário, quais tipos de solicitação ele pode decidir."
      >
        {usuariosComAcesso.length === 0 ? (
          <EmptyState
            icon={<Gavel size={28} />}
            title="Nenhum usuário com acesso ao Painel de Aprovações"
            description="Conceda o módulo Painel de Aprovações em Administração → Permissões para que o usuário apareça aqui."
          />
        ) : (
          <div className={styles.painelPermissoes}>
            <div className={styles.listaUsuarios}>
              {usuariosComAcesso.map((usuario) => {
                const total = atendentes.filter((item) => item.usuarioId === usuario.id).length;

                return (
                  <button
                    key={usuario.id}
                    type="button"
                    className={`${styles.usuarioItem} ${
                      usuario.id === usuarioSelecionadoId ? styles.usuarioItemAtivo : ""
                    }`}
                    onClick={() => setUsuarioSelecionadoId(usuario.id)}
                  >
                    <span className={styles.usuarioItemNome}>{usuario.nomeExibicao}</span>
                    <Badge variant={total > 0 ? "primary" : "neutral"}>{total}</Badge>
                  </button>
                );
              })}
            </div>

            <div className={styles.painelPermissoesConteudo}>
              {usuarioSelecionado && (
                <Stack gap={20}>
                  <p className={styles.usuarioSub}>
                    O que <strong>{usuarioSelecionado.nomeExibicao}</strong> aprova
                  </p>

                  {TIPOS_APROVACAO.map((tipo) => {
                    const marcado = aprova(usuarioSelecionado.id, tipo.valor);
                    const chave = `${usuarioSelecionado.id}:${tipo.valor}`;

                    return (
                      <Stack key={tipo.valor} gap={8}>
                        <div>
                          <strong>{tipo.label}</strong>
                          <p className={styles.usuarioSub}>{tipo.descricao}</p>
                        </div>

                        <RadioGroup
                          name={chave}
                          orientation="horizontal"
                          options={OPCOES_SIM_NAO}
                          value={marcado ? "sim" : "nao"}
                          disabled={alterando === chave}
                          onValueChange={(valor) => {
                            if (valor === "sim") {
                              definir(usuarioSelecionado, tipo.valor, true);
                            } else if (marcado) {
                              setRemovendo({
                                usuario: usuarioSelecionado,
                                tipo: tipo.valor,
                                tipoLabel: tipo.label,
                              });
                            }
                          }}
                        />
                      </Stack>
                    );
                  })}
                </Stack>
              )}
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={removendo !== null}
        title="Remover aprovador?"
        variant="warning"
        message={
          removendo
            ? `${removendo.usuario.nomeExibicao} deixa de ver e decidir as solicitações de ${removendo.tipoLabel}.`
            : ""
        }
        confirmLabel="Remover"
        loading={removendo ? alterando === `${removendo.usuario.id}:${removendo.tipo}` : false}
        onConfirm={async () => {
          if (!removendo) return;
          await definir(removendo.usuario, removendo.tipo, false);
          setRemovendo(null);
        }}
        onClose={() => setRemovendo(null)}
      />
    </Stack>
  );
}
