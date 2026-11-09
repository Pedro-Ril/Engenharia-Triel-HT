"use client";

import { useState } from "react";
import { Calculator, Cpu, Layers, Timer } from "lucide-react";

import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { MaquinasTempoPainel } from "@/modules/tempos-maquina/components/admin/MaquinasTempoPainel";
import { MateriaisTempoPainel } from "@/modules/tempos-maquina/components/admin/MateriaisTempoPainel";
import { PerfisTempoPainel } from "@/modules/tempos-maquina/components/admin/PerfisTempoPainel";
import { SimuladorTempoPainel } from "@/modules/tempos-maquina/components/admin/SimuladorTempoPainel";

import type { FeedbackHandler } from "../types/toast.types";

type AbaTempos = "perfis" | "maquinas" | "materiais" | "simulador";

const ABAS: { valor: AbaTempos; label: string; icon: typeof Timer }[] = [
  { valor: "perfis", label: "Perfis de cálculo", icon: Timer },
  { valor: "maquinas", label: "Máquinas do ERP", icon: Cpu },
  { valor: "materiais", label: "Materiais", icon: Layers },
  { valor: "simulador", label: "Simulador", icon: Calculator },
];

/* Cálculo automático de tempo do Roteiro de Fabricação (docs/roteiro/calculo-automatico-tempos.md). */
export function TemposMaquinaPainel({ onFeedback }: { onFeedback: FeedbackHandler }) {
  const [aba, setAba] = useState<AbaTempos>("perfis");

  return (
    <>
      <SegmentedTabs
        itens={ABAS.map((item) => ({ valor: item.valor, label: item.label, icon: <item.icon size={15} /> }))}
        ativo={aba}
        onSelecionar={setAba}
      />

      <div style={{ marginTop: 20 }}>
        {aba === "perfis" && <PerfisTempoPainel onFeedback={onFeedback} />}
        {aba === "maquinas" && <MaquinasTempoPainel onFeedback={onFeedback} />}
        {aba === "materiais" && <MateriaisTempoPainel onFeedback={onFeedback} />}
        {aba === "simulador" && <SimuladorTempoPainel onFeedback={onFeedback} />}
      </div>
    </>
  );
}
