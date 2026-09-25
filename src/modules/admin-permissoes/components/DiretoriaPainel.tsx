"use client";

import { useState } from "react";
import { Gavel, ShieldCheck } from "lucide-react";

import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

import type { PortalModulo, PortalPermissao, PortalUsuarioAdmin } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import { AprovacoesAtendentesPainel } from "./AprovacoesAtendentesPainel";
import { AprovacoesEscopoPainel } from "./AprovacoesEscopoPainel";

interface DiretoriaPainelProps {
  usuarios: PortalUsuarioAdmin[];
  permissoes: PortalPermissao[];
  modulos: PortalModulo[];
  onFeedback: FeedbackHandler;
}

/*
 * Mesmo padrão de abas de ConfiguracoesPainel.tsx. Duas metades do
 * mesmo fluxo: "Reajuste Salarial" governa quem SOLICITA (e para quais
 * colaboradores), "Aprovadores" governa quem DECIDE (e de quais tipos).
 * Tipos novos de aprovação aparecem sozinhos na aba de aprovadores; se
 * precisarem de escopo próprio, entram como uma aba nova aqui.
 */
type AbaDiretoria = "escopo" | "aprovadores";

const ABAS: { valor: AbaDiretoria; label: string; icon: typeof ShieldCheck }[] = [
  { valor: "escopo", label: "Reajuste Salarial", icon: ShieldCheck },
  { valor: "aprovadores", label: "Aprovadores", icon: Gavel },
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

        {aba === "aprovadores" && (
          <AprovacoesAtendentesPainel
            usuarios={usuarios}
            permissoes={permissoes}
            modulos={modulos}
            onFeedback={onFeedback}
          />
        )}
      </div>
    </>
  );
}
