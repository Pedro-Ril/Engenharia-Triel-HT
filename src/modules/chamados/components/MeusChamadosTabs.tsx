"use client";

import { useState } from "react";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import type { ChamadoResumo } from "../types/chamados.types";
import { PrioridadeBadge, StatusBadge } from "./ChamadoBadges";

interface MeusChamadosTabsProps {
  meusChamados: ChamadoResumo[];
  chamadosEmCopia: ChamadoResumo[];
}

type Aba = "meus" | "copia";

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function TabelaChamados({ chamados, mensagemVazia }: { chamados: ChamadoResumo[]; mensagemVazia: string }) {
  if (chamados.length === 0) {
    return (
      <Card>
        <EmptyState icon={<LifeBuoy size={28} />} title={mensagemVazia} />
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Nº</TableHeaderCell>
            <TableHeaderCell>Título</TableHeaderCell>
            <TableHeaderCell>Setor</TableHeaderCell>
            <TableHeaderCell>Categoria</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Prioridade</TableHeaderCell>
            <TableHeaderCell>Atualizado em</TableHeaderCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {chamados.map((chamado) => (
            <TableRow key={chamado.id}>
              <TableCell>
                <Link href={`/chamados/${chamado.numero}`}>#{chamado.numero}</Link>
              </TableCell>
              <TableCell>{chamado.titulo}</TableCell>
              <TableCell>{chamado.setorNome}</TableCell>
              <TableCell>{chamado.categoriaNome ?? "—"}</TableCell>
              <TableCell>
                <StatusBadge status={chamado.status} />
              </TableCell>
              <TableCell>
                <PrioridadeBadge prioridade={chamado.prioridade} />
              </TableCell>
              <TableCell>{formatarData(chamado.atualizadoEm)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export function MeusChamadosTabs({ meusChamados, chamadosEmCopia }: MeusChamadosTabsProps) {
  const [aba, setAba] = useState<Aba>("meus");

  return (
    <>
      <SegmentedTabs
        itens={[
          { valor: "meus", label: `Meus chamados (${meusChamados.length})` },
          { valor: "copia", label: `Em cópia (${chamadosEmCopia.length})` },
        ]}
        ativo={aba}
        onSelecionar={setAba}
      />

      {aba === "meus" ? (
        <TabelaChamados
          chamados={meusChamados}
          mensagemVazia="Quando você abrir um chamado logado nesta conta, ele aparece aqui."
        />
      ) : (
        <TabelaChamados
          chamados={chamadosEmCopia}
          mensagemVazia="Você aparece aqui quando alguém te adicionar em cópia num chamado."
        />
      )}
    </>
  );
}
