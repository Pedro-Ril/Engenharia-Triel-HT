"use client";

import { Badge } from "@/components/ui/Badge";
import {
  iconeTipoAprovacao,
  rotuloTipoAprovacao,
  type TipoAprovacao,
} from "@/lib/aprovacoes/tipos-aprovacao";
import { resolverIcone } from "@/lib/icons/icon-registry";

import styles from "./AbasTipoAprovacao.module.css";

interface AbasTipoAprovacaoProps {
  tipos: TipoAprovacao[];
  ativo: string;
  onSelecionar: (tipo: TipoAprovacao) => void;
  /* Quantos itens de cada tipo pedem atenção -- vira o badge da aba. */
  contagem?: Record<string, number>;
  rotuloAcessivel?: string;
}

/*
 * Seleção do módulo (tipo de aprovação), compartilhada pelo Painel de
 * Aprovações e por Minhas Solicitações.
 *
 * Estilo sublinhado de propósito: nas duas telas existe logo abaixo uma
 * barra de pílulas (visão/filtros), e duas barras idênticas empilhadas
 * apagariam a hierarquia entre "qual módulo" e "como olhar". Não usa o
 * componente Tabs porque a API dele exige o conteúdo de cada aba dentro
 * do item, o que obrigaria a mover o corpo inteiro da tela pra dentro.
 */
export function AbasTipoAprovacao({
  tipos,
  ativo,
  onSelecionar,
  contagem,
  rotuloAcessivel = "Tipo de aprovação",
}: AbasTipoAprovacaoProps) {
  if (tipos.length === 0) return null;

  return (
    <div className={styles.abas} role="tablist" aria-label={rotuloAcessivel}>
      {tipos.map((tipo) => {
        const Icone = resolverIcone(iconeTipoAprovacao(tipo));
        const selecionada = ativo === tipo;
        const total = contagem?.[tipo] ?? 0;

        return (
          <button
            key={tipo}
            type="button"
            role="tab"
            aria-selected={selecionada}
            className={`${styles.aba} ${selecionada ? styles.abaAtiva : ""}`}
            onClick={() => onSelecionar(tipo)}
          >
            <Icone size={16} />
            {rotuloTipoAprovacao(tipo)}
            {total > 0 && <Badge variant="warning">{total}</Badge>}
          </button>
        );
      })}
    </div>
  );
}
