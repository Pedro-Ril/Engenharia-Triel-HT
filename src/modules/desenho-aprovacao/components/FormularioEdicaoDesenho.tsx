"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";

import {
  Autocomplete,
  type AutocompleteOption,
} from "@/components/ui/Autocomplete";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DateInput } from "@/components/ui/DateInput";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import type { ApprovalRepresentation } from "@/modules/desenho-aprovacao/types/approval";
import type { CampoExtraTemplate } from "@/modules/desenho-aprovacao/types/template.types";

export interface DesenhoParaEdicao {
  id: string;
  atualizadoEm: string;

  cliente: string | null;
  produto: string | null;
  modelo: string | null;

  caminhao: string | null;
  cabine: string | null;

  comprimento: number | null;
  altura: number | null;

  capacidadeTon: number | null;
  volumeM3: number | null;

  compartimentos: number | null;
  peso: number | null;

  cargaDianteira: number | null;
  cargaTraseira: number | null;

  observacoes: string | null;

  tipoRepresentacao: ApprovalRepresentation;

  dataEmissao: string | null;
  previsaoAprovacao: string | null;

  incluirCotas: boolean;
  calculoAutomatico: boolean;
  incluirCaminhao: boolean;

  camposExtra: string | null;
}

interface ApiActionResponse {
  ok: boolean;
  message?: string;
}

const representationOptions: AutocompleteOption[] = [
  { value: "lateral", label: "Vista lateral" },
  { value: "superior", label: "Vista superior" },
  { value: "completo", label: "Representação completa" },
];

function getOptionalText(formData: FormData, fieldName: string): string | null {
  const value = formData.get(fieldName);

  if (typeof value !== "string") return null;

  const normalizedValue = value.trim();
  return normalizedValue || null;
}

function getRequiredText(formData: FormData, fieldName: string, fieldLabel: string): string {
  const value = getOptionalText(formData, fieldName);

  if (!value) {
    throw new Error(`O campo ${fieldLabel} é obrigatório.`);
  }

  return value;
}

function getOptionalNumber(formData: FormData, fieldName: string, fieldLabel: string): number | null {
  const value = formData.get(fieldName);

  if (typeof value !== "string" || !value.trim()) return null;

  const normalizedValue = Number(value.replace(",", "."));

  if (!Number.isFinite(normalizedValue)) {
    throw new Error(`O campo ${fieldLabel} deve ser um número válido.`);
  }

  return normalizedValue;
}

interface FormularioEdicaoDesenhoProps {
  desenho: DesenhoParaEdicao;
  aberto: boolean;
  salvando: boolean;
  onSalvandoChange: (value: boolean) => void;
  representacaoSelecionada: AutocompleteOption | null;
  onRepresentacaoChange: (option: AutocompleteOption | null) => void;
  onClose: () => void;
  onSalvo: () => Promise<void>;
  onToast: (variant: "success" | "danger", title: string, description: string) => void;
}

