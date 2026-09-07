"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
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
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";
import { criarVinculoTemplateAdmin } from "@/modules/admin-permissoes/services/adminPermissoes.service";

import type { VinculoTemplate } from "../types/template.types";

interface TemplateVinculoAbaProps {
  templateId: string;
  vinculos: VinculoTemplate[];
  onVinculoCriado: (vinculo: VinculoTemplate) => void;
  onFeedback: FeedbackHandler;
}

interface FormularioVinculo {
  produto: string;
  modelo: string;
  padrao: boolean;
  prioridade: string;
}

const formularioInicial: FormularioVinculo = { produto: "", modelo: "", padrao: false, prioridade: "100" };

export function TemplateVinculoAba({ templateId, vinculos, onVinculoCriado, onFeedback }: TemplateVinculoAbaProps) {
  const [modalAberto, setModalAberto] = useState(false);
  const [formulario, setFormulario] = useState<FormularioVinculo>(formularioInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSalvar() {
    if (!formulario.produto.trim() || formulario.produto.trim().length < 2) {
      setErro("Informe o nome do produto (mínimo 2 caracteres).");
      return;
    }

    const prioridade = Number(formulario.prioridade);

    if (!Number.isFinite(prioridade) || prioridade < 0) {
      setErro("A prioridade deve ser um número maior ou igual a zero.");
      return;
    }

    setErro(null);
    setSalvando(true);

    const resultado = await criarVinculoTemplateAdmin(templateId, {
      produto: formulario.produto.trim(),
      modelo: formulario.modelo.trim() || null,
      padrao: formulario.padrao,
      prioridade,
      vigenciaInicio: null,
      vigenciaFim: null,
    });

    setSalvando(false);

    if (!resultado.ok || !resultado.data) {
      setErro(resultado.message ?? "Não foi possível criar o vínculo.");
      return;
    }

    setModalAberto(false);
    setFormulario(formularioInicial);
    onVinculoCriado(resultado.data);
    onFeedback("success", "Vínculo criado", `Este template agora resolve para "${resultado.data.produto}".`);
  }

  return (
    <Card
      title="Vínculo com produtos"
      description='Liga esta versão publicada a um produto (e opcionalmente modelo). É essa ligação que faz o sistema encontrar o template certo na hora de gerar um desenho.'
      actions={
        <Button
          onClick={() => {
            setFormulario(formularioInicial);
            setErro(null);
            setModalAberto(true);
          }}
        >
          <Plus size={16} />
          Novo vínculo
        </Button>
      }
    >
      {vinculos.length === 0 ? (
        <EmptyState title="Nenhum vínculo cadastrado" description="Sem vínculo, este template nunca será usado automaticamente." />
      ) : (
        <Table minWidth={560}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Produto</TableHeaderCell>
              <TableHeaderCell>Modelo</TableHeaderCell>
              <TableHeaderCell>Padrão</TableHeaderCell>
              <TableHeaderCell>Prioridade</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {vinculos.map((vinculo) => (
              <TableRow key={vinculo.id}>
                <TableCell>{vinculo.produto}</TableCell>
                <TableCell>{vinculo.modelo ?? "—"}</TableCell>
                <TableCell>{vinculo.padrao ? <Badge variant="success">Padrão</Badge> : "—"}</TableCell>
                <TableCell>{vinculo.prioridade}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal
        open={modalAberto}
        title="Novo vínculo"
        size="small"
        onClose={() => setModalAberto(false)}
        footer={
          <Stack direction="row" gap={8} justify="end">
            <Button variant="secondary" onClick={() => setModalAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} loading={salvando}>
              Criar vínculo
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          {erro && (
            <div role="alert" style={{ color: "var(--danger-text)" }}>
              {erro}
            </div>
          )}

          <Field label="Produto" required htmlFor="vinculo-produto" hint='Deve bater com o valor salvo em "produto" do desenho.'>
            <Input
              id="vinculo-produto"
              value={formulario.produto}
              onChange={(event) => setFormulario((atual) => ({ ...atual, produto: event.target.value }))}
              placeholder="Ex: Aves"
            />
          </Field>

          <Field label="Modelo (opcional)" htmlFor="vinculo-modelo">
            <Input
              id="vinculo-modelo"
              value={formulario.modelo}
              onChange={(event) => setFormulario((atual) => ({ ...atual, modelo: event.target.value }))}
            />
          </Field>

          <FormGrid columns={2}>
            <Field label="Prioridade">
              <NumberInput
                value={formulario.prioridade}
                onChange={(event) => setFormulario((atual) => ({ ...atual, prioridade: event.target.value }))}
              />
            </Field>

            <Field label="Padrão do produto">
              <Switch
                label="Usar como padrão"
                checked={formulario.padrao}
                onChange={(event) => setFormulario((atual) => ({ ...atual, padrao: event.target.checked }))}
              />
            </Field>
          </FormGrid>
        </Stack>
      </Modal>
    </Card>
  );
}
