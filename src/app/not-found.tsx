import { MapPinOff } from "lucide-react";

import AppLink from "@/components/AppLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";

export default function NotFoundPage() {
  return (
    <PageContainer>
      <EmptyState
        icon={<MapPinOff size={40} />}
        title="Página não encontrada"
        description="O endereço que você tentou acessar não existe ou foi movido. Volte para o início para continuar navegando."
        action={<AppLink href="/">Voltar ao início</AppLink>}
      />
    </PageContainer>
  );
}
