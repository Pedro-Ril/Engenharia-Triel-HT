"use client";

import { useState } from "react";
import { Cpu, LayoutGrid, MonitorPlay, Settings, Upload } from "lucide-react";

import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { AgenteTvPainel } from "./AgenteTvPainel";
import { ConfiguracoesTvPainel } from "./ConfiguracoesTvPainel";
import { DispositivosTvPainel } from "./DispositivosTvPainel";
import { GradesTvPainel } from "./GradesTvPainel";
import { MidiasTvPainel } from "./MidiasTvPainel";

interface TvCorporativaPainelProps {
  onFeedback: FeedbackHandler;
}

type AbaTv = "dispositivos" | "grades" | "midias" | "agente" | "configuracoes";

const ABAS: { valor: AbaTv; label: string; icon: typeof MonitorPlay }[] = [
  { valor: "dispositivos", label: "Dispositivos", icon: MonitorPlay },
  { valor: "grades", label: "Grades de programação", icon: LayoutGrid },
  { valor: "midias", label: "Mídias", icon: Upload },
  { valor: "agente", label: "Agente", icon: Cpu },
  { valor: "configuracoes", label: "Configurações", icon: Settings },
];

export function TvCorporativaPainel({ onFeedback }: TvCorporativaPainelProps) {
  const [aba, setAba] = useState<AbaTv>("dispositivos");

  return (
    <>
      <SegmentedTabs
        itens={ABAS.map((item) => ({
          valor: item.valor,
          label: item.label,
          icon: <item.icon size={15} />,
        }))}
        ativo={aba}
        onSelecionar={(valor) => setAba(valor as AbaTv)}
      />

      <div style={{ marginTop: 20 }}>
        {aba === "dispositivos" && <DispositivosTvPainel onFeedback={onFeedback} />}
        {aba === "grades" && <GradesTvPainel onFeedback={onFeedback} />}
        {aba === "midias" && <MidiasTvPainel onFeedback={onFeedback} />}
        {aba === "agente" && <AgenteTvPainel />}
        {aba === "configuracoes" && <ConfiguracoesTvPainel onFeedback={onFeedback} />}
      </div>
    </>
  );
}
