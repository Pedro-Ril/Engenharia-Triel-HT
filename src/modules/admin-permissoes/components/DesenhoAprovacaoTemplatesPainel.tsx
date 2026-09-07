"use client";

import { useEffect, useState } from "react";
import { FileSliders, Plus } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { Dropdown } from "@/components/ui/Dropdown";
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
import { TemplateDetalhe } from "@/modules/desenho-aprovacao/components/TemplateDetalhe";
import type { Template } from "@/modules/desenho-aprovacao/types/template.types";

import { criarTemplateDesenhoAdmin, listarTemplatesDesenhoAdmin } from "../services/adminPermissoes.service";
import type { FeedbackHandler } from "../types/toast.types";

interface DesenhoAprovacaoTemplatesPainelProps {
  onFeedback: FeedbackHandler;
}

interface FormularioTemplate {
  nome: string;
  descricao: string;
  formatoPapel: string;
  orientacao: "horizontal" | "vertical";
  larguraMm: string;
  alturaMm: string;
}

const formularioInicial: FormularioTemplate = {
  nome: "",
  descricao: "",
  formatoPapel: "A3",
  orientacao: "horizontal",
  larguraMm: "420",
  alturaMm: "297",
};

const OPCOES_FORMATO = ["A0", "A1", "A2", "A3", "A4", "custom"].map((valor) => ({ value: valor, label: valor }));
const OPCOES_ORIENTACAO = [
  { value: "horizontal", label: "Horizontal" },
  { value: "vertical", label: "Vertical" },
];

export function DesenhoAprovacaoTemplatesPainel({ onFeedback }: DesenhoAprovacaoTemplatesPainelProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [templateSelecionadoId, setTemplateSelecionadoId] = useState<string | null>(null);

  const [modalAberto, setModalAberto] = useState(false);
  const [formulario, setFormulario] = useState<FormularioTemplate>(formularioInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    listarTemplatesDesenhoAdmin().then((lista) => {
      if (cancelado) return;
      setTemplates(lista);
      setCarregando(false);
    });

    return () => {
      cancelado = true;
    };
  }, []);

  function abrirNovo() {
    setFormulario(formularioInicial);
    setErro(null);
    setModalAberto(true);
  }

  async function handleSalvar() {
    if (!formulario.nome.trim() || formulario.nome.trim().length < 3) {
      setErro("O nome deve ter pelo menos 3 caracteres.");
      return;
    }

    const larguraMm = Number(formulario.larguraMm);
    const alturaMm = Number(formulario.alturaMm);

    if (!Number.isFinite(larguraMm) || larguraMm <= 0 || !Number.isFinite(alturaMm) || alturaMm <= 0) {
      setErro("Largura e altura devem ser números maiores que zero.");
      return;
    }

    setErro(null);
    setSalvando(true);

    const resultado = await criarTemplateDesenhoAdmin({
      nome: formulario.nome.trim(),
      descricao: formulario.descricao.trim() || null,
      formatoPapel: formulario.formatoPapel,
      orientacao: formulario.orientacao,
      larguraMm,
      alturaMm,
    });

    setSalvando(false);

    if (!resultado.ok || !resultado.data) {
      setErro(resultado.message ?? "Não foi possível criar o template.");
      return;
    }

    setModalAberto(false);
    setTemplates((atual) => [resultado.data!, ...atual]);
    onFeedback("success", "Template criado", `"${resultado.data.nome}" foi criado como rascunho.`);
  }

  const templateSelecionado = templates.find((item) => item.id === templateSelecionadoId) ?? null;

  if (templateSelecionado) {
    return (
      <TemplateDetalhe
        template={templateSelecionado}
        onVoltar={() => setTemplateSelecionadoId(null)}
        onTemplateAtualizado={(atualizado) => {
          setTemplates((atual) => atual.map((item) => (item.id === atualizado.id ? atualizado : item)));
        }}
        onFeedback={onFeedback}
      />
    );
  }

  return (
    <Stack gap={20}>
      <Card
        title="Templates de desenho de aprovação"
        description="Sistema de templates SVG dinâmicos — cada produto pode ter um template com campos e geometria próprios, sem precisar de um gerador novo em código."
        actions={
          <Button onClick={abrirNovo}>
            <Plus size={16} />
            Novo template
          </Button>
        }
      >
        {carregando ? (
          <Loader label="Carregando templates..." centered />
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<FileSliders size={32} />}
            title="Nenhum template cadastrado"
            description='Crie um novo template ou use "Novo template" para começar a configurar um produto.'
          />
        ) : (
          <Table minWidth={720}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Código</TableHeaderCell>
                <TableHeaderCell>Nome</TableHeaderCell>
                <TableHeaderCell>Formato</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Versão publicada</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((template) => (
                <TableRow
                  key={template.id}
                  onClick={() => setTemplateSelecionadoId(template.id)}
                  style={{ cursor: "pointer" }}
                >
                  <TableCell>{template.codigo}</TableCell>
                  <TableCell>{template.nome}</TableCell>
                  <TableCell>
                    {template.formatoPapel} · {template.orientacao === "horizontal" ? "Horizontal" : "Vertical"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={template.status === "ativo" ? "success" : "neutral"}>
                      {template.status === "ativo" ? "Ativo" : "Arquivado"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {template.versaoPublicadaId ? (
                      <Badge variant="info">Publicada</Badge>
                    ) : (
                      <Badge variant="neutral">Nenhuma</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        open={modalAberto}
        title="Novo template"
        description="Depois de criado, configure os elementos e publique uma versão."
        size="medium"
        onClose={() => setModalAberto(false)}
        footer={
          <Stack direction="row" gap={8} justify="end">
            <Button variant="secondary" onClick={() => setModalAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} loading={salvando}>
              Criar template
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

          <Field label="Nome" required htmlFor="template-nome">
            <Input
              id="template-nome"
              value={formulario.nome}
              onChange={(event) => setFormulario((atual) => ({ ...atual, nome: event.target.value }))}
              placeholder='Ex: "Aves — A3 horizontal"'
            />
          </Field>

          <Field label="Descrição" htmlFor="template-descricao">
            <Textarea
              id="template-descricao"
              value={formulario.descricao}
              onChange={(event) => setFormulario((atual) => ({ ...atual, descricao: event.target.value }))}
              rows={3}
            />
          </Field>

          <FormGrid columns={2}>
            <Field label="Formato de papel" required>
              <Dropdown
                value={formulario.formatoPapel}
                options={OPCOES_FORMATO}
                onValueChange={(value) => setFormulario((atual) => ({ ...atual, formatoPapel: value }))}
              />
            </Field>

            <Field label="Orientação" required>
              <Dropdown
                value={formulario.orientacao}
                options={OPCOES_ORIENTACAO}
                onValueChange={(value) =>
                  setFormulario((atual) => ({ ...atual, orientacao: value as "horizontal" | "vertical" }))
                }
              />
            </Field>

            <Field label="Largura (mm)" required>
              <NumberInput
                value={formulario.larguraMm}
                onChange={(event) => setFormulario((atual) => ({ ...atual, larguraMm: event.target.value }))}
              />
            </Field>

            <Field label="Altura (mm)" required>
              <NumberInput
                value={formulario.alturaMm}
                onChange={(event) => setFormulario((atual) => ({ ...atual, alturaMm: event.target.value }))}
              />
            </Field>
          </FormGrid>
        </Stack>
      </Modal>
    </Stack>
  );
}
