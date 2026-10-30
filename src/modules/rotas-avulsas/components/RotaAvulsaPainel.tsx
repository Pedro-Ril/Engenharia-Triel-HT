"use client";

import { useState } from "react";
import { BookOpen, KeyRound, ScrollText, Settings } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Stack } from "@/components/ui/Stack";

import { buscarRotaCatalogo } from "@/lib/rotas-avulsas/catalogo";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import type { ConfigRotaAvulsa } from "../types/rotasAvulsas.types";
import { ComoUsarImpressao } from "./ComoUsarImpressao";
import { ConfigRotaAvulsa as ConfigRotaAvulsaPainel } from "./ConfigRotaAvulsa";
import { LogsRotaAvulsa } from "./LogsRotaAvulsa";
import styles from "./RotasAvulsas.module.css";
import { TokensRotaAvulsa } from "./TokensRotaAvulsa";

type Aba = "configuracoes" | "tokens" | "logs" | "como-usar";

const ABAS: { valor: Aba; label: string; icon: typeof Settings }[] = [
  { valor: "configuracoes", label: "Configurações", icon: Settings },
  { valor: "tokens", label: "Tokens", icon: KeyRound },
  { valor: "logs", label: "Logs", icon: ScrollText },
  { valor: "como-usar", label: "Como usar", icon: BookOpen },
];

interface RotaAvulsaPainelProps {
  chave: string;
  onFeedback: FeedbackHandler;
}

/*
 * Administração de uma rota avulsa (um item do submenu "Rotas avulsas"):
 * configurações, tokens, logs e a documentação para quem integra. Mesmo
 * padrão de abas dos demais painéis (estado da aba aqui dentro).
 */
export function RotaAvulsaPainel({ chave, onFeedback }: RotaAvulsaPainelProps) {
  const [aba, setAba] = useState<Aba>("configuracoes");
  const [config, setConfig] = useState<ConfigRotaAvulsa | null>(null);
  const rota = buscarRotaCatalogo(chave);

  if (!rota) return null;

  return (
    <Stack gap={20}>
      <div className={styles.cabecalhoRota}>
        <div>
          <h2>{rota.nome}</h2>
          <p>{rota.descricao}</p>
          <div className={styles.endpoints}>
            {rota.endpoints.map((endpoint) => (
              <span key={`${endpoint.metodo} ${endpoint.caminho}`} className={styles.endpoint}>
                <span className={styles.metodo}>{endpoint.metodo}</span> {endpoint.caminho}
              </span>
            ))}
          </div>
        </div>
        {config && (
          <Badge variant={config.ativo ? "success" : "neutral"}>{config.ativo ? "Ligada" : "Desligada"}</Badge>
        )}
      </div>

      <SegmentedTabs
        itens={ABAS.map((item) => ({ valor: item.valor, label: item.label, icon: <item.icon size={15} /> }))}
        ativo={aba}
        onSelecionar={setAba}
      />

      {aba === "configuracoes" && <ConfigRotaAvulsaPainel chave={chave} onFeedback={onFeedback} onConfigCarregada={setConfig} />}
      {aba === "tokens" && <TokensRotaAvulsa chave={chave} onFeedback={onFeedback} />}
      {aba === "logs" && <LogsRotaAvulsa chave={chave} />}
      {aba === "como-usar" && chave === "impressao-pdf" && <ComoUsarImpressao />}
    </Stack>
  );
}
