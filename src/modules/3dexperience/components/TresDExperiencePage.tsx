"use client";

import { useState } from "react";
import { Box, Home } from "lucide-react";

import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { ConsultaUltimaRevisaoPage } from "@/modules/consulta-ultima-revisao/components/ConsultaUltimaRevisaoPage";

import { LiberacaoDesenhosTab } from "./LiberacaoDesenhosTab";

export type AbaTresDExperience = "ultima-revisao" | "liberar-desenhos";

interface TresDExperiencePageProps {
  abaInicial: AbaTresDExperience;
}

/*
 * 3DExperience (Engenharia de Produto): as ferramentas que falam com o
 * 3DEXPERIENCE, uma por aba, com uma permissão só (chave
 * "3dexperience"). A aba vai na URL (?aba=) para dar para mandar o link
 * direto -- /consulta-ultima-revisao redireciona para a dela.
 */
export function TresDExperiencePage({ abaInicial }: TresDExperiencePageProps) {
  const [aba, setAba] = useState<AbaTresDExperience>(abaInicial);

  function trocarAba(valor: string) {
    setAba(valor as AbaTresDExperience);
    window.history.replaceState(null, "", `/3dexperience?aba=${valor}`);
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
        onValueChange={trocarAba}
        items={[
          { value: "ultima-revisao", label: "Consulta última revisão", content: <ConsultaUltimaRevisaoPage /> },
          { value: "liberar-desenhos", label: "Liberação de desenhos", content: <LiberacaoDesenhosTab /> },
        ]}
      />
    </PageContainer>
  );
}
