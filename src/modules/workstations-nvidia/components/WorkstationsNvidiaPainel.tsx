"use client";

import { useState } from "react";
import { FileSliders, History, MonitorCog, Settings } from "lucide-react";

import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { ConfiguracoesNvidiaPainel } from "./ConfiguracoesNvidiaPainel";
import { HistoricoNvidiaPainel } from "./HistoricoNvidiaPainel";
import { MaquinasNvidiaPainel } from "./MaquinasNvidiaPainel";
import { PerfilNvidiaPainel } from "./PerfilNvidiaPainel";

interface WorkstationsNvidiaPainelProps {
  onFeedback: FeedbackHandler;
}

type AbaNvidia = "maquinas" | "historico" | "perfil" | "configuracoes";

const ABAS: { valor: AbaNvidia; label: string; icon: typeof MonitorCog }[] = [
  { valor: "maquinas", label: "Máquinas", icon: MonitorCog },
  { valor: "historico", label: "Histórico", icon: History },
  { valor: "perfil", label: "Perfil oficial", icon: FileSliders },
  { valor: "configuracoes", label: "Configurações", icon: Settings },
];

export function WorkstationsNvidiaPainel({ onFeedback }: WorkstationsNvidiaPainelProps) {
  const [aba, setAba] = useState<AbaNvidia>("maquinas");

  return (
    <>
      <SegmentedTabs
        itens={ABAS.map((item) => ({
          valor: item.valor,
          label: item.label,
          icon: <item.icon size={15} />,
        }))}
        ativo={aba}
        onSelecionar={(valor) => setAba(valor as AbaNvidia)}
      />

      <div style={{ marginTop: 20 }}>
        {aba === "maquinas" && <MaquinasNvidiaPainel onFeedback={onFeedback} />}
        {aba === "historico" && <HistoricoNvidiaPainel />}
        {aba === "perfil" && <PerfilNvidiaPainel onFeedback={onFeedback} />}
        {aba === "configuracoes" && <ConfiguracoesNvidiaPainel onFeedback={onFeedback} />}
      </div>
    </>
  );
}
