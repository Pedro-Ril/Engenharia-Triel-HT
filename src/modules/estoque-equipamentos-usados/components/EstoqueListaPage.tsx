"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Home, MonitorPlay, Plus, Trash2, Warehouse } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

import { excluirEquipamento, listarCamposComPendencia, listarEquipamentos } from "../services/estoque.service";
import type { CampoPendenciaConfig, Equipamento, StatusEquipamento } from "../types/estoque.types";
import { campoSistemaEstaVazio } from "../constants";

const STATUS_LABELS: Record<StatusEquipamento, string> = {
  em_estoque: "Em estoque",
  emprestado: "Emprestado",
  consignado: "Em consignação",
  baixado: "Baixado",
};

const STATUS_BADGE: Record<StatusEquipamento, "success" | "warning" | "info" | "neutral"> = {
  em_estoque: "success",
  emprestado: "warning",
  consignado: "info",
  baixado: "neutral",
};

const OPCOES_STATUS = [
  { value: "", label: "Todos os status" },
  ...(Object.keys(STATUS_LABELS) as StatusEquipamento[]).map((status) => ({
    value: status,
    label: STATUS_LABELS[status],
  })),
];

function formatarData(dataIso: string): string {
  return new Date(dataIso).toLocaleDateString("pt-BR");
}

/*
 * Código e descrição SEMPRE ficam em colunas separadas no banco
 * (nome_cliente/codigo_cliente) — "código | descrição" é só o formato
 * de exibição, remontado aqui na leitura, nunca gravado como string só.
 */
function formatarCodDescricao(codigo: string | null, descricao: string | null): string {
  if (codigo && descricao) return `${codigo} | ${descricao}`;
  return descricao || codigo || "-";
}

const POR_PAGINA = 20;

