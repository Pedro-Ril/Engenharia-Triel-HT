import { ShieldAlert } from "lucide-react";

import AppLink from "@/components/AppLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";

export default function AcessoNegadoPage() {
  return (
    <PageContainer>
      <EmptyState
        icon={<ShieldAlert size={40} />}
        title="Você não tem acesso a esta ferramenta"
        description="Fale com um administrador do portal para solicitar liberação, ou volte para o início."
        action={<AppLink href="/">Voltar ao início</AppLink>}
      />
    </PageContainer>
  );
}
