"use client";

import { useEffect, useMemo, useState } from "react";
import { Home, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Autocomplete } from "@/components/ui/Autocomplete";
import type { AutocompleteOption } from "@/components/ui/Autocomplete";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { Toast } from "@/components/ui/Toast";

import {
  atualizarAtivoDePara,
  buscarItensMateriaPrima,
  criarDePara,
  excluirDePara,
  listarDeParas,
} from "../services/deparaMateriaPrima.service";
import type { DeParaMateriaPrima, ItemMateriaPrima } from "../types/deparaMateriaPrima.types";

function formatarData(valorIso: string): string {
  return new Date(valorIso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function itemParaOpcao(item: ItemMateriaPrima): AutocompleteOption {
  return {
    value: item.codigo,
    label: `${item.codigo} — ${item.descricaoResumida}`,
  };
}

interface ToastState {
  open: boolean;
  variant: "success" | "danger";
  title: string;
  description: string;
}

const toastInicial: ToastState = {
  open: false,
  variant: "success",
  title: "",
  description: "",
};

export function DeparaMateriaPrimaPage() {
  const [itens, setItens] = useState<ItemMateriaPrima[]>([]);
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState<string | null>(null);
  const [deParas, setDeParas] = useState<DeParaMateriaPrima[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  const [origem, setOrigem] = useState<AutocompleteOption | null>(null);
  const [destino, setDestino] = useState<AutocompleteOption | null>(null);
  const [observacao, setObservacao] = useState("");
  const [criando, setCriando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<DeParaMateriaPrima | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const [toast, setToast] = useState<ToastState>(toastInicial);

  function mostrarToast(
    variant: ToastState["variant"],
    title: string,
    description: string
  ) {
    setToast({ open: true, variant, title, description });
  }

  async function carregarItens() {
    const itensResp = await buscarItensMateriaPrima();

    if (itensResp.ok && itensResp.data) {
      setItens(itensResp.data.itens);
      setUltimaSincronizacao(itensResp.data.ultimaSincronizacao);
      setErroCarregamento(null);
    } else {
      setErroCarregamento(
        itensResp.message ?? "Não foi possível carregar a lista de matérias-primas."
      );
    }
  }

  useEffect(() => {
    async function carregar() {
      setCarregando(true);

      const [, deParasData] = await Promise.all([carregarItens(), listarDeParas()]);

      setDeParas(deParasData);
      setCarregando(false);
    }

    carregar();
  }, []);

  const opcoesItens = useMemo(() => itens.map(itemParaOpcao), [itens]);

  async function handleCriar() {
    setErroForm(null);

    if (!origem || !destino) {
      setErroForm("Selecione a MP de origem e a MP de destino.");
      return;
    }

    if (origem.value === destino.value) {
      setErroForm("A MP de origem e a MP de destino não podem ser a mesma.");
      return;
    }

    if (!observacao.trim()) {
      setErroForm("Informe uma observação.");
      return;
    }

    setCriando(true);

    try {
      const itemOrigem = itens.find((item) => item.codigo === origem.value);
      const itemDestino = itens.find((item) => item.codigo === destino.value);

      const resultado = await criarDePara({
        codItemOrigem: origem.value,
        descItemOrigem: itemOrigem?.descricao ?? null,
        codItemDestino: destino.value,
        descItemDestino: itemDestino?.descricao ?? null,
        observacao: observacao.trim(),
      });

      if (resultado.ok && resultado.data) {
        setDeParas((atual) => [resultado.data as DeParaMateriaPrima, ...atual]);
        setOrigem(null);
        setDestino(null);
        setObservacao("");
        mostrarToast("success", "De-para criado", "O mapeamento foi salvo com sucesso.");
      } else {
        setErroForm(resultado.message ?? "Não foi possível criar o de-para.");
      }
    } finally {
      setCriando(false);
    }
  }

  async function handleAlternarAtivo(dePara: DeParaMateriaPrima, ativo: boolean) {
    setSalvandoId(dePara.id);

    try {
      const resultado = await atualizarAtivoDePara(dePara.id, ativo);

      if (resultado.ok && resultado.data) {
        const atualizado = resultado.data;
        setDeParas((atual) =>
          atual.map((item) => (item.id === dePara.id ? atualizado : item))
        );
      } else {
        mostrarToast(
          "danger",
          "Não foi possível atualizar",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setSalvandoId(null);
    }
  }

  async function handleConfirmarExclusao() {
    if (!excluindo) return;

    setConfirmandoExclusao(true);

    try {
      const resultado = await excluirDePara(excluindo.id);

      if (resultado.ok) {
        setDeParas((atual) => atual.filter((item) => item.id !== excluindo.id));
        mostrarToast("success", "De-para excluído", "O mapeamento foi removido.");
        setExcluindo(null);
      } else {
        mostrarToast(
          "danger",
          "Não foi possível excluir",
          resultado.message ?? "Tente novamente em instantes."
        );
      }
    } finally {
      setConfirmandoExclusao(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="De-Para de Matérias-Primas"
        description="Cadastre a troca de uma matéria-prima por outra, para orientar uma alteração em lote."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home /> },
          { label: "De-Para de Matérias-Primas" },
        ]}
      />

      <Card
        title="Novo de-para"
        description="Busque a MP de origem (a que será substituída) e a MP de destino (a nova)."
      >
        <Stack gap={16}>
          <Alert variant="warning" title="Atenção com projetos em execução">
            Se a troca de MP for realizada enquanto um projeto já está em execução, pode
            haver divergência nesse projeto — pedidos e ordens abertos antes da troca
            continuam com a MP antiga, e só os novos já sairão com a MP de destino definida
            aqui.
          </Alert>

          {erroCarregamento && <Alert variant="danger">{erroCarregamento}</Alert>}

          <p>
            Catálogo de matérias-primas:{" "}
            {ultimaSincronizacao
              ? `sincronizado em ${formatarData(ultimaSincronizacao)}`
              : "ainda não sincronizado — peça para um administrador sincronizar em Administração > Configurações > Matéria-Prima."}
          </p>

          <FormGrid columns={2}>
            <Field label="MP de origem" htmlFor="mpOrigem" hint="A matéria-prima que será substituída">
              <Autocomplete
                id="mpOrigem"
                options={opcoesItens}
                selectedOption={origem}
                onSelect={setOrigem}
                placeholder="Busque por código ou descrição"
                emptyMessage={carregando ? "Carregando itens..." : "Nenhum item encontrado."}
                disabled={carregando || criando}
                maxOptions={40}
              />
            </Field>

            <Field label="MP de destino" htmlFor="mpDestino" hint="A nova matéria-prima">
              <Autocomplete
                id="mpDestino"
                options={opcoesItens}
                selectedOption={destino}
                onSelect={setDestino}
                placeholder="Busque por código ou descrição"
                emptyMessage={carregando ? "Carregando itens..." : "Nenhum item encontrado."}
                disabled={carregando || criando}
                maxOptions={40}
              />
            </Field>
          </FormGrid>

          <Field label="Observação" htmlFor="observacao" required>
            <Textarea
              id="observacao"
              rows={3}
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
              placeholder="Explique o motivo dessa troca"
              disabled={criando}
            />
          </Field>

          {erroForm && <Alert variant="danger">{erroForm}</Alert>}

          <Stack direction="row" justify="end">
            <Button onClick={handleCriar} loading={criando} disabled={carregando}>
              Salvar de-para
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Card title="De-paras cadastrados">
        {carregando ? (
          <Loader label="Carregando de-paras..." />
        ) : deParas.length === 0 ? (
          <p>Nenhum de-para cadastrado ainda para a sua empresa.</p>
        ) : (
          <Table minWidth={900}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>MP de origem</TableHeaderCell>
                <TableHeaderCell>MP de destino</TableHeaderCell>
                <TableHeaderCell>Observação</TableHeaderCell>
                <TableHeaderCell>Criado por</TableHeaderCell>
                <TableHeaderCell>Criado em</TableHeaderCell>
                <TableHeaderCell align="center">Ativo</TableHeaderCell>
                <TableHeaderCell align="center">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {deParas.map((dePara) => (
                <TableRow key={dePara.id}>
                  <TableCell>
                    <strong>{dePara.codItemOrigem}</strong>
                    {dePara.descItemOrigem && <div>{dePara.descItemOrigem}</div>}
                  </TableCell>

                  <TableCell>
                    <strong>{dePara.codItemDestino}</strong>
                    {dePara.descItemDestino && <div>{dePara.descItemDestino}</div>}
                  </TableCell>

                  <TableCell>{dePara.observacao}</TableCell>
                  <TableCell>{dePara.criadoPor}</TableCell>
                  <TableCell>{formatarData(dePara.criadoEm)}</TableCell>

                  <TableCell align="center">
                    <Switch
                      label=""
                      compact
                      checked={dePara.ativo}
                      disabled={salvandoId === dePara.id}
                      onChange={(event) => handleAlternarAtivo(dePara, event.target.checked)}
                    />
                  </TableCell>

                  <TableCell align="center">
                    <Stack direction="row" justify="center">
                      <IconButton
                        icon={<Trash2 size={15} />}
                        label="Excluir de-para"
                        size="small"
                        variant="danger"
                        onClick={() => setExcluindo(dePara)}
                      />
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={excluindo !== null}
        title="Excluir de-para"
        message={
          <>
            Tem certeza que deseja excluir o de-para de{" "}
            <strong>{excluindo?.codItemOrigem}</strong> para{" "}
            <strong>{excluindo?.codItemDestino}</strong>?
          </>
        }
        confirmLabel="Excluir"
        variant="danger"
        loading={confirmandoExclusao}
        onClose={() => setExcluindo(null)}
        onConfirm={handleConfirmarExclusao}
      />

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
