"use client";

import { useEffect, useMemo, useState } from "react";
import { ShoppingCart } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { EMPRESAS_PEDIDO_COMPRA } from "@/lib/aprovacoes/empresas-pedido-compra";

import {
  listarAtendentesAprovacoes,
  listarEscopoEmpresasPedidosCompra,
  salvarEmpresasAprovadorPedidosCompra,
} from "../services/adminPermissoes.service";
import type { PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AdminPermissoes.module.css";

interface AprovacoesPedidosCompraPainelProps {
  usuarios: PortalUsuarioAdmin[];
  onFeedback: FeedbackHandler;
}

/*
 * Escopo dos pedidos de compra, no mesmo lugar do escopo do Reajuste
 * Salarial: de quais empresas cada diretor recebe pedido. Quem é
 * diretor de pedido de compra continua sendo o Sim/Não da aba
 * Aprovadores; a integração (ERP e chave do SupriConnect) fica em
 * Configurações → Pedidos de Compra.
 */
export function AprovacoesPedidosCompraPainel({ usuarios, onFeedback }: AprovacoesPedidosCompraPainelProps) {
  const [carregando, setCarregando] = useState(true);
  const [aprovadorIds, setAprovadorIds] = useState<string[]>([]);
  const [empresasPorUsuario, setEmpresasPorUsuario] = useState<Record<string, number[]>>({});
  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState<string | null>(null);
  const [salvandoEmpresa, setSalvandoEmpresa] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarAtendentesAprovacoes(), listarEscopoEmpresasPedidosCompra()]).then(
      ([atendentes, escopo]) => {
        if (atendentes.ok && atendentes.data) {
          setAprovadorIds(
            atendentes.data.filter((item) => item.tipo === "pedido_compra").map((item) => item.usuarioId)
          );
        }

        if (escopo.ok && escopo.data) {
          setEmpresasPorUsuario(
            Object.fromEntries(escopo.data.map((item) => [item.usuarioId, item.empresas]))
          );
        }

        setCarregando(false);
      }
    );
  }, []);

  const aprovadores = useMemo(
    () =>
      usuarios
        .filter((usuario) => usuario.ativo && aprovadorIds.includes(usuario.id))
        .sort((a, b) => a.nomeExibicao.localeCompare(b.nomeExibicao, "pt-BR")),
    [usuarios, aprovadorIds]
  );

  /* Sem seleção (ou a selecionada saiu da lista), fica com o primeiro. */
  const selecionado =
    aprovadores.find((usuario) => usuario.id === usuarioSelecionadoId) ?? aprovadores[0] ?? null;

  async function alternarEmpresa(usuario: PortalUsuarioAdmin, codigo: number, marcar: boolean) {
    const atuais = empresasPorUsuario[usuario.id] ?? [];
    const novas = marcar ? [...atuais, codigo] : atuais.filter((empresa) => empresa !== codigo);

    setSalvandoEmpresa(`${usuario.id}:${codigo}`);

    try {
      const resultado = await salvarEmpresasAprovadorPedidosCompra(usuario.id, novas);

      if (resultado.ok && resultado.data) {
        setEmpresasPorUsuario((atual) => ({ ...atual, [usuario.id]: resultado.data!.empresas }));
      } else {
        onFeedback(
          "danger",
          "Não foi possível salvar as empresas",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvandoEmpresa(null);
    }
  }

  if (carregando) {
    return <Loader label="Carregando pedidos de compra..." />;
  }

  const empresasDoSelecionado = selecionado ? (empresasPorUsuario[selecionado.id] ?? []) : [];

  return (
    <Stack gap={20}>
      <Alert variant="info" title="Como o pedido chega ao diretor">
        O comprador manda os pedidos pelo SupriConnect, escolhendo ou não um diretor. Só recebe pedido
        quem está com &quot;Sim&quot; em Pedidos de Compra na aba Aprovadores <strong>e</strong> tem a
        empresa do pedido marcada abaixo — diretor sem empresa marcada não recebe nada.
      </Alert>

      <Card
        title="Empresas por diretor"
        description="De quais empresas do Focco cada diretor aprova pedidos de compra."
      >
        {aprovadores.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart size={28} />}
            title="Nenhum aprovador de pedidos de compra"
            description="Marque &quot;Sim&quot; em Pedidos de Compra na aba Aprovadores para o diretor aparecer aqui."
          />
        ) : (
          <div className={styles.painelPermissoes}>
            <div className={styles.listaUsuarios}>
              {aprovadores.map((usuario) => {
                const total = (empresasPorUsuario[usuario.id] ?? []).length;

                return (
                  <button
                    key={usuario.id}
                    type="button"
                    className={`${styles.usuarioItem} ${
                      usuario.id === selecionado?.id ? styles.usuarioItemAtivo : ""
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
              {selecionado && (
                <Stack gap={16}>
                  <p className={styles.usuarioSub}>
                    Empresas que <strong>{selecionado.nomeExibicao}</strong> aprova
                  </p>

                  {EMPRESAS_PEDIDO_COMPRA.map((empresa) => {
                    const chave = `${selecionado.id}:${empresa.codigo}`;

                    return (
                      <Checkbox
                        key={chave}
                        label={empresa.nome}
                        hint={`Código ${empresa.codigo} no Focco`}
                        checked={empresasDoSelecionado.includes(empresa.codigo)}
                        disabled={salvandoEmpresa === chave}
                        onChange={(evento) => alternarEmpresa(selecionado, empresa.codigo, evento.target.checked)}
                      />
                    );
                  })}
                </Stack>
              )}
            </div>
          </div>
        )}
      </Card>
    </Stack>
  );
}
