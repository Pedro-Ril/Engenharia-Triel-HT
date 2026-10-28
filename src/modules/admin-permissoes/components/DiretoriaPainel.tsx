"use client";

import { useState } from "react";
import { GitBranch, Settings, ShieldCheck } from "lucide-react";

import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Tabs } from "@/components/ui/Tabs";

import type { PortalModulo, PortalPermissao, PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import { AlcadasPainel } from "./AlcadasPainel";
import { AprovacoesConfigPainel } from "./AprovacoesConfigPainel";
import { AprovacoesEscopoPainel } from "./AprovacoesEscopoPainel";
import { AprovacoesPedidosCompraConfigPainel } from "./AprovacoesPedidosCompraConfigPainel";

interface DiretoriaPainelProps {
  usuarios: PortalUsuarioAdmin[];
  permissoes: PortalPermissao[];
  modulos: PortalModulo[];
  onFeedback: FeedbackHandler;
}

/*
 * Mesmo padrão de abas de ConfiguracoesPainel.tsx. Uma aba por tipo
 * com escopo próprio -- "Reajuste Salarial" governa quem SOLICITA (e
 * para quais colaboradores), "Pedidos de Compra" de quais empresas cada
 * diretor recebe e a integração com o ERP/SupriConnect -- e
 * "Aprovadores" governa quem DECIDE (e de quais tipos). Tipos novos
 * aparecem sozinhos na aba de aprovadores.
 */
type AbaDiretoria = "escopo" | "alcadas" | "configuracoes";

const ABAS: { valor: AbaDiretoria; label: string; icon: typeof ShieldCheck }[] = [
  { valor: "escopo", label: "Reajuste Salarial", icon: ShieldCheck },
  { valor: "alcadas", label: "Alçadas", icon: GitBranch },
  { valor: "configuracoes", label: "Configurações", icon: Settings },
];

export function DiretoriaPainel({ usuarios, permissoes, modulos, onFeedback }: DiretoriaPainelProps) {
  const [aba, setAba] = useState<AbaDiretoria>("escopo");

  return (
    <>
      <SegmentedTabs
        itens={ABAS.map((item) => ({
          valor: item.valor,
          label: item.label,
          icon: <item.icon size={15} />,
        }))}
        ativo={aba}
        onSelecionar={setAba}
      />

      <div style={{ marginTop: 20 }}>
        {aba === "escopo" && (
          <AprovacoesEscopoPainel
            usuarios={usuarios}
            permissoes={permissoes}
            modulos={modulos}
            onFeedback={onFeedback}
          />
        )}

        {aba === "alcadas" && (
          <AlcadasPainel usuarios={usuarios} permissoes={permissoes} modulos={modulos} onFeedback={onFeedback} />
        )}

        {aba === "configuracoes" && <ConfiguracoesDiretoria onFeedback={onFeedback} />}
      </div>
    </>
  );
}

type SubAbaConfiguracoes = "reajuste" | "pedidos-compra";

/*
 * Configurações são por tipo de aprovação: cada tipo tem a sua sub-aba
 * (Tabs sublinhado, dentro do conteúdo -- o SegmentedTabs de cima é a
 * navegação da seção). Estado próprio, como as abas de cima.
 */
function ConfiguracoesDiretoria({ onFeedback }: { onFeedback: FeedbackHandler }) {
  const [subAba, setSubAba] = useState<SubAbaConfiguracoes>("reajuste");

  return (
    <Tabs
      ariaLabel="Configurações por tipo de aprovação"
      value={subAba}
      onValueChange={(valor) => setSubAba(valor as SubAbaConfiguracoes)}
      items={[
        {
          value: "reajuste",
          label: "Reajuste Salarial",
          content: <AprovacoesConfigPainel onFeedback={onFeedback} />,
        },
        {
          value: "pedidos-compra",
          label: "Pedidos de Compra",
          content: <AprovacoesPedidosCompraConfigPainel onFeedback={onFeedback} />,
        },
      ]}
    />
  );
}
