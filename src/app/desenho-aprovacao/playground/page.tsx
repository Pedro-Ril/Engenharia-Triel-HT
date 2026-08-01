"use client";

import { Drawer } from "@/components/ui/Drawer";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { FileUpload } from "@/components/ui/FileUpload";
import { DateInput } from "@/components/ui/DateInput";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { NumberInput } from "@/components/ui/NumberInput";
import { Switch } from "@/components/ui/Switch";
import { StatCard } from "@/components/ui/StatCard";
import { Toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { Loader } from "@/components/ui/Loader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { useState } from "react";
import {
  Tabs,
  type TabItem,
} from "@/components/ui/Tabs";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  Info,
  TriangleAlert,
  Home,
} from "lucide-react";
import {
  Autocomplete,
  type AutocompleteOption,
} from "@/components/ui/Autocomplete";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Modal } from "@/components/ui/Modal";
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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

import { EmptyState } from "@/components/ui/EmptyState";

import {
  Download,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";

import { IconButton } from "@/components/ui/IconButton";

const clientes: AutocompleteOption[] = [
  {
    value: "1",
    label: "1 | DUVALE TRANSPORTES LTDA",
  },
  {
    value: "2",
    label: "2 | TRIEL HT INDUSTRIAL E PARTICIPACOES S/A MATRIZ",
  },
  {
    value: "3",
    label: "3 | DALLA ROSA ASSESSORIA COMERCIAL LTDA",
  },
  {
    value: "8",
    label: "8 | A D K REPRESENTAÇÕES LTDA - ME",
  },
  {
    value: "9",
    label: "9 | ALESSANDRO GARCIA & ANDRIA SOARES LTDA",
  },
  {
    value: "10",
    label: "10 | TRIEL HT INDUSTRIAL E PARTICIPACOES S.A FILIAL",
  },
];

const produtos: AutocompleteOption[] = [
  {
    value: "silo-graneleiro",
    label: "Silo Graneleiro",
  },
  {
    value: "carroceria-suinos",
    label: "Carroceria de Suínos",
  },
];

export default function DesenhoAprovacaoPage() {
  const [modalAberto, setModalAberto] = useState(false);
  const [drawerAberto, setDrawerAberto] =
    useState(false);
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState("dados");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [toastAberto, setToastAberto] = useState(false);
  const [tipoRepresentacao, setTipoRepresentacao] =
    useState("completo");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [clienteSelecionado, setClienteSelecionado] =
    useState<AutocompleteOption | null>(null);

  const [produtoSelecionado, setProdutoSelecionado] =
    useState<AutocompleteOption | null>(null);

  const abas: TabItem[] = [
    {
      value: "dados",
      label: "Dados gerais",
      content: (
        <Alert variant="info" icon={<Info />}>
          Nesta etapa serão informados cliente, produto e
          observações.
        </Alert>
      ),
    },
    {
      value: "configuracao",
      label: "Configuração",
      content: (
        <Alert variant="warning" icon={<TriangleAlert />}>
          A configuração paramétrica do silo será criada nesta aba.
        </Alert>
      ),
    },
    {
      value: "preview",
      label: "Pré-visualização",
      content: (
        <Alert variant="success" icon={<CheckCircle2 />}>
          O desenho SVG será apresentado nesta área.
        </Alert>
      ),
    },
    {
      value: "historico",
      label: "Histórico",
      content: (
        <EmptyState
          title="Nenhuma revisão cadastrada"
          description="As alterações realizadas no desenho aparecerão aqui."
        />
      ),
    },
  ];

  function testarCarregamento() {
    setSalvando(true);

    window.setTimeout(() => {
      setSalvando(false);
    }, 2500);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Desenho de Aprovação"
        description="Criação e gerenciamento dos desenhos de aprovação."
        actions={
          <Stack direction="row" gap={8} wrap>
            <Button
              variant="secondary"
              onClick={() => setDrawerAberto(true)}
            >
              Configurações
            </Button>

            <Button onClick={() => setModalAberto(true)}>
              Novo desenho
            </Button>
          </Stack>
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
            label: "Engenharia",
          },
          {
            label: "Desenho de Aprovação",
            current: true,
          },
        ]}
      />

      <FormGrid columns={4}>
        <StatCard
          label="Total de desenhos"
          value="24"
          description="Desenhos cadastrados no sistema."
          icon={<FileText />}
        />

        <StatCard
          label="Em elaboração"
          value="8"
          description="Desenhos ainda em edição."
          icon={<Clock3 />}
          variant="info"
        />

        <StatCard
          label="Pendentes"
          value="5"
          description="Aguardando revisão ou aprovação."
          icon={<TriangleAlert />}
          variant="warning"
        />

        <StatCard
          label="Aprovados"
          value="11"
          description="Desenhos finalizados e aprovados."
          icon={<CheckCircle2 />}
          variant="success"
        />
      </FormGrid>

      <Card
        title="Dados do desenho"
        description="Informe os dados iniciais para criar o desenho de aprovação."
        allowOverflow
      >
        <Stack gap={16}>
          <FormGrid columns={2}>
            <Field
              label="Cliente"
              htmlFor="cliente"
              required
              hint="Digite o código ou a descrição do cliente."
            >
              <Autocomplete
                id="cliente"
                name="cliente"
                options={clientes}
                selectedOption={clienteSelecionado}
                onSelect={setClienteSelecionado}
                placeholder="Digite código ou descrição do cliente"
              />
            </Field>

            <Field
              label="Produto"
              htmlFor="produto"
              required
              hint="Digite ou selecione a categoria do produto."
            >
              <Autocomplete
                id="produto"
                name="produto"
                options={produtos}
                selectedOption={produtoSelecionado}
                onSelect={setProdutoSelecionado}
                placeholder="Digite ou selecione um produto"
              />
            </Field>
          </FormGrid>

          <FormGrid columns={4}>
            <Field
              label="Comprimento do silo"
              htmlFor="comprimento"
              required
              hint="Informe o comprimento total."
            >
              <NumberInput
                id="comprimento"
                name="comprimento"
                min={0}
                step={1}
                placeholder="8200"
                suffix="mm"
              />
            </Field>

            <Field
              label="Altura total"
              htmlFor="altura"
              required
              hint="Informe a altura total do conjunto."
            >
              <NumberInput
                id="altura"
                name="altura"
                min={0}
                step={1}
                placeholder="4070"
                suffix="mm"
              />
            </Field>

            <Field
              label="Capacidade"
              htmlFor="capacidade"
              hint="Informe o volume total."
            >
              <NumberInput
                id="capacidade"
                name="capacidade"
                min={0}
                step={0.1}
                placeholder="34"
                suffix="m³"
              />
            </Field>

            <Field
              label="Carga dianteira"
              htmlFor="carga-dianteira"
              hint="Percentual aplicado ao eixo dianteiro."
            >
              <NumberInput
                id="carga-dianteira"
                name="cargaDianteira"
                min={0}
                max={100}
                step={1}
                placeholder="73"
                suffix="%"
              />
            </Field>


          </FormGrid>

          <RadioGroup
            name="tipoRepresentacao"
            label="Tipo de representação"
            value={tipoRepresentacao}
            onValueChange={setTipoRepresentacao}
            orientation="horizontal"
            required
            options={[
              {
                value: "lateral",
                label: "Vista lateral",
                description:
                  "Exibe somente a representação lateral do conjunto.",
              },
              {
                value: "superior",
                label: "Vista superior",
                description:
                  "Exibe somente a representação superior do conjunto.",
              },
              {
                value: "completo",
                label: "Conjunto completo",
                description:
                  "Inclui as vistas lateral e superior no documento.",
              },
            ]}
          />

          <FormGrid columns={2}>
            <Field
              label="Data de emissão"
              htmlFor="data-emissao"
              required
              hint="Data em que o desenho foi emitido."
            >
              <DateInput
                id="data-emissao"
                name="dataEmissao"
                defaultValue="2026-07-31"
                required
              />
            </Field>

            <Field
              label="Previsão de aprovação"
              htmlFor="data-aprovacao"
              hint="Data prevista para aprovação do desenho."
            >
              <DateInput
                id="data-aprovacao"
                name="dataAprovacao"
                min="2026-07-31"
              />
            </Field>
          </FormGrid>

          <Field
            label="Observações"
            htmlFor="observacoes"
            hint="Inclua informações adicionais que devem constar no desenho."
          >
            <Textarea
              id="observacoes"
              name="observacoes"
              placeholder="Digite as observações do desenho de aprovação"
              rows={4}
            />
          </Field>

          <FileUpload
            id="anexos-desenho"
            name="anexos"
            label="Anexar documentos"
            description="Arraste ou selecione arquivos relacionados ao desenho."
            accept=".pdf,.png,.jpg,.jpeg,.svg"
            multiple
            maxSizeMB={10}
            files={arquivos}
            onFilesChange={setArquivos}
          />

          <Checkbox
            id="incluir-cotas"
            name="incluirCotas"
            label="Incluir cotas no desenho"
            hint="As principais dimensões serão exibidas no documento final."
            defaultChecked
          />

          <Switch
            id="calculo-automatico"
            name="calculoAutomatico"
            label="Cálculo automático das dimensões"
            hint="Atualiza as cotas e proporções do desenho conforme os valores informados."
            defaultChecked
          />

          <Switch
            id="incluir-caminhao"
            name="incluirCaminhao"
            label="Incluir caminhão no desenho"
            hint="Exibe a vista lateral do caminhão no documento de aprovação."
          />
        </Stack>
      </Card>

      <Card
        title="Desenhos cadastrados"
        description="Consulte e acompanhe os desenhos de aprovação."
      >
        <Stack gap={16}>
          <Stack direction="row" gap={8} wrap>
            <Badge>Rascunho</Badge>
            <Badge variant="info">Em aprovação</Badge>
            <Badge variant="warning">Pendente</Badge>
            <Badge variant="success">Aprovado</Badge>
            <Badge variant="danger">Reprovado</Badge>
          </Stack>

          <Table minWidth={800}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Número</TableHeaderCell>
                <TableHeaderCell>Cliente</TableHeaderCell>
                <TableHeaderCell>Produto</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Data</TableHeaderCell>
                <TableHeaderCell align="right">
                  Ações
                </TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              <TableRow>
                <TableCell>DA-0001</TableCell>

                <TableCell>
                  DUVALE TRANSPORTES LTDA
                </TableCell>

                <TableCell>
                  Silo Graneleiro
                </TableCell>

                <TableCell>
                  <Badge>Rascunho</Badge>
                </TableCell>

                <TableCell>
                  31/07/2026
                </TableCell>

                <TableCell align="right">
                  <Stack
                    direction="row"
                    gap={6}
                    justify="end"
                  >
                    <Tooltip content="Visualizar desenho">
                      <IconButton
                        icon={<Eye />}
                        label="Visualizar desenho"
                      />
                    </Tooltip>

                    <Tooltip content="Editar desenho">
                      <IconButton
                        icon={<Pencil />}
                        label="Editar desenho"
                        variant="primary"
                      />
                    </Tooltip>

                    <Tooltip
                      content="Baixar arquivo PDF"
                      placement="bottom"
                    >
                      <IconButton
                        icon={<Download />}
                        label="Baixar PDF"
                      />
                    </Tooltip>

                    <Tooltip content="Excluir desenho">
                      <IconButton
                        icon={<Trash2 />}
                        label="Excluir desenho"
                        variant="danger"
                        onClick={() =>
                          setConfirmacaoAberta(true)
                        }
                      />
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell>DA-0002</TableCell>

                <TableCell>
                  TRIEL HT INDUSTRIAL E PARTICIPAÇÕES S/A
                </TableCell>

                <TableCell>
                  Silo Graneleiro
                </TableCell>

                <TableCell>
                  <Badge variant="success">
                    Aprovado
                  </Badge>
                </TableCell>

                <TableCell>
                  30/07/2026
                </TableCell>

                <TableCell align="right">
                  <DropdownMenu
                    label="Ações do desenho DA-0002"
                    align="end"
                    items={[
                      {
                        value: "visualizar",
                        label: "Visualizar desenho",
                        icon: <Eye />,
                        onSelect: () => {
                          console.log("Visualizar DA-0002");
                        },
                      },
                      {
                        value: "editar",
                        label: "Editar desenho",
                        icon: <Pencil />,
                        onSelect: () => {
                          console.log("Editar DA-0002");
                        },
                      },
                      {
                        value: "baixar",
                        label: "Baixar arquivo PDF",
                        icon: <Download />,
                        onSelect: () => {
                          console.log("Baixar DA-0002");
                        },
                      },
                      {
                        value: "excluir",
                        label: "Excluir desenho",
                        icon: <Trash2 />,
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => {
                          setConfirmacaoAberta(true);
                        },
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Pagination
            page={paginaAtual}
            totalPages={8}
            onPageChange={setPaginaAtual}
          />

          <Stack gap={12}>
            <Alert
              variant="info"
              title="Informação"
              icon={<Info />}
            >
              O desenho será salvo inicialmente como rascunho.
            </Alert>

            <Alert
              variant="success"
              title="Operação concluída"
              icon={<CheckCircle2 />}
            >
              O desenho foi salvo com sucesso.
            </Alert>

            <Alert
              variant="warning"
              title="Atenção"
              icon={<TriangleAlert />}
            >
              Algumas dimensões ainda precisam ser preenchidas.
            </Alert>

            <Alert
              variant="danger"
              title="Erro ao gerar o desenho"
              icon={<AlertCircle />}
            >
              Não foi possível gerar o documento de aprovação.
            </Alert>
          </Stack>
        </Stack>
      </Card>

      <Card title="Etapas do desenho">
        <Tabs
          items={abas}
          value={abaAtiva}
          onValueChange={setAbaAtiva}
          ariaLabel="Etapas do desenho de aprovação"
        />
      </Card>

      <Card
        title="Carregamento"
        description="Exemplos de carregamento da biblioteca."
      >
        <Stack gap={16}>
          <Stack direction="row" gap={12} align="center">
            <Skeleton
              variant="circle"
              width={44}
              height={44}
            />

            <Stack gap={8} fullWidth>
              <Skeleton variant="text" width="45%" />
              <Skeleton variant="text" width="75%" />
            </Stack>
          </Stack>

          <Skeleton
            variant="rectangle"
            width="100%"
            height={90}
          />

          <FormGrid columns={3}>
            <Skeleton
              variant="rectangle"
              width="100%"
              height={44}
            />

            <Skeleton
              variant="rectangle"
              width="100%"
              height={44}
            />

            <Skeleton
              variant="rectangle"
              width="100%"
              height={44}
            />
          </FormGrid>
        </Stack>
      </Card>


      <Card
        title="Indicadores de carregamento"
        description="Exemplos de uso do componente Loader."
      >
        <Stack gap={20}>
          <Loader
            size="small"
            label="Salvando..."
          />

          <Loader
            size="medium"
            label="Gerando desenho..."
          />

          <Loader
            size="large"
            label="Gerando arquivo PDF..."
          />

          <Loader
            centered
            label="Carregando pré-visualização..."
          />

          <Button
            loading={salvando}
            loadingLabel="Salvando desenho..."
            onClick={testarCarregamento}
          >
            Salvar desenho
          </Button>

          <Button onClick={() => setToastAberto(true)}>
            Testar notificação
          </Button>
        </Stack>
      </Card>

      <Modal
        open={modalAberto}
        title="Novo desenho de aprovação"
        description="Confirme o início de um novo cadastro."
        onClose={() => setModalAberto(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModalAberto(false)}
            >
              Cancelar
            </Button>

            <Button onClick={() => setModalAberto(false)}>
              Continuar
            </Button>
          </>
        }
      >
        <Alert
          variant="info"
          icon={<Info />}
        >
          Um novo desenho será criado inicialmente com o status de
          rascunho.
        </Alert>
      </Modal>

      <ConfirmDialog
        open={confirmacaoAberta}
        variant="danger"
        title="Excluir desenho"
        description="Esta operação não poderá ser desfeita."
        message={
          <>
            Tem certeza de que deseja excluir o desenho{" "}
            <strong>DA-0001</strong>?
          </>
        }
        confirmLabel="Excluir desenho"
        cancelLabel="Cancelar"
        onClose={() => setConfirmacaoAberta(false)}
        onConfirm={() => {
          setConfirmacaoAberta(false);
        }}
      />

      <Drawer
        open={drawerAberto}
        title="Configurações do desenho"
        description="Defina as opções utilizadas na geração do documento."
        size="medium"
        side="right"
        onClose={() => setDrawerAberto(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDrawerAberto(false)}
            >
              Cancelar
            </Button>

            <Button
              onClick={() => {
                setDrawerAberto(false);
                setToastAberto(true);
              }}
            >
              Aplicar configurações
            </Button>
          </>
        }
      >
        <Stack gap={16}>
          <Switch
            id="drawer-cotas"
            name="drawerCotas"
            label="Exibir cotas"
            hint="Mostra as principais dimensões no desenho."
            defaultChecked
          />

          <Switch
            id="drawer-caminhao"
            name="drawerCaminhao"
            label="Exibir caminhão"
            hint="Inclui a representação lateral do veículo."
          />

          <Switch
            id="drawer-observacoes"
            name="drawerObservacoes"
            label="Exibir observações"
            hint="Inclui o campo de observações no documento final."
            defaultChecked
          />

          <RadioGroup
            name="qualidadePreview"
            label="Qualidade da pré-visualização"
            defaultValue="media"
            options={[
              {
                value: "baixa",
                label: "Baixa",
                description: "Carregamento mais rápido.",
              },
              {
                value: "media",
                label: "Média",
                description: "Equilíbrio entre qualidade e desempenho.",
              },
              {
                value: "alta",
                label: "Alta",
                description: "Maior definição do desenho.",
              },
            ]}
          />
        </Stack>
      </Drawer>

      <Toast
        open={toastAberto}
        variant="success"
        title="Desenho salvo"
        description="As informações foram registradas com sucesso."
        onClose={() => setToastAberto(false)}
      />
    </PageContainer>
  );
}