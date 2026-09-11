"use client";

import { useState } from "react";
import { Hash, Plug, Warehouse } from "lucide-react";

import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

import type { FeedbackHandler } from "../types/toast.types";
import { EstoqueEquipamentosUsadosConfigPainel } from "./EstoqueEquipamentosUsadosConfigPainel";
import { EstoqueSequenciaPainel } from "./EstoqueSequenciaPainel";
import { TiposEquipamentoPainel } from "./TiposEquipamentoPainel";

interface EstoqueEquipamentosUsadosPainelProps {
  onFeedback: FeedbackHandler;
}

type AbaEstoque = "tipos" | "sequencia" | "erp";

const ABAS: { valor: AbaEstoque; label: string; icon: typeof Warehouse }[] = [
  { valor: "tipos", label: "Tipos, blocos e campos", icon: Warehouse },
  { valor: "sequencia", label: "Sequência de numeração", icon: Hash },
  { valor: "erp", label: "Integração ERP", icon: Plug },
];

export function EstoqueEquipamentosUsadosPainel({ onFeedback }: EstoqueEquipamentosUsadosPainelProps) {
  const [aba, setAba] = useState<AbaEstoque>("tipos");

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
        {aba === "tipos" && <TiposEquipamentoPainel onFeedback={onFeedback} />}
        {aba === "sequencia" && <EstoqueSequenciaPainel onFeedback={onFeedback} />}
        {aba === "erp" && <EstoqueEquipamentosUsadosConfigPainel onFeedback={onFeedback} />}
      </div>
    </>
  );
}
