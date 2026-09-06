"use client";

import { useState } from "react";
import {
  Database,
  FileSpreadsheet,
  KeyRound,
  Mail,
  PackageSearch,
  Send,
  Shuffle,
  Wrench,
} from "lucide-react";

import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

import type { ConfiguracaoAd, ConfiguracaoDb, ConfiguracaoSmtp } from "../types/adminPermissoes.types";
import type { FeedbackHandler } from "../types/toast.types";
import { ConfiguracaoAdPainel } from "./ConfiguracaoAdPainel";
import { ConfiguracaoDbPainel } from "./ConfiguracaoDbPainel";
import { ConfiguracaoSmtpPainel } from "./ConfiguracaoSmtpPainel";
import { EstruturaSubstituicaoConfigPainel } from "./EstruturaSubstituicaoConfigPainel";
import { IntegraLantekConfigPainel } from "./IntegraLantekConfigPainel";
import { ManutencaoPainel } from "./ManutencaoPainel";
import { MateriaPrimaConfigPainel } from "./MateriaPrimaConfigPainel";
import { TransferenciaConfigPainel } from "./TransferenciaConfigPainel";

interface ConfiguracoesPainelProps {
  configuracaoAd: ConfiguracaoAd | null;
  configuracaoDb: ConfiguracaoDb | null;
  configuracaoSmtp: ConfiguracaoSmtp | null;
  emailUsuarioLogado: string | null;
  onFeedback: FeedbackHandler;
  onConfiguracaoAdAtualizada: (configuracao: ConfiguracaoAd) => void;
  onConfiguracaoDbAtualizada: (configuracao: ConfiguracaoDb) => void;
  onConfiguracaoSmtpAtualizada: (configuracao: ConfiguracaoSmtp) => void;
}

type AbaConfiguracao =
  | "ad"
  | "banco"
  | "smtp"
  | "materia-prima"
  | "estrutura"
  | "lantek"
  | "transferencia"
  | "manutencao";

const ABAS: { valor: AbaConfiguracao; label: string; icon: typeof KeyRound }[] = [
  { valor: "ad", label: "Active Directory", icon: KeyRound },
  { valor: "banco", label: "Banco de dados", icon: Database },
  { valor: "smtp", label: "E-mail (SMTP)", icon: Mail },
  { valor: "manutencao", label: "Manutenção", icon: Wrench },
  { valor: "materia-prima", label: "Matéria-Prima", icon: PackageSearch },
  { valor: "estrutura", label: "Estrutura", icon: Shuffle },
  { valor: "lantek", label: "Integração Lantek", icon: FileSpreadsheet },
  { valor: "transferencia", label: "Transferência de Arquivos", icon: Send },
];

export function ConfiguracoesPainel({
  configuracaoAd,
  configuracaoDb,
  configuracaoSmtp,
  emailUsuarioLogado,
  onFeedback,
  onConfiguracaoAdAtualizada,
  onConfiguracaoDbAtualizada,
  onConfiguracaoSmtpAtualizada,
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

        {aba === "smtp" && (
          <ConfiguracaoSmtpPainel
            configuracaoSmtp={configuracaoSmtp}
            emailUsuarioLogado={emailUsuarioLogado}
            onFeedback={onFeedback}
            onConfiguracaoAtualizada={onConfiguracaoSmtpAtualizada}
          />
        )}

        {aba === "materia-prima" && <MateriaPrimaConfigPainel onFeedback={onFeedback} />}

        {aba === "estrutura" && <EstruturaSubstituicaoConfigPainel onFeedback={onFeedback} />}

        {aba === "lantek" && <IntegraLantekConfigPainel onFeedback={onFeedback} />}

        {aba === "transferencia" && <TransferenciaConfigPainel onFeedback={onFeedback} />}

        {aba === "manutencao" && <ManutencaoPainel onFeedback={onFeedback} />}
      </div>
    </>
  );
}
