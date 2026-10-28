"use client";

import { useEffect, useState } from "react";
import { Box } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { OPCOES_VISUALIZACAO_3D, type Visualizacao3D } from "@/lib/terminal-fabrica/visualizacao-3d";

import {
  listarAparelhosTerminalFabrica,
  salvarVisualizacaoAparelho,
  type AparelhoTerminalFabrica,
} from "../services/adminPermissoes.service";
import type { FeedbackHandler } from "../types/toast.types";

interface TerminalFabricaVisualizacaoPainelProps {
  onFeedback: FeedbackHandler;
}

function formatarData(valorIso: string | null): string {
  return valorIso ? new Date(valorIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Nunca";
}

/*
 * Em qual app o botão 3D do Terminal de Fábrica abre, por aparelho da
 * TV Corporativa cuja grade mostra o terminal. A troca vale quando o
 * aparelho busca a grade de novo (no intervalo de atualização dele).
 */
export function TerminalFabricaVisualizacaoPainel({ onFeedback }: TerminalFabricaVisualizacaoPainelProps) {
  const [aparelhos, setAparelhos] = useState<AparelhoTerminalFabrica[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    listarAparelhosTerminalFabrica().then((resultado) => {
      if (!ativo) return;
      if (resultado.ok && resultado.data) {
        setAparelhos(resultado.data);
        setErro(null);
      } else {
        setErro(resultado.message ?? "Não foi possível carregar os aparelhos.");
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function trocar(aparelho: AparelhoTerminalFabrica, visualizacao: Visualizacao3D) {
    if (visualizacao === aparelho.visualizacao) return;
    setSalvando(aparelho.id);
    try {
      const resultado = await salvarVisualizacaoAparelho(aparelho.id, visualizacao);
      if (resultado.ok) {
        setAparelhos((atual) => atual?.map((a) => (a.id === aparelho.id ? { ...a, visualizacao } : a)) ?? atual);
        const nome = OPCOES_VISUALIZACAO_3D.find((o) => o.valor === visualizacao)?.label ?? visualizacao;
        onFeedback("success", "Visualização salva", `${aparelho.nome ?? "O aparelho"} passa a abrir o 3D no ${nome}.`);
      } else {
        onFeedback("danger", "Não foi possível salvar", resultado.message ?? "Tente novamente.");
      }
    } finally {
      setSalvando(null);
    }
  }

  return (
    <Card
      title="Visualização do 3D"
      description="Em qual aplicativo o botão 3D do Terminal de Fábrica abre, em cada aparelho da TV Corporativa com a grade do terminal."
    >
      <Stack gap={16}>
        <Alert variant="info">
          <strong>3D Play</strong> abre só o modelo. <strong>Product Explorer</strong> abre a árvore do produto ao lado do
          3D Navigate. A troca vale quando o aparelho atualiza a grade (no intervalo de atualização dele). Fora da TV, o
          terminal abre sempre no 3D Play.
        </Alert>

        {erro && <Alert variant="danger">{erro}</Alert>}

        {!aparelhos && !erro ? (
          <Loader label="Carregando aparelhos..." />
        ) : aparelhos && aparelhos.length === 0 ? (
          <EmptyState
            icon={<Box size={28} />}
            title="Nenhum aparelho com o Terminal de Fábrica"
            description="Aparecem aqui os aparelhos da TV Corporativa pareados com uma grade que mostra a página do terminal."
          />
        ) : (
          aparelhos && (
            <Table minWidth={640}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Aparelho</TableHeaderCell>
                  <TableHeaderCell>Grade</TableHeaderCell>
                  <TableHeaderCell>Visto por último</TableHeaderCell>
                  <TableHeaderCell>Abrir o 3D no</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {aparelhos.map((aparelho) => (
                  <TableRow key={aparelho.id}>
                    <TableCell>
                      <strong>{aparelho.nome ?? "Sem nome"}</strong>
                    </TableCell>
                    <TableCell>{aparelho.grade}</TableCell>
                    <TableCell>{formatarData(aparelho.ultimoHeartbeatEm)}</TableCell>
                    <TableCell>
                      <Dropdown
                        value={aparelho.visualizacao}
                        disabled={salvando === aparelho.id}
                        options={OPCOES_VISUALIZACAO_3D.map((o) => ({ value: o.valor, label: o.label }))}
                        onValueChange={(valor) => void trocar(aparelho, valor as Visualizacao3D)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        )}
      </Stack>
    </Card>
  );
}
