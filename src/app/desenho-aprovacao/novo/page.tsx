"use client";

import {
  type FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Home,
  Info,
  Save,
} from "lucide-react";

import {
  Autocomplete,
  type AutocompleteOption,
} from "@/components/ui/Autocomplete";
import { Alert } from "@/components/ui/Alert";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DateInput } from "@/components/ui/DateInput";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { NumberInput } from "@/components/ui/NumberInput";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";

type ApprovalRepresentation =
  | "lateral"
  | "superior"
  | "completo";

interface CreateApprovalResponse {
  ok: boolean;
  message?: string;

  data?: {
    id: string;
    numero: string;
    status?: string;
  };
}

const productOptions: AutocompleteOption[] = [
  {
    value: "Silo Graneleiro",
    label: "Silo Graneleiro",
  },
  {
    value: "Aves",
    label: "Aves",
  },
  {
    value: "Suinos",
    label: "Suinos",
  },
];

const modelOptions: AutocompleteOption[] = [
  {
    value: "Pratice Aço",
    label: "Pratice Aço",
  },
  {
    value: "Practice Aluminio",
    label: "Practice Aluminio",
  },
  {
    value: "Mega Aço",
    label: "Mega Aço",
  },
  {
    value: "Mega Aluminio",
    label: "Mega Aluminio",
  },
  {
    value: "Smart",
    label: "Smart",
  },
];

const representationOptions: AutocompleteOption[] = [
  {
    value: "lateral",
    label: "Vista lateral",
  },
  {
    value: "superior",
    label: "Vista superior",
  },
  {
    value: "completo",
    label: "Representação completa",
  },
];

const initialRepresentationOption =
  representationOptions.find(
    (option) =>
      option.value === "completo"
  ) ?? null;