export function EstoqueListaPage() {
  const router = useRouter();

  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [pendenciaChave, setPendenciaChave] = useState("");
  const [pagina, setPagina] = useState(1);

  const [itens, setItens] = useState<Equipamento[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);

  const [pendenciasConfig, setPendenciasConfig] = useState<CampoPendenciaConfig[]>([]);

  const [equipamentoExcluindo, setEquipamentoExcluindo] = useState<Equipamento | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  useEffect(() => {
    listarCamposComPendencia().then(setPendenciasConfig);
  }, []);

  /*
   * Opções do filtro "Pendência" — deduplicadas por chave (o mesmo campo
   * de sistema pode estar marcado como "gera_pendencia" em mais de um
   * tipo, às vezes com rótulos diferentes; fica o primeiro encontrado).
   */
  const opcoesPendencia = useMemo(() => {
    const porChave = new Map<string, string>();
    for (const campo of pendenciasConfig) {
      if (!porChave.has(campo.chave)) porChave.set(campo.chave, campo.rotulo);
    }
    return [
      { value: "", label: "Todas" },
      ...Array.from(porChave.entries())
        .map(([chave, rotulo]) => ({ value: chave, label: `Sem ${rotulo}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [pendenciasConfig]);

  useEffect(() => {
    const temporizador = setTimeout(() => {
      setBusca(buscaDigitada);
      setPagina(1);
    }, 400);
    return () => clearTimeout(temporizador);
  }, [buscaDigitada]);

  function carregarLista() {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true);
    listarEquipamentos({
      status: (status as StatusEquipamento) || undefined,
      busca: busca || undefined,
      pendenciaChave: pendenciaChave || undefined,
      pagina,
      porPagina: POR_PAGINA,
    }).then((resultado) => {
      if (resultado) {
        setItens(resultado.itens);
        setTotal(resultado.total);
      }

      setCarregando(false);
    });
  }

  useEffect(() => {
    let cancelado = false;

    /*
     * setCarregando(true) tem que ficar AQUI dentro (não num handler de
     * evento nem no timeout do debounce) — o efeito só reexecuta quando
     * status/busca/pagina realmente mudam, então nunca fica "preso" em
     * true. Mover isso pra fora (ex: pro setTimeout do debounce) causa
     * um bug real: o timeout dispara de novo em toda digitação mesmo
     * sem mudança de valor, reancorando carregando=true sem nenhum
     * efeito subsequente pra voltar a false — loader trava pra sempre
     * (confirmado ao vivo com Playwright antes desta correção).
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCarregando(true);
    listarEquipamentos({
      status: (status as StatusEquipamento) || undefined,
      busca: busca || undefined,
      pendenciaChave: pendenciaChave || undefined,
      pagina,
      porPagina: POR_PAGINA,
    }).then((resultado) => {
      if (cancelado) return;

      if (resultado) {
        setItens(resultado.itens);
        setTotal(resultado.total);
      }

      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [status, busca, pendenciaChave, pagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  function pendenciasDoEquipamento(equipamento: Equipamento): CampoPendenciaConfig[] {
    return pendenciasConfig.filter(
      (campo) =>
        campo.tipoEquipamentoId === equipamento.tipoEquipamentoId &&
        campoSistemaEstaVazio(equipamento, campo.chave)
    );
  }

  async function handleConfirmarExclusao() {
    if (!equipamentoExcluindo) return;

    setErroExclusao(null);
    setExcluindo(true);

    try {
      const resultado = await excluirEquipamento(equipamentoExcluindo.id);

      if (resultado.ok) {
        setEquipamentoExcluindo(null);
        setConfirmandoExclusao(false);
        carregarLista();
      } else {
        setErroExclusao(resultado.message ?? "Não foi possível excluir o equipamento.");
      }
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Estoque de Equipamentos Usados"
        description="Controle de entrada, empréstimo, consignação e baixa de equipamentos usados."
        actions={
          <Stack direction="row" gap={8}>
            <Link href="/estoque-equipamentos-usados/painel" target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                <MonitorPlay size={16} />
                Painel de BI
              </Button>
            </Link>
            <Link href="/estoque-equipamentos-usados/nova">
              <Button>
                <Plus size={16} />
                Nova entrada
              </Button>
            </Link>
          </Stack>
        }
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          { label: "Estoque de Equipamentos Usados", current: true, icon: <Warehouse size={14} /> },
        ]}
      />

      <Card>
        <Stack gap={16}>
          <FormGrid columns={3}>
            <Field label="Buscar">
              <Input
                value={buscaDigitada}
                placeholder="Descrição, cliente, série, código ERP ou número"
                onChange={(event) => setBuscaDigitada(event.target.value)}
              />
            </Field>

            <Field label="Status">
              <Dropdown
                value={status}
                options={OPCOES_STATUS}
                onValueChange={(valor) => {
                  setStatus(valor);
                  setPagina(1);
                }}
              />
            </Field>

            {opcoesPendencia.length > 1 && (
              <Field label="Pendência">
                <Dropdown
                  value={pendenciaChave}
                  options={opcoesPendencia}
                  onValueChange={(valor) => {
                    setPendenciaChave(valor);
                    setPagina(1);
                  }}
                />
              </Field>
            )}
          </FormGrid>

          {carregando ? (
            <Loader label="Carregando equipamentos..." />
          ) : itens.length === 0 ? (
            <EmptyState
              icon={<Warehouse size={28} />}
              title="Nenhum equipamento encontrado"
              description="Sem equipamentos cadastrados para os filtros selecionados."
            />
          ) : (
            <>
              <Table minWidth={1080}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Nº</TableHeaderCell>
                    <TableHeaderCell>Descrição</TableHeaderCell>
                    <TableHeaderCell>Cliente</TableHeaderCell>
                    <TableHeaderCell>Marca/Modelo</TableHeaderCell>
                    <TableHeaderCell align="center">Status</TableHeaderCell>
                    <TableHeaderCell>Pendências</TableHeaderCell>
                    <TableHeaderCell>Cadastrado em</TableHeaderCell>
                    <TableHeaderCell align="center"> </TableHeaderCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {itens.map((equipamento) => {
                    const pendencias = pendenciasDoEquipamento(equipamento);

                    return (
                      <TableRow
                        key={equipamento.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => router.push(`/estoque-equipamentos-usados/${equipamento.id}`)}
                      >
                        <TableCell>#{equipamento.numero}</TableCell>
                        <TableCell>{equipamento.descricao}</TableCell>
                        <TableCell>
                          {formatarCodDescricao(equipamento.codigoCliente, equipamento.nomeCliente)}
                        </TableCell>
                        <TableCell>
                          {[equipamento.marca, equipamento.modelo].filter(Boolean).join(" / ") || "-"}
                        </TableCell>
                        <TableCell align="center">
                          <Badge variant={STATUS_BADGE[equipamento.status]}>
                            {STATUS_LABELS[equipamento.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {pendencias.length > 0 ? (
                            <Stack direction="row" gap={6} wrap>
                              {pendencias.map((campo) => (
                                <Badge key={campo.chave} variant="warning">
                                  Sem {campo.rotulo}
                                </Badge>
                              ))}
                            </Stack>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>{formatarData(equipamento.criadoEm)}</TableCell>
                        <TableCell align="center" onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu
                            label={`Ações do equipamento #${equipamento.numero}`}
                            align="end"
                            items={[
                              {
                                value: "ver",
                                label: "Ver detalhes",
                                icon: <Eye size={15} />,
                                onSelect: () => router.push(`/estoque-equipamentos-usados/${equipamento.id}`),
                              },
                              {
                                value: "excluir",
                                label: "Excluir",
                                icon: <Trash2 size={15} />,
                                danger: true,
                                separatorBefore: true,
                                onSelect: () => {
                                  setEquipamentoExcluindo(equipamento);
                                  setErroExclusao(null);
                                  setConfirmandoExclusao(true);
                                },
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
            </>
          )}
        </Stack>
      </Card>

      <ConfirmDialog
        open={confirmandoExclusao}
        title="Excluir equipamento?"
        variant="danger"
        message={
          equipamentoExcluindo
            ? erroExclusao ??
              `O equipamento #${equipamentoExcluindo.numero} (${equipamentoExcluindo.descricao}) e todo o histórico de movimentações, evidências e anexos serão apagados definitivamente. Essa ação fica registrada nos logs do sistema.`
            : ""
        }
        confirmLabel="Excluir"
        onConfirm={handleConfirmarExclusao}
        onClose={() => {
          if (excluindo) return;
          setEquipamentoExcluindo(null);
          setConfirmandoExclusao(false);
          setErroExclusao(null);
        }}
      />
    </PageContainer>
  );
}
