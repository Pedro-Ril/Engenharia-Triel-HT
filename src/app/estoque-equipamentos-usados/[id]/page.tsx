import { notFound } from "next/navigation";

import { requireModuloAccess } from "@/lib/auth/autorizacao";
import { buscarEmpresaPorCodigo } from "@/lib/empresas/empresas";
import {
  buscarEquipamentoPorId,
  listarHistoricoAlteracoesDados,
} from "@/lib/estoque-equipamentos-usados/estoque-equipamentos-usados";
import { listarEvidenciasDoEquipamento } from "@/lib/estoque-equipamentos-usados/evidencias";
import { listarAnexosDoEquipamento } from "@/lib/estoque-equipamentos-usados/movimentacoes-anexos";
import { listarBlocosDoTipo, listarCamposDoTipo } from "@/lib/estoque-equipamentos-usados/tipos-equipamento";
import { EquipamentoDetalhePage } from "@/modules/estoque-equipamentos-usados/components/EquipamentoDetalhePage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  await requireModuloAccess("estoque-equipamentos-usados");

  const { id } = await params;
  const equipamento = await buscarEquipamentoPorId(id);

  if (!equipamento) {
    notFound();
  }

  const [blocosDoTipo, camposDoTipo, evidencias, anexosMovimentacoes, historicoDados, empresa] = await Promise.all([
    equipamento.tipoEquipamentoId ? listarBlocosDoTipo(equipamento.tipoEquipamentoId, true) : [],
    equipamento.tipoEquipamentoId ? listarCamposDoTipo(equipamento.tipoEquipamentoId, true) : [],
    listarEvidenciasDoEquipamento(id),
    listarAnexosDoEquipamento(id),
    listarHistoricoAlteracoesDados(id),
    equipamento.codigoEmpresa ? buscarEmpresaPorCodigo(equipamento.codigoEmpresa) : null,
  ]);

  return (
    <EquipamentoDetalhePage
      equipamento={equipamento}
      blocosDoTipo={blocosDoTipo}
      camposDoTipo={camposDoTipo}
      evidencias={evidencias}
      anexosMovimentacoes={anexosMovimentacoes}
      historicoDados={historicoDados}
      nomeEmpresa={empresa?.nome ?? null}
    />
  );
}
