"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Home, ListChecks, Trash2, TrendingUp } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { NumberInput } from "@/components/ui/NumberInput";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";

import { buscarSalarioFuncionario, criarSolicitacaoAumento } from "../services/aprovacoes.service";
import type { FuncionarioRh } from "../types/aprovacoes.types";
import { AdicionarColaboradorField } from "./AdicionarColaboradorField";

interface LinhaColaborador {
  funcionario: FuncionarioRh;
  salarioAtual: number | null;
  carregandoSalario: boolean;
  erroSalario: string | null;
  cpf: string | null;
  valorReajuste: string;
  percentualReajuste: string;
  observacao: string;
}

/*
 * Cálculo bidirecional valor <-> percentual sem loop, agora por LINHA
 * da tabela: cada handler só escreve no campo OPOSTO daquela mesma
 * linha, nunca no próprio -- nenhum useEffect observando os dois ao
 * mesmo tempo, então não tem como entrar em ciclo.
 */
export function SolicitarAumentoPage() {
  const [observacao, setObservacao] = useState("");
  const [linhas, setLinhas] = useState<LinhaColaborador[]>([]);

  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [numeroCriado, setNumeroCriado] = useState<number | null>(null);

  function handleAdicionar(funcionario: FuncionarioRh) {
    setLinhas((atual) => [
      ...atual,
      {
        funcionario,
        salarioAtual: null,
        carregandoSalario: true,
        erroSalario: null,
        cpf: null,
        valorReajuste: "",
        percentualReajuste: "",
        observacao: "",
      },
    ]);

    buscarSalarioFuncionario(funcionario.codigo).then((resultado) => {
      setLinhas((atual) =>
        atual.map((linha) => {
          if (linha.funcionario.codigo !== funcionario.codigo) return linha;

          if (resultado.ok && resultado.data) {
            return {
              ...linha,
              salarioAtual: resultado.data.salarioAtual,
              cpf: resultado.data.cpf,
              carregandoSalario: false,
            };
          }

          return {
            ...linha,
            erroSalario: resultado.message ?? "Não foi possível buscar o salário atual.",
            carregandoSalario: false,
          };
        })
      );
    });
  }

  function handleRemover(codigo: string) {
    setLinhas((atual) => atual.filter((linha) => linha.funcionario.codigo !== codigo));
  }

  function handleObservacaoChange(codigo: string, texto: string) {
    setLinhas((atual) =>
      atual.map((linha) => (linha.funcionario.codigo === codigo ? { ...linha, observacao: texto } : linha))
    );
  }

  function handleValorChange(codigo: string, novoValor: string) {
    setLinhas((atual) =>
      atual.map((linha) => {
        if (linha.funcionario.codigo !== codigo) return linha;

        if (!linha.salarioAtual || !novoValor) {
          return { ...linha, valorReajuste: novoValor, percentualReajuste: novoValor ? linha.percentualReajuste : "" };
        }

        return {
          ...linha,
          valorReajuste: novoValor,
          percentualReajuste: ((Number(novoValor) / linha.salarioAtual) * 100).toFixed(2),
        };
      })
    );
  }

  function handlePercentualChange(codigo: string, texto: string) {
    setLinhas((atual) =>
      atual.map((linha) => {
        if (linha.funcionario.codigo !== codigo) return linha;

        if (!linha.salarioAtual || !texto) {
          return { ...linha, percentualReajuste: texto, valorReajuste: texto ? linha.valorReajuste : "" };
        }

        const percentual = Number(texto);
        if (!Number.isFinite(percentual)) return linha;

        return {
          ...linha,
          percentualReajuste: texto,
          valorReajuste: ((linha.salarioAtual * percentual) / 100).toFixed(2),
        };
      })
    );
  }

  const podeEnviar =
    linhas.length > 0 &&
    linhas.every(
      (linha) =>
        linha.salarioAtual !== null &&
        !linha.carregandoSalario &&
        Number(linha.valorReajuste) > 0 &&
        Number(linha.percentualReajuste) > 0
    );

  async function handleEnviar() {
    setEnviando(true);
    setErroEnvio(null);

    try {
      const resultado = await criarSolicitacaoAumento({
        observacao: observacao.trim() || null,
        itens: linhas.map((linha) => ({
          funcionarioCodigo: linha.funcionario.codigo,
          funcionarioNome: linha.funcionario.nome,
          funcionarioCpf: linha.cpf,
          departamento: linha.funcionario.departamento,
          setor: linha.funcionario.setor,
          salarioAtual: linha.salarioAtual as number,
          valorReajuste: Number(linha.valorReajuste),
          percentualReajuste: Number(linha.percentualReajuste),
          observacao: linha.observacao.trim() || null,
        })),
      });

      if (resultado.ok && resultado.data) {
        setNumeroCriado(resultado.data.numero);
      } else {
        setErroEnvio(resultado.message ?? "Não foi possível criar a solicitação.");
      }
    } finally {
      setEnviando(false);
    }
  }

  function handleNovaSolicitacao() {
    setObservacao("");
    setLinhas([]);
    setNumeroCriado(null);
    setErroEnvio(null);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Reajuste Salarial"
        description="Registre uma solicitação de reajuste salarial para aprovação da direção."
        actions={
          <Link href="/aprovacoes/minhas-solicitacoes">
            <Button variant="secondary">
              <ListChecks size={16} />
              Minhas solicitações
            </Button>
          </Link>
        }
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Reajuste Salarial", current: true, icon: <TrendingUp size={14} /> },
        ]}
      />

      {numeroCriado ? (
        <Card>
          <Stack gap={16}>
            <Alert variant="success" icon={<CheckCircle2 />} title="Solicitação enviada">
              A solicitação <strong>#{numeroCriado}</strong> foi criada e enviada para aprovação da direção.
            </Alert>
            <Stack direction="row" gap={10}>
              <Button onClick={handleNovaSolicitacao}>Nova solicitação</Button>
              <Link href="/aprovacoes/minhas-solicitacoes">
                <Button variant="secondary">Ver minhas solicitações</Button>
              </Link>
            </Stack>
          </Stack>
        </Card>
      ) : (
        <Card title="Nova solicitação">
          <Stack gap={20}>
            <Field label="Adicionar colaborador">
              <AdicionarColaboradorField
                codigosJaAdicionados={linhas.map((linha) => linha.funcionario.codigo)}
                onAdicionar={handleAdicionar}
                disabled={enviando}
              />
            </Field>

            {linhas.length === 0 ? (
              <EmptyState
                icon={<TrendingUp size={26} />}
                title="Nenhum colaborador adicionado ainda"
                description="Busque acima e adicione ao menos um colaborador à solicitação."
              />
            ) : (
              <Table minWidth={1100}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Colaborador</TableHeaderCell>
                    <TableHeaderCell>Depto / Setor</TableHeaderCell>
                    <TableHeaderCell align="center">Salário atual</TableHeaderCell>
                    <TableHeaderCell align="center">Valor do reajuste</TableHeaderCell>
                    <TableHeaderCell align="center">%</TableHeaderCell>
                    <TableHeaderCell align="center">Novo salário</TableHeaderCell>
                    <TableHeaderCell>Observação (colaborador)</TableHeaderCell>
                    <TableHeaderCell align="center"> </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {linhas.map((linha) => {
                    const novoSalario =
                      linha.salarioAtual && linha.valorReajuste
                        ? linha.salarioAtual + Number(linha.valorReajuste)
                        : null;

                    return (
                      <TableRow key={linha.funcionario.codigo}>
                        <TableCell>{linha.funcionario.nome}</TableCell>
                        <TableCell>
                          {linha.funcionario.departamento ?? "-"}
                          {linha.funcionario.setor ? ` / ${linha.funcionario.setor}` : ""}
                        </TableCell>
                        <TableCell align="center">
                          {linha.carregandoSalario
                            ? "Buscando..."
                            : linha.salarioAtual !== null
                              ? linha.salarioAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                              : (linha.erroSalario ?? "-")}
                        </TableCell>
                        <TableCell align="center">
                          <CurrencyInput
                            value={linha.valorReajuste}
                            onValueChange={(valor) => handleValorChange(linha.funcionario.codigo, valor)}
                            disabled={enviando || linha.salarioAtual === null}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <NumberInput
                            suffix="%"
                            step="0.01"
                            min={0}
                            value={linha.percentualReajuste}
                            onChange={(event) => handlePercentualChange(linha.funcionario.codigo, event.target.value)}
                            disabled={enviando || linha.salarioAtual === null}
                          />
                        </TableCell>
                        <TableCell align="center">
                          {novoSalario !== null
                            ? novoSalario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={linha.observacao}
                            onChange={(event) => handleObservacaoChange(linha.funcionario.codigo, event.target.value)}
                            placeholder="Opcional"
                            disabled={enviando}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <IconButton
                            icon={<Trash2 size={15} />}
                            label="Remover colaborador"
                            variant="danger"
                            onClick={() => handleRemover(linha.funcionario.codigo)}
                            disabled={enviando}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            <Field
              label="Observação"
              htmlFor="observacao"
              hint="Opcional — contexto geral para a direção, vale para todos os colaboradores desta solicitação."
            >
              <Textarea
                id="observacao"
                rows={3}
                value={observacao}
                onChange={(event) => setObservacao(event.target.value)}
                disabled={enviando}
              />
            </Field>

            {erroEnvio && <Alert variant="danger">{erroEnvio}</Alert>}

            <Stack direction="row" justify="end">
              <Button onClick={handleEnviar} disabled={!podeEnviar} loading={enviando}>
                Enviar para aprovação
              </Button>
            </Stack>
          </Stack>
        </Card>
      )}
    </PageContainer>
  );
}