export function FormularioEdicaoDesenho({
  desenho,
  aberto,
  salvando,
  onSalvandoChange,
  representacaoSelecionada,
  onRepresentacaoChange,
  onClose,
  onSalvo,
  onToast,
}: FormularioEdicaoDesenhoProps) {
  const [camposExtraDefinicoes, setCamposExtraDefinicoes] = useState<CampoExtraTemplate[]>([]);
  const [valoresCamposExtra, setValoresCamposExtra] = useState<Record<string, string>>({});

  useEffect(() => {
    const produto = desenho.produto?.trim();

    if (!produto) {
      setCamposExtraDefinicoes([]);
      return;
    }

    let cancelado = false;

    const query = desenho.modelo ? `?modelo=${encodeURIComponent(desenho.modelo)}` : "";

    fetch(`/api/desenho-aprovacao/templates/${encodeURIComponent(produto)}/campos${query}`)
      .then((response) => response.json())
      .then((payload: { ok: boolean; data?: CampoExtraTemplate[] }) => {
        if (cancelado) return;

        const definicoes = payload.ok ? payload.data ?? [] : [];
        setCamposExtraDefinicoes(definicoes);

        const salvos: Record<string, unknown> = desenho.camposExtra
          ? JSON.parse(desenho.camposExtra)
          : {};

        const valoresIniciais: Record<string, string> = {};

        for (const definicao of definicoes) {
          const valor = salvos[definicao.chave];
          if (valor !== undefined && valor !== null) {
            valoresIniciais[definicao.chave] = String(valor);
          }
        }

        setValoresCamposExtra(valoresIniciais);
      })
      .catch(() => {
        if (!cancelado) setCamposExtraDefinicoes([]);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desenho.produto, desenho.modelo]);

  function fecharEdicao() {
    if (salvando) return;
    onClose();
  }

  async function salvarEdicao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onSalvandoChange(true);

    try {
      const formData = new FormData(event.currentTarget);

      const cliente = getRequiredText(formData, "cliente", "Cliente");
      const produto = getRequiredText(formData, "produto", "Produto");
      const dataEmissao = getRequiredText(formData, "dataEmissao", "Data de emissão");
      const previsaoAprovacao = getOptionalText(formData, "previsaoAprovacao");

      if (previsaoAprovacao && previsaoAprovacao < dataEmissao) {
        throw new Error("A previsão de aprovação não pode ser anterior à data de emissão.");
      }

      const compartimentos = getOptionalNumber(formData, "compartimentos", "Compartimentos");

      if (compartimentos !== null && !Number.isInteger(compartimentos)) {
        throw new Error("O campo Compartimentos deve ser um número inteiro.");
      }

      const tipoRepresentacao = (representacaoSelecionada?.value ??
        desenho.tipoRepresentacao) as ApprovalRepresentation;

      const camposExtra: Record<string, unknown> = {};

      for (const definicao of camposExtraDefinicoes) {
        const bruto = valoresCamposExtra[definicao.chave];

        if (!bruto) {
          if (definicao.obrigatorio) {
            throw new Error(`O campo "${definicao.rotulo}" é obrigatório.`);
          }

          continue;
        }

        camposExtra[definicao.chave] = definicao.tipoDado === "numero" ? Number(bruto) : bruto;
      }

      const requestBody = {
        cliente,
        produto,
        modelo: getOptionalText(formData, "modelo"),
        caminhao: getOptionalText(formData, "caminhao"),
        cabine: getOptionalText(formData, "cabine"),
        comprimento: getOptionalNumber(formData, "comprimento", "Comprimento"),
        altura: getOptionalNumber(formData, "altura", "Altura"),
        capacidadeTon: getOptionalNumber(formData, "capacidadeTon", "Capacidade"),
        volumeM3: getOptionalNumber(formData, "volumeM3", "Volume"),
        compartimentos,
        peso: getOptionalNumber(formData, "peso", "Peso"),
        cargaDianteira: getOptionalNumber(formData, "cargaDianteira", "Carga dianteira"),
        cargaTraseira: getOptionalNumber(formData, "cargaTraseira", "Carga traseira"),
        observacoes: getOptionalText(formData, "observacoes"),
        tipoRepresentacao,
        dataEmissao,
        previsaoAprovacao,
        incluirCotas: formData.has("incluirCotas"),
        calculoAutomatico: formData.has("calculoAutomatico"),
        incluirCaminhao: formData.has("incluirCaminhao"),
        camposExtra,
      };

      const response = await fetch(`/api/desenho-aprovacao/${encodeURIComponent(desenho.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(requestBody),
      });

      const payload = (await response.json()) as ApiActionResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "Não foi possível atualizar o desenho.");
      }

      onClose();
      await onSalvo();

      onToast(
        "success",
        "Dados atualizados",
        payload.message ?? "Os dados do desenho foram atualizados com sucesso."
      );
    } catch (error) {
      console.error("Erro ao atualizar desenho:", error);

      onToast(
        "danger",
        "Erro ao atualizar",
        error instanceof Error ? error.message : "Não foi possível atualizar o desenho."
      );
    } finally {
      onSalvandoChange(false);
    }
  }

  return (
    <Modal
      open={aberto}
      title="Editar dados do desenho"
      description="As alterações serão utilizadas na próxima revisão gerada."
      onClose={fecharEdicao}
      footer={
        <Stack direction="row" gap={10} justify="end" wrap>
          <Button type="button" variant="secondary" disabled={salvando} onClick={fecharEdicao}>
            Cancelar
          </Button>

          <Button type="submit" form="form-editar-desenho" loading={salvando} loadingLabel="Salvando...">
            <Save size={17} aria-hidden="true" />
            Salvar alterações
          </Button>
        </Stack>
      }
    >
      <form
        id="form-editar-desenho"
        key={`${desenho.id}-${desenho.atualizadoEm}`}
        onSubmit={salvarEdicao}
      >
        <Stack gap={22}>
          <Alert variant="info" title="Edição do cadastro">
            O histórico e as revisões anteriores não serão alterados. Uma nova revisão só será criada
            quando você executar a ação de geração.
          </Alert>

          <Card title="Identificação" description="Dados principais do desenho." allowOverflow>
            <FormGrid columns={3}>
              <Field label="Cliente" htmlFor="editar-cliente" required>
                <Input
                  id="editar-cliente"
                  name="cliente"
                  defaultValue={desenho.cliente ?? ""}
                  maxLength={200}
                  required
                  disabled={salvando}
                />
              </Field>

              <Field label="Produto" htmlFor="editar-produto" required>
                <Input
                  id="editar-produto"
                  name="produto"
                  defaultValue={desenho.produto ?? ""}
                  maxLength={200}
                  required
                  disabled={salvando}
                />
              </Field>

              <Field label="Modelo" htmlFor="editar-modelo">
                <Input
                  id="editar-modelo"
                  name="modelo"
                  defaultValue={desenho.modelo ?? ""}
                  maxLength={100}
                  disabled={salvando}
                />
              </Field>

              <Field label="Representação" htmlFor="editar-representacao">
                <Autocomplete
                  id="editar-representacao"
                  name="tipoRepresentacao"
                  options={representationOptions}
                  selectedOption={representacaoSelecionada}
                  onSelect={onRepresentacaoChange}
                  placeholder="Selecione a representação"
                />
              </Field>

              <Field label="Data de emissão" htmlFor="editar-data-emissao" required>
                <DateInput
                  id="editar-data-emissao"
                  name="dataEmissao"
                  defaultValue={desenho.dataEmissao ?? ""}
                  required
                  disabled={salvando}
                />
              </Field>

              <Field label="Previsão de aprovação" htmlFor="editar-previsao-aprovacao">
                <DateInput
                  id="editar-previsao-aprovacao"
                  name="previsaoAprovacao"
                  defaultValue={desenho.previsaoAprovacao ?? ""}
                  min={desenho.dataEmissao ?? undefined}
                  disabled={salvando}
                />
              </Field>
            </FormGrid>
          </Card>

          {camposExtraDefinicoes.length > 0 && (
            <Card
              title="Campos adicionais"
              description="Campos específicos do template configurado para este produto."
            >
              <FormGrid columns={3}>
                {camposExtraDefinicoes.map((definicao) => (
                  <Field
                    key={definicao.chave}
                    label={definicao.rotulo}
                    htmlFor={`editar-campo-extra-${definicao.chave}`}
                    required={definicao.obrigatorio}
                  >
                    {definicao.tipoDado === "numero" ? (
                      <NumberInput
                        id={`editar-campo-extra-${definicao.chave}`}
                        suffix={definicao.unidadePadrao ?? undefined}
                        value={valoresCamposExtra[definicao.chave] ?? ""}
                        onChange={(event) =>
                          setValoresCamposExtra((atual) => ({
                            ...atual,
                            [definicao.chave]: event.target.value,
                          }))
                        }
                        disabled={salvando}
                      />
                    ) : definicao.tipoDado === "data" ? (
                      <DateInput
                        id={`editar-campo-extra-${definicao.chave}`}
                        value={valoresCamposExtra[definicao.chave] ?? ""}
                        onValueChange={(value) =>
                          setValoresCamposExtra((atual) => ({
                            ...atual,
                            [definicao.chave]: value,
                          }))
                        }
                        disabled={salvando}
                      />
                    ) : definicao.tipoDado === "booleano" ? (
                      <Switch
                        id={`editar-campo-extra-${definicao.chave}`}
                        label={definicao.rotulo}
                        checked={valoresCamposExtra[definicao.chave] === "true"}
                        onChange={(event) =>
                          setValoresCamposExtra((atual) => ({
                            ...atual,
                            [definicao.chave]: event.target.checked ? "true" : "",
                          }))
                        }
                        disabled={salvando}
                      />
                    ) : (
                      <Input
                        id={`editar-campo-extra-${definicao.chave}`}
                        value={valoresCamposExtra[definicao.chave] ?? ""}
                        onChange={(event) =>
                          setValoresCamposExtra((atual) => ({
                            ...atual,
                            [definicao.chave]: event.target.value,
                          }))
                        }
                        disabled={salvando}
                      />
                    )}
                  </Field>
                ))}
              </FormGrid>
            </Card>
          )}

          <Card title="Veículo" description="Informações do caminhão.">
            <FormGrid columns={2}>
              <Field label="Caminhão" htmlFor="editar-caminhao">
                <Input
                  id="editar-caminhao"
                  name="caminhao"
                  defaultValue={desenho.caminhao ?? ""}
                  maxLength={150}
                  disabled={salvando}
                />
              </Field>

              <Field label="Cabine" htmlFor="editar-cabine">
                <Input
                  id="editar-cabine"
                  name="cabine"
                  defaultValue={desenho.cabine ?? ""}
                  maxLength={100}
                  disabled={salvando}
                />
              </Field>
            </FormGrid>
          </Card>

          <Card title="Dimensões e capacidade" description="Parâmetros técnicos utilizados pelo gerador.">
            <FormGrid columns={4}>
              <Field label="Comprimento" htmlFor="editar-comprimento">
                <NumberInput
                  id="editar-comprimento"
                  name="comprimento"
                  defaultValue={desenho.comprimento ?? undefined}
                  min={0}
                  step={1}
                  suffix="mm"
                  disabled={salvando}
                />
              </Field>

              <Field label="Altura" htmlFor="editar-altura">
                <NumberInput
                  id="editar-altura"
                  name="altura"
                  defaultValue={desenho.altura ?? undefined}
                  min={0}
                  step={1}
                  suffix="mm"
                  disabled={salvando}
                />
              </Field>

              <Field label="Capacidade" htmlFor="editar-capacidade">
                <NumberInput
                  id="editar-capacidade"
                  name="capacidadeTon"
                  defaultValue={desenho.capacidadeTon ?? undefined}
                  min={0}
                  step={0.01}
                  suffix="t"
                  disabled={salvando}
                />
              </Field>

              <Field label="Volume" htmlFor="editar-volume">
                <NumberInput
                  id="editar-volume"
                  name="volumeM3"
                  defaultValue={desenho.volumeM3 ?? undefined}
                  min={0}
                  step={0.01}
                  suffix="m³"
                  disabled={salvando}
                />
              </Field>

              <Field label="Compartimentos" htmlFor="editar-compartimentos">
                <NumberInput
                  id="editar-compartimentos"
                  name="compartimentos"
                  defaultValue={desenho.compartimentos ?? undefined}
                  min={0}
                  step={1}
                  disabled={salvando}
                />
              </Field>

              <Field label="Peso" htmlFor="editar-peso">
                <NumberInput
                  id="editar-peso"
                  name="peso"
                  defaultValue={desenho.peso ?? undefined}
                  min={0}
                  step={0.01}
                  suffix="kg"
                  disabled={salvando}
                />
              </Field>

              <Field label="Carga dianteira" htmlFor="editar-carga-dianteira">
                <NumberInput
                  id="editar-carga-dianteira"
                  name="cargaDianteira"
                  defaultValue={desenho.cargaDianteira ?? undefined}
                  min={0}
                  max={100}
                  step={0.01}
                  suffix="%"
                  disabled={salvando}
                />
              </Field>

              <Field label="Carga traseira" htmlFor="editar-carga-traseira">
                <NumberInput
                  id="editar-carga-traseira"
                  name="cargaTraseira"
                  defaultValue={desenho.cargaTraseira ?? undefined}
                  min={0}
                  max={100}
                  step={0.01}
                  suffix="%"
                  disabled={salvando}
                />
              </Field>
            </FormGrid>
          </Card>

          <Card title="Configurações" description="Opções utilizadas na geração do desenho.">
            <Stack gap={16}>
              <Checkbox
                id="editar-incluir-cotas"
                name="incluirCotas"
                label="Incluir cotas no desenho"
                hint="As principais dimensões serão exibidas no documento."
                defaultChecked={desenho.incluirCotas}
                disabled={salvando}
              />

              <Switch
                id="editar-calculo-automatico"
                name="calculoAutomatico"
                label="Cálculo automático das dimensões"
                hint="Atualiza os cálculos conforme os valores informados."
                defaultChecked={desenho.calculoAutomatico}
                disabled={salvando}
              />

              <Switch
                id="editar-incluir-caminhao"
                name="incluirCaminhao"
                label="Incluir caminhão no desenho"
                hint="Exibe o caminhão no documento de aprovação."
                defaultChecked={desenho.incluirCaminhao}
                disabled={salvando}
              />
            </Stack>
          </Card>

          <Card title="Observações" description="Requisitos e informações complementares.">
            <Field label="Observações gerais" htmlFor="editar-observacoes">
              <Textarea
                id="editar-observacoes"
                name="observacoes"
                defaultValue={desenho.observacoes ?? ""}
                rows={6}
                maxLength={100000}
                disabled={salvando}
              />
            </Field>
          </Card>
        </Stack>
      </form>
    </Modal>
  );
}
