"use client";

import { useState } from "react";
import { Box, Printer, Search } from "lucide-react";

import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

import type { PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import { TerminalFabricaBuscasPainel } from "./TerminalFabricaBuscasPainel";
import { TerminalFabricaImpressaoPainel } from "./TerminalFabricaImpressaoPainel";
import { TerminalFabricaVisualizacaoPainel } from "./TerminalFabricaVisualizacaoPainel";

interface TerminalFabricaPainelProps {
  usuarios: PortalUsuarioAdmin[];
  onFeedback: FeedbackHandler;
}

/*
 * Mesmo padrão de abas de ConfiguracoesPainel/DiretoriaPainel. Visões
 * da mesma tela (a Consulta 2D / 3D): o que as pessoas procuraram,
 * quem pode mandar o desenho para a impressora, e em qual app o 3D
 * abre em cada aparelho da TV.
 */
type AbaTerminal = "buscas" | "impressao" | "visualizacao";

const ABAS: { valor: AbaTerminal; label: string; icon: typeof Search }[] = [
  { valor: "buscas", label: "Buscas", icon: Search },
  { valor: "impressao", label: "Impressão", icon: Printer },
  { valor: "visualizacao", label: "Visualização", icon: Box },
];

export function TerminalFabricaPainel({ usuarios, onFeedback }: TerminalFabricaPainelProps) {
  const [aba, setAba] = useState<AbaTerminal>("buscas");

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
        {aba === "buscas" && <TerminalFabricaBuscasPainel />}

        {aba === "impressao" && (
          <TerminalFabricaImpressaoPainel usuarios={usuarios} onFeedback={onFeedback} />
        )}

        {aba === "visualizacao" && <TerminalFabricaVisualizacaoPainel onFeedback={onFeedback} />}
      </div>
    </>
  );
}
