"use client";

import { useState } from "react";
import { Home, LayoutGrid, Upload } from "lucide-react";

import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Toast } from "@/components/ui/Toast";
import type { FeedbackHandler, ToastState } from "@/modules/admin-permissoes/types/toast.types";

import { GradesTvPainel } from "./GradesTvPainel";
import { MidiasTvPainel } from "./MidiasTvPainel";

type AbaTv = "grades" | "midias";

const ABAS: { valor: AbaTv; label: string; icon: typeof LayoutGrid }[] = [
  { valor: "grades", label: "Grades de programação", icon: LayoutGrid },
  { valor: "midias", label: "Mídias", icon: Upload },
];

const toastInicial: ToastState = {
  open: false,
  variant: "success",
  title: "",
  description: "",
};

/*
 * Versão restrita da tela de TV Corporativa para gestores não-admin
 * (ver requireModuloAccess("tv-corporativa") no layout desta rota) —
 * só Grades e Mídias, sem Dispositivos/Configurações, que continuam
 * exclusivas de admin em Administração → TV Corporativa.
 */
export function TvCorporativaGestaoPage() {
  const [aba, setAba] = useState<AbaTv>("grades");
  const [toast, setToast] = useState<ToastState>(toastInicial);

  const mostrarFeedback: FeedbackHandler = (variant, title, description) => {
    setToast({ open: true, variant, title, description });
  };

  return (
    <PageContainer>
      <PageHeader
        title="TV Corporativa"
        description="Gerencie a programação e as mídias exibidas nas TVs da empresa."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home /> },
          { label: "TV Corporativa" },
        ]}
      />

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
        {aba === "grades" && <GradesTvPainel onFeedback={mostrarFeedback} />}
        {aba === "midias" && <MidiasTvPainel onFeedback={mostrarFeedback} />}
      </div>

      <Toast
        open={toast.open}
        variant={toast.variant}
        title={toast.title}
        description={toast.description}
        onClose={() => setToast((atual) => ({ ...atual, open: false }))}
      />
    </PageContainer>
  );
}
