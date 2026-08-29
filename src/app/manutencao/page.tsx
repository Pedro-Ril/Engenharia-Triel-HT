import { Wrench } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { buscarStatusManutencao } from "@/lib/auth/manutencao";

export default async function ManutencaoPage() {
  const status = await buscarStatusManutencao();

  return (
    <PageContainer>
      <EmptyState
        icon={<Wrench size={40} />}
        title="O portal está em manutenção"
        description={
          status.mensagem ??
          "Voltamos assim que possível. Tente novamente em alguns minutos."
        }
      />
    </PageContainer>
  );
}