function getCurrentLocalDate() {
  const currentDate = new Date();

  const year =
    currentDate.getFullYear();

  const month = String(
    currentDate.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    currentDate.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getOptionalText(
  formData: FormData,
  fieldName: string
): string | null {
  const value =
    formData.get(fieldName);

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue =
    value.trim();

  return normalizedValue || null;
}

function getRequiredText(
  formData: FormData,
  fieldName: string,
  fieldLabel: string
): string {
  const value = getOptionalText(
    formData,
    fieldName
  );

  if (!value) {
    throw new Error(
      `O campo ${fieldLabel} é obrigatório.`
    );
  }

  return value;
}

function getOptionalNumber(
  formData: FormData,
  fieldName: string,
  fieldLabel: string
): number | null {
  const value =
    formData.get(fieldName);

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  const normalizedValue = Number(
    value.replace(",", ".")
  );

  if (!Number.isFinite(normalizedValue)) {
    throw new Error(
      `O campo ${fieldLabel} deve ser um número válido.`
    );
  }

  return normalizedValue;
}

export default function NovoDesenhoPage() {
  const router = useRouter();

  const [
    produtoSelecionado,
    setProdutoSelecionado,
  ] = useState<AutocompleteOption | null>(
    null
  );

  const [
    modeloSelecionado,
    setModeloSelecionado,
  ] = useState<AutocompleteOption | null>(
    null
  );

  const [
    representacaoSelecionada,
    setRepresentacaoSelecionada,
  ] = useState<AutocompleteOption | null>(
    initialRepresentationOption
  );

  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] =
    useState<string | null>(null);

  const [
    cargaDianteiraDigitada,
    setCargaDianteiraDigitada,
  ] = useState<number | null>(null);

  const [
    cargaTraseiraDigitada,
    setCargaTraseiraDigitada,
  ] = useState<number | null>(null);

  const [
    erroCargas,
    setErroCargas,
  ] = useState<string | null>(null);

  const somaCargas =
    (cargaDianteiraDigitada ?? 0) +
    (cargaTraseiraDigitada ?? 0);

  const limiteCargaDianteira =
    Math.max(
      0,
      100 -
        (cargaTraseiraDigitada ?? 0)
    );

  const limiteCargaTraseira =
    Math.max(
      0,
      100 -
        (cargaDianteiraDigitada ?? 0)
    );

  const possuiCargaInformada =
    cargaDianteiraDigitada !== null ||
    cargaTraseiraDigitada !== null;

  function getInputNumber(
    value: string
  ): number | null {
    const normalizedValue =
      value.trim().replace(",", ".");

    if (!normalizedValue) {
      return null;
    }

    const numberValue =
      Number(normalizedValue);

    return Number.isFinite(numberValue)
      ? numberValue
      : null;
  }

  function handleCargaInput(
    event: FormEvent<HTMLFormElement>
  ) {
    const target = event.target;

    if (
      !(target instanceof HTMLInputElement) ||
      (
        target.name !==
          "cargaDianteira" &&
        target.name !==
          "cargaTraseira"
      )
    ) {
      return;
    }

    const form = event.currentTarget;

    const cargaDianteiraInput =
      form.elements.namedItem(
        "cargaDianteira"
      );

    const cargaTraseiraInput =
      form.elements.namedItem(
        "cargaTraseira"
      );

    const cargaDianteira =
      cargaDianteiraInput instanceof
      HTMLInputElement
        ? getInputNumber(
            cargaDianteiraInput.value
          )
        : null;

    const cargaTraseira =
      cargaTraseiraInput instanceof
      HTMLInputElement
        ? getInputNumber(
            cargaTraseiraInput.value
          )
        : null;

    setCargaDianteiraDigitada(
      cargaDianteira
    );

    setCargaTraseiraDigitada(
      cargaTraseira
    );

    const soma =
      (cargaDianteira ?? 0) +
      (cargaTraseira ?? 0);

    const mensagemErro =
      soma > 100
        ? `A soma das cargas está em ${soma.toLocaleString(
            "pt-BR",
            {
              maximumFractionDigits: 2,
            }
          )}%. Reduza pelo menos ${(
            soma - 100
          ).toLocaleString(
            "pt-BR",
            {
              maximumFractionDigits: 2,
            }
          )}%.`
        : "";

    setErroCargas(
      mensagemErro || null
    );

    if (
      cargaDianteiraInput instanceof
      HTMLInputElement
    ) {
      cargaDianteiraInput.setCustomValidity(
        mensagemErro
      );
    }

    if (
      cargaTraseiraInput instanceof
      HTMLInputElement
    ) {
      cargaTraseiraInput.setCustomValidity(
        mensagemErro
      );
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErro(null);

    try {
      const formData =
        new FormData(
          event.currentTarget
        );

      const cliente =
        getRequiredText(
          formData,
          "cliente",
          "Cliente"
        );

      const produto =
        produtoSelecionado?.value.trim();

      if (!produto) {
        throw new Error(
          "O campo Produto é obrigatório."
        );
      }

      const dataEmissao =
        getRequiredText(
          formData,
          "dataEmissao",
          "Data de emissão"
        );

      const previsaoAprovacao =
        getOptionalText(
          formData,
          "previsaoAprovacao"
        );

      if (
        previsaoAprovacao &&
        previsaoAprovacao <
          dataEmissao
      ) {
        throw new Error(
          "A previsão de aprovação não pode ser anterior à data de emissão."
        );
      }

      const compartimentos =
        getOptionalNumber(
          formData,
          "compartimentos",
          "Compartimentos"
        );

      if (
        compartimentos !== null &&
        !Number.isInteger(
          compartimentos
        )
      ) {
        throw new Error(
          "O campo Compartimentos deve ser um número inteiro."
        );
      }

      const cargaDianteira =
        getOptionalNumber(
          formData,
          "cargaDianteira",
          "Carga dianteira"
        );

      const cargaTraseira =
        getOptionalNumber(
          formData,
          "cargaTraseira",
          "Carga traseira"
        );

      const somaCargas =
        (cargaDianteira ?? 0) +
        (cargaTraseira ?? 0);

      if (somaCargas > 100) {
        throw new Error(
          "A soma da Carga dianteira com a Carga traseira não pode ultrapassar 100%."
        );
      }

      const requestBody = {
        cliente,
        produto,

        modelo:
          modeloSelecionado?.value ??
          null,

        caminhao: getOptionalText(
          formData,
          "caminhao"
        ),

        cabine: getOptionalText(
          formData,
          "cabine"
        ),

        comprimento:
          getOptionalNumber(
            formData,
            "comprimento",
            "Comprimento"
          ),

        altura: getOptionalNumber(
          formData,
          "altura",
          "Altura"
        ),

        capacidadeTon:
          getOptionalNumber(
            formData,
            "capacidadeTon",
            "Capacidade"
          ),

        volumeM3:
          getOptionalNumber(
            formData,
            "volumeM3",
            "Volume"
          ),

        compartimentos,

        peso: getOptionalNumber(
          formData,
          "peso",
          "Peso"
        ),

        cargaDianteira,
        cargaTraseira,

        observacoes:
          getOptionalText(
            formData,
            "observacoes"
          ),

        tipoRepresentacao:
          (
            representacaoSelecionada?.value ??
            "completo"
          ) as ApprovalRepresentation,

        dataEmissao,
        previsaoAprovacao,

        incluirCotas:
          formData.has(
            "incluirCotas"
          ),

        calculoAutomatico:
          formData.has(
            "calculoAutomatico"
          ),

        incluirCaminhao:
          formData.has(
            "incluirCaminhao"
          ),

        usuario: "portal-web",
      };

      setSalvando(true);

      const response = await fetch(
        "/api/desenho-aprovacao",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json; charset=utf-8",
          },
          body: JSON.stringify(
            requestBody
          ),
        }
      );

      const payload =
        (await response.json()) as
          CreateApprovalResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message ??
            "Não foi possível criar o desenho."
        );
      }

      if (payload.data?.id) {
        router.push(
          `/desenho-aprovacao/${payload.data.id}`
        );
      } else {
        router.push(
          "/desenho-aprovacao"
        );
      }

      router.refresh();
    } catch (error) {
      console.error(
        "Erro ao criar desenho:",
        error
      );

      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível criar o desenho."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Novo desenho de aprovação"
        description="Preencha os dados necessários para criar um novo desenho."
        actions={
          <Button
            type="button"
            variant="secondary"
            disabled={salvando}
            onClick={() =>
              router.push(
                "/desenho-aprovacao"
              )
            }
          >
            <ArrowLeft
              size={17}
              aria-hidden="true"
            />

            Voltar
          </Button>
        }
      />

      <Breadcrumb
        items={[
          {
            label: "Início",
            href: "/",
            icon: <Home />,
          },
          {
            label:
              "Desenhos de Aprovação",
            href: "/desenho-aprovacao",
          },
          {
            label: "Novo desenho",
            current: true,
          },
        ]}
      />

      <form
        onSubmit={handleSubmit}
        onInput={handleCargaInput}
      >
        <Stack gap={20}>
          <Alert
            variant="info"
            title="Novo cadastro"
            icon={<Info />}
          >
            O número será gerado
            automaticamente e o desenho
            será criado como rascunho.
          </Alert>

          {erro && (
            <Alert
              variant="danger"
              title="Não foi possível salvar"
              icon={<AlertCircle />}
            >
              {erro}
            </Alert>
          )}

          <Card
            title="Identificação"
            description="Informe os dados principais do desenho de aprovação."
            allowOverflow
          >
            <FormGrid columns={3}>
              <Field
                label="Cliente"
                htmlFor="cliente"
                required
                hint="Nome ou razão social do cliente."
              >
                <Input
                  id="cliente"
                  name="cliente"
                  required
                  maxLength={200}
                  autoComplete="off"
                  placeholder="Digite o cliente"
                  disabled={salvando}
                />
              </Field>

              <Field
                label="Produto"
                htmlFor="produto"
                required
                hint="A categoria selecionada definirá o template utilizado na geração do SVG."
              >
                <Autocomplete
                  id="produto"
                  name="produto"
                  options={productOptions}
                  selectedOption={
                    produtoSelecionado
                  }
                  onSelect={
                    setProdutoSelecionado
                  }
                  placeholder="Selecione a categoria"
                />
              </Field>

              <Field
                label="Modelo"
                htmlFor="modelo"
                hint="Selecione o modelo do produto."
              >
                <Autocomplete
                  id="modelo"
                  name="modelo"
                  options={modelOptions}
                  selectedOption={
                    modeloSelecionado
                  }
                  onSelect={
                    setModeloSelecionado
                  }
                  placeholder="Selecione o modelo"
                />
              </Field>

              <Field
                label="Representação"
                htmlFor="tipo-representacao"
                hint="Tipo de vista utilizada."
              >
                <Autocomplete
                  id="tipo-representacao"
                  name="tipoRepresentacao"
                  options={
                    representationOptions
                  }
                  selectedOption={
                    representacaoSelecionada
                  }
                  onSelect={
                    setRepresentacaoSelecionada
                  }
                  placeholder="Selecione a representação"
                />
              </Field>

              <Field
                label="Data de emissão"
                htmlFor="data-emissao"
                required
                hint="Data em que o desenho foi emitido."
              >
                <DateInput
                  id="data-emissao"
                  name="dataEmissao"
                  defaultValue={getCurrentLocalDate()}
                  required
                  disabled={salvando}
                />
              </Field>

              <Field
                label="Previsão de aprovação"
                htmlFor="previsao-aprovacao"
                hint="Data prevista para aprovação do desenho."
              >
                <DateInput
                  id="previsao-aprovacao"
                  name="previsaoAprovacao"
                  min={getCurrentLocalDate()}
                  disabled={salvando}
                />
              </Field>
            </FormGrid>
          </Card>

          <Card
            title="Veículo"
            description="Informe os dados do caminhão que aparecerá no desenho."
          >
            <FormGrid columns={2}>
              <Field
                label="Caminhão"
                htmlFor="caminhao"
                hint="Marca e modelo do caminhão."
              >
                <Input
                  id="caminhao"
                  name="caminhao"
                  maxLength={150}
                  autoComplete="off"
                  placeholder="Ex.: Mercedes-Benz Actros"
                  disabled={salvando}
                />
              </Field>

              <Field
                label="Cabine"
                htmlFor="cabine"
                hint="Configuração da cabine."
              >
                <Input
                  id="cabine"
                  name="cabine"
                  maxLength={100}
                  autoComplete="off"
                  placeholder="Ex.: Cabine simples"
                  disabled={salvando}
                />
              </Field>
            </FormGrid>
          </Card>

          <Card
            title="Dimensões e capacidade"
            description="Informe as características técnicas do equipamento."
          >
            <FormGrid columns={4}>
              <Field
                label="Comprimento"
                htmlFor="comprimento"
                hint="Comprimento total em milímetros."
              >
                <NumberInput
                  id="comprimento"
                  name="comprimento"
                  min={0}
                  step={1}
                  placeholder="8200"
                  suffix="mm"
                  disabled={salvando}
                />
              </Field>

              <Field
                label="Altura"
                htmlFor="altura"
                hint="Altura total em milímetros."
              >
                <NumberInput
                  id="altura"
                  name="altura"
                  min={0}
                  step={1}
                  placeholder="4070"
                  suffix="mm"
                  disabled={salvando}
                />
              </Field>

              <Field
                label="Capacidade"
                htmlFor="capacidade-ton"
                hint="Capacidade em toneladas."
              >
                <NumberInput
                  id="capacidade-ton"
                  name="capacidadeTon"
                  min={0}
                  step={0.01}
                  placeholder="28"
                  suffix="t"
                  disabled={salvando}
                />
              </Field>

              <Field
                label="Volume"
                htmlFor="volume-m3"
                hint="Volume em metros cúbicos."
              >
                <NumberInput
                  id="volume-m3"
                  name="volumeM3"
                  min={0}
                  step={0.01}
                  placeholder="34"
                  suffix="m³"
                  disabled={salvando}
                />
              </Field>

              <Field
                label="Compartimentos"
                htmlFor="compartimentos"
                hint="Quantidade de compartimentos."
              >
                <NumberInput
                  id="compartimentos"
                  name="compartimentos"
                  min={0}
                  step={1}
                  placeholder="4"
                  disabled={salvando}
                />
              </Field>

              <Field
                label="Peso"
                htmlFor="peso"
                hint="Peso estimado em quilogramas."
              >
                <NumberInput
                  id="peso"
                  name="peso"
                  min={0}
                  step={0.01}
                  placeholder="7250"
                  suffix="kg"
                  disabled={salvando}
                />
              </Field>

              <Field
                label="Carga dianteira"
                htmlFor="carga-dianteira"
                hint={`Máximo disponível: ${limiteCargaDianteira.toLocaleString(
                  "pt-BR",
                  {
                    maximumFractionDigits: 2,
                  }
                )}%.`}
              >
                <NumberInput
                  id="carga-dianteira"
                  name="cargaDianteira"
                  min={0}
                  max={limiteCargaDianteira}
                  step={0.01}
                  placeholder="27"
                  suffix="%"
                  disabled={salvando}
                />
              </Field>

              <Field
                label="Carga traseira"
                htmlFor="carga-traseira"
                hint={`Máximo disponível: ${limiteCargaTraseira.toLocaleString(
                  "pt-BR",
                  {
                    maximumFractionDigits: 2,
                  }
                )}%.`}
              >
                <NumberInput
                  id="carga-traseira"
                  name="cargaTraseira"
                  min={0}
                  max={limiteCargaTraseira}
                  step={0.01}
                  placeholder="73"
                  suffix="%"
                  disabled={salvando}
                />
              </Field>
            </FormGrid>

            {erroCargas ? (
              <Alert
                variant="danger"
                title="Distribuição de carga inválida"
                icon={<AlertCircle />}
              >
                {erroCargas}
              </Alert>
            ) : (
              possuiCargaInformada && (
                <Alert
                  variant="info"
                  title="Distribuição de carga"
                  icon={<Info />}
                >
                  Soma atual:{" "}
                  <strong>
                    {somaCargas.toLocaleString(
                      "pt-BR",
                      {
                        maximumFractionDigits: 2,
                      }
                    )}
                    %
                  </strong>
                  . Restam{" "}
                  <strong>
                    {Math.max(
                      0,
                      100 - somaCargas
                    ).toLocaleString(
                      "pt-BR",
                      {
                        maximumFractionDigits: 2,
                      }
                    )}
                    %
                  </strong>{" "}
                  disponíveis.
                </Alert>
              )
            )}
          </Card>

          <Card
            title="Configurações"
            description="Defina quais informações deverão aparecer no desenho."
          >
            <Stack gap={16}>
              <Checkbox
                id="incluir-cotas"
                name="incluirCotas"
                label="Incluir cotas no desenho"
                hint="As principais dimensões serão exibidas no documento final."
                defaultChecked
                disabled={salvando}
              />

              <Switch
                id="calculo-automatico"
                name="calculoAutomatico"
                label="Cálculo automático das dimensões"
                hint="Atualiza os cálculos e proporções conforme os valores informados."
                defaultChecked
                disabled={salvando}
              />

              <Switch
                id="incluir-caminhao"
                name="incluirCaminhao"
                label="Incluir caminhão no desenho"
                hint="Exibe a vista lateral do caminhão no documento de aprovação."
                disabled={salvando}
              />
            </Stack>
          </Card>

          <Card
            title="Observações"
            description="Registre requisitos ou informações complementares."
          >
            <Field
              label="Observações gerais"
              htmlFor="observacoes"
              hint="Estas informações ficarão vinculadas ao desenho."
            >
              <Textarea
                id="observacoes"
                name="observacoes"
                rows={6}
                maxLength={100000}
                placeholder="Digite as observações do desenho de aprovação"
                disabled={salvando}
              />
            </Field>
          </Card>

          <Stack
            direction="row"
            gap={10}
            align="center"
            wrap
          >
            <Button
              type="submit"
              disabled={
                salvando ||
                erroCargas !== null
              }
              loading={salvando}
              loadingLabel="Salvando desenho..."
            >
              <Save
                size={17}
                aria-hidden="true"
              />

              Salvar como rascunho
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={salvando}
              onClick={() =>
                router.push(
                  "/desenho-aprovacao"
                )
              }
            >
              Cancelar
            </Button>
          </Stack>
        </Stack>
      </form>
    </PageContainer>
  );
}