"use client";

import { useState } from "react";
import { Database, KeyRound, PackageSearch, Shuffle, Wrench } from "lucide-react";

import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

import type { ConfiguracaoAd, ConfiguracaoDb } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import { ConfiguracaoAdPainel } from "./ConfiguracaoAdPainel";
import { ConfiguracaoDbPainel } from "./ConfiguracaoDbPainel";
import { EstruturaSubstituicaoConfigPainel } from "./EstruturaSubstituicaoConfigPainel";
import { ManutencaoPainel } from "./ManutencaoPainel";
import { MateriaPrimaConfigPainel } from "./MateriaPrimaConfigPainel";

interface ConfiguracoesPainelProps {
  configuracaoAd: ConfiguracaoAd | null;
  configuracaoDb: ConfiguracaoDb | null;
  onFeedback: FeedbackHandler;
  onConfiguracaoAdAtualizada: (configuracao: ConfiguracaoAd) => void;
  onConfiguracaoDbAtualizada: (configuracao: ConfiguracaoDb) => void;
}

type AbaConfiguracao = "ad" | "banco" | "materia-prima" | "estrutura" | "manutencao";

const ABAS: { valor: AbaConfiguracao; label: string; icon: typeof KeyRound }[] = [
  { valor: "ad", label: "Active Directory", icon: KeyRound },
  { valor: "banco", label: "Banco de dados", icon: Database },
  { valor: "manutencao", label: "Manutenção", icon: Wrench },
  { valor: "materia-prima", label: "Matéria-Prima", icon: PackageSearch },
  { valor: "estrutura", label: "Estrutura", icon: Shuffle },
];

export function ConfiguracoesPainel({
  configuracaoAd,
  configuracaoDb,
  onFeedback,
  onConfiguracaoAdAtualizada,
  onConfiguracaoDbAtualizada,
}: ConfiguracoesPainelProps) {
  const [aba, setAba] = useState<AbaConfiguracao>("ad");

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
        {aba === "ad" && (
          <ConfiguracaoAdPainel
            configuracaoAd={configuracaoAd}
            onFeedback={onFeedback}
            onConfiguracaoAtualizada={onConfiguracaoAdAtualizada}
          />
        )}

        {aba === "banco" && (
          <ConfiguracaoDbPainel
            configuracaoDb={configuracaoDb}
            onFeedback={onFeedback}
            onConfiguracaoAtualizada={onConfiguracaoDbAtualizada}
          />
        )}

        {aba === "materia-prima" && <MateriaPrimaConfigPainel onFeedback={onFeedback} />}

        {aba === "estrutura" && <EstruturaSubstituicaoConfigPainel onFeedback={onFeedback} />}

        {aba === "manutencao" && <ManutencaoPainel onFeedback={onFeedback} />}
      </div>
    </>
  );
}
