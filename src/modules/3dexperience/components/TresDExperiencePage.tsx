"use client";

import { useState } from "react";
import { Box, Home } from "lucide-react";

import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { ConsultaUltimaRevisaoPage } from "@/modules/consulta-ultima-revisao/components/ConsultaUltimaRevisaoPage";

import { iniciarSimulacao } from "../services/liberacaoDesenhos.service";
import { LiberacaoDesenhosTab } from "./LiberacaoDesenhosTab";

export type AbaTresDExperience = "ultima-revisao" | "liberar-desenhos";

interface TresDExperiencePageProps {
  abaInicial: AbaTresDExperience;
  codigoInicial: string;
}

/*
 * 3DExperience (Engenharia de Produto): as ferramentas que falam com o
 * 3DEXPERIENCE, uma por aba, com uma permissão só (chave
 * "3dexperience"). A aba vai na URL (?aba=) para dar para mandar o link
 * direto -- /consulta-ultima-revisao redireciona para a dela.
 *
 * O código do item é compartilhado entre as abas (só a aba ativa fica
 * montada, então ele mora aqui): o que foi digitado numa aparece na
 * outra, seja pelo botão de atalho, seja clicando na aba. Vai também na
 * URL (&codigo=) ao trocar de aba.
 *
 * Chegar na Liberação vindo da Consulta com um código já dispara a
 * simulação -- no próprio clique (handler, não efeito: um clique, uma
 * simulação). Abrir a URL com &codigo= só preenche o campo, senão cada
 * F5 viraria uma simulação nova no histórico.
 */
export function TresDExperiencePage({ abaInicial, codigoInicial }: TresDExperiencePageProps) {
  const [aba, setAba] = useState<AbaTresDExperience>(abaInicial);
  const [codigo, setCodigo] = useState(codigoInicial);
  /* Simulação disparada na troca de aba: a aba de liberação abre já acompanhando ela (ou com o erro). */
  const [simulacaoAutomatica, setSimulacaoAutomatica] = useState<{ rodadaId: string | null; erro: string | null } | null>(null);
  const [iniciandoSimulacao, setIniciandoSimulacao] = useState(false);

  function mostrarAba(valor: AbaTresDExperience) {
    setAba(valor);
    const params = new URLSearchParams({ aba: valor });
    if (codigo.trim()) params.set("codigo", codigo.trim());
    window.history.replaceState(null, "", `/3dexperience?${params.toString()}`);
  }

  async function trocarAba(valor: string) {
    const destino = valor as AbaTresDExperience;
    const codigoLimpo = codigo.trim();
    if (destino !== "liberar-desenhos" || aba === "liberar-desenhos" || !codigoLimpo) {
      setSimulacaoAutomatica(null);
      mostrarAba(destino);
      return;
    }
    if (iniciandoSimulacao) return;

    setIniciandoSimulacao(true);
    try {
      const resultado = await iniciarSimulacao(codigoLimpo);
      setSimulacaoAutomatica(
        resultado.ok && resultado.data
          ? { rodadaId: resultado.data.id, erro: null }
          : { rodadaId: null, erro: resultado.message ?? "Não foi possível iniciar a simulação." }
      );
    } catch {
      setSimulacaoAutomatica({ rodadaId: null, erro: "Não foi possível iniciar a simulação." });
    } finally {
      setIniciandoSimulacao(false);
    }
    mostrarAba(destino);
  }

  return (
    <PageContainer>
      <PageHeader
        title="3DEXPERIENCE"
        description="Ferramentas que consultam e atualizam o 3DEXPERIENCE a partir da estrutura do item."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "3DEXPERIENCE", current: true, icon: <Box size={14} /> },
        ]}
      />

      <Tabs
        ariaLabel="Ferramentas do 3DEXPERIENCE"
        value={aba}
        onValueChange={(valor) => void trocarAba(valor)}
        items={[
          {
            value: "ultima-revisao",
            label: "Consulta última revisão",
            content: (
              <ConsultaUltimaRevisaoPage
                codigoInicial={codigo}
                onCodigoChange={setCodigo}
                onIrParaLiberacao={() => void trocarAba("liberar-desenhos")}
                irParaLiberacaoCarregando={iniciandoSimulacao}
              />
            ),
          },
          {
            value: "liberar-desenhos",
            label: "Liberação de desenhos",
            content: (
              <LiberacaoDesenhosTab
                codigoInicial={codigo}
                rodadaInicialId={simulacaoAutomatica?.rodadaId ?? null}
                erroInicial={simulacaoAutomatica?.erro ?? null}
                onCodigoChange={setCodigo}
                onIrParaConsulta={() => void trocarAba("ultima-revisao")}
              />
            ),
          },
        ]}
      />
    </PageContainer>
  );
}
