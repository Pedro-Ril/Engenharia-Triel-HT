"use client";

import { useState } from "react";
import { LayoutDashboard, ListChecks, Settings, Zap } from "lucide-react";

import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Stack } from "@/components/ui/Stack";
import type { PortalUsuarioAdmin } from "@/modules/admin-permissoes/types/adminPermissoes.types";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import type { Ambiente3dx } from "../types/plugins3dx.types";
import { AMBIENTES_3DX } from "../types/plugins3dx.types";
import { AMBIENTE } from "../utils/exibicao";
import { AcoesPlugins3dx } from "./AcoesPlugins3dx";
import { ConfiguracaoPlugins3dx } from "./ConfiguracaoPlugins3dx";
import { ExecucoesPlugins3dx } from "./ExecucoesPlugins3dx";
import styles from "./Plugins3dx.module.css";
import { VisaoGeralPlugins3dx } from "./VisaoGeralPlugins3dx";

interface Plugins3dxPainelProps {
  usuarios: PortalUsuarioAdmin[];
  onFeedback: FeedbackHandler;
}

type AbaPlugins = "visao-geral" | "execucoes" | "acoes" | "configuracao";

const ABAS: { valor: AbaPlugins; label: string; icon: typeof LayoutDashboard }[] = [
  { valor: "visao-geral", label: "Visão geral", icon: LayoutDashboard },
  { valor: "execucoes", label: "Execuções", icon: ListChecks },
  { valor: "acoes", label: "Ações", icon: Zap },
  { valor: "configuracao", label: "Configuração", icon: Settings },
];

const OPCOES_AMBIENTE: { valor: Ambiente3dx | null; label: string }[] = [
  { valor: null, label: "Ambos" },
  ...AMBIENTES_3DX.map((valor) => ({ valor, label: AMBIENTE[valor].label })),
];

/*
 * Administração > Plugins 3DX: os plugins que rodam dentro do 3DSpace (título na duplicação, revisão nos
 * conjuntos liberados, desenho por qualquer configuração). Liga/desliga por ambiente, mostra o que cada um fez e a
 * saúde dos nós, dispara ações manuais e mantém quem recebe aviso. O filtro de ambiente (dev = Teste, Produção ou
 * os dois) vale para todas as abas.
 */
export function Plugins3dxPainel({ usuarios, onFeedback }: Plugins3dxPainelProps) {
  const [aba, setAba] = useState<AbaPlugins>("visao-geral");
  const [ambiente, setAmbiente] = useState<Ambiente3dx | null>(null);
  /* Clicar num erro da visão geral abre a execução na aba Execuções. */
  const [execucaoAberta, setExecucaoAberta] = useState<string | null>(null);

  return (
    <Stack gap={20}>
      <SegmentedTabs
        itens={ABAS.map((item) => ({ valor: item.valor, label: item.label, icon: <item.icon size={15} /> }))}
        ativo={aba}
        onSelecionar={(valor) => setAba(valor as AbaPlugins)}
      />

      <div className={styles.barraAmbiente}>
        <span className={styles.barraAmbienteRotulo}>Ambiente</span>
        <div className={styles.grupoOpcoes} role="group" aria-label="Filtrar por ambiente">
          {OPCOES_AMBIENTE.map((opcao) => (
            <button
              key={opcao.label}
              type="button"
              className={`${styles.opcao} ${ambiente === opcao.valor ? styles.opcaoAtiva : ""}`}
              aria-pressed={ambiente === opcao.valor}
              onClick={() => setAmbiente(opcao.valor)}
            >
              {opcao.label}
            </button>
          ))}
        </div>
        <span className={styles.textoSecundario}>
          Teste = 3DSpace de desenvolvimento (dev-plm). Os dois gravam no mesmo banco, cada um com a sua fila.
        </span>
      </div>

      <div>
        {aba === "visao-geral" && (
          <VisaoGeralPlugins3dx
            ambiente={ambiente}
            onFeedback={onFeedback}
            onAbrirExecucao={(id) => {
              setExecucaoAberta(id);
              setAba("execucoes");
            }}
          />
        )}
        {aba === "execucoes" && (
          <ExecucoesPlugins3dx
            ambiente={ambiente}
            onFeedback={onFeedback}
            execucaoInicial={execucaoAberta}
            onFecharInicial={() => setExecucaoAberta(null)}
          />
        )}
        {aba === "acoes" && <AcoesPlugins3dx ambiente={ambiente} onFeedback={onFeedback} />}
        {aba === "configuracao" && (
          <ConfiguracaoPlugins3dx ambiente={ambiente} usuarios={usuarios} onFeedback={onFeedback} />
        )}
      </div>
    </Stack>
  );
}
