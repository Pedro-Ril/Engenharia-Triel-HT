"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download, Home, Save, Warehouse } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";

import {
  criarEquipamento,
  listarBlocosDoTipoEquipamento,
  listarCamposDoTipoEquipamento,
  listarEmpresasAtivas,
  listarTiposEquipamentoAtivos,
} from "../services/estoque.service";
import type {
  BlocoTipoEquipamento,
  CampoTipoEquipamento,
  EmpresaOpcao,
  Equipamento,
  TipoEquipamento,
} from "../types/estoque.types";
import { CampoDinamicoInput } from "./CampoDinamicoInput";
import { ClienteAutocomplete } from "./ClienteAutocomplete";
import { exportarPdfEntradaEquipamento } from "../utils/pdf-export";
import {
  CHAVE_SISTEMA_CODIGO_EMPRESA,
  CHAVE_SISTEMA_DESCRICAO,
  CHAVE_SISTEMA_ERP_CODIGO_ITEM,
  CHAVE_SISTEMA_MARCA,
  CHAVE_SISTEMA_MODELO,
  CHAVE_SISTEMA_NOME_CLIENTE,
  CHAVE_SISTEMA_NUMERO_NF_ENTRADA,
  CHAVE_SISTEMA_NUMERO_SERIE,
  CHAVE_SISTEMA_OBSERVACOES,
  CHAVE_SISTEMA_VALOR,
  CHAVES_SISTEMA_LARGURA_TOTAL,
} from "../constants";

const ACEITA_EVIDENCIAS = "image/*,.pdf,.doc,.docx,.xls,.xlsx";

function formInicial() {
  return {
    nomeCliente: "",
    codigoCliente: "",
    valor: "",
    descricao: "",
    marca: "",
    modelo: "",
    numeroSerie: "",
    codigoEmpresa: "",
    numeroNfEntrada: "",
    observacoes: "",
    erpCodigoItem: "",
  };
}

interface NovaEntradaPageProps {
  codigoEmpresaUsuario: string | null;
}

export function NovaEntradaPage({ codigoEmpresaUsuario }: NovaEntradaPageProps) {
  const router = useRouter();

  const [tipos, setTipos] = useState<TipoEquipamento[]>([]);
  const [tipoEquipamentoId, setTipoEquipamentoId] = useState("");
  const [blocosDoTipo, setBlocosDoTipo] = useState<BlocoTipoEquipamento[]>([]);
  const [camposDoTipo, setCamposDoTipo] = useState<CampoTipoEquipamento[]>([]);
  const [carregandoBlocos, setCarregandoBlocos] = useState(false);
  const [valoresCampos, setValoresCampos] = useState<Record<string, unknown>>({});

  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);

  const [form, setForm] = useState(formInicial());
  const [evidencias, setEvidencias] = useState<Record<string, File[]>>({});

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campoInvalidoId, setCampoInvalidoId] = useState<string | null>(null);
  const [equipamentoCriado, setEquipamentoCriado] = useState<Equipamento | null>(null);

  useEffect(() => {
    listarTiposEquipamentoAtivos().then(setTipos);
  }, []);

  /*
   * Empresa vem como dropdown, mas já pré-selecionada com a do
   * cadastro do usuário (por código, comparação sem acento de caixa)
   * quando ela existir na lista — continua editável, só evita o
   * usuário ter que procurar a própria empresa toda vez.
   */
  useEffect(() => {
    listarEmpresasAtivas().then((lista) => {
      setEmpresas(lista);

      const empresaDoUsuario = codigoEmpresaUsuario
        ? lista.find(
            (empresa) =>
              empresa.codigo?.trim().toLowerCase() === codigoEmpresaUsuario.trim().toLowerCase()
          )
        : undefined;

      if (empresaDoUsuario?.codigo) {
        setForm((atual) => ({ ...atual, codigoEmpresa: empresaDoUsuario.codigo as string }));
      }
    });
  }, [codigoEmpresaUsuario]);

  useEffect(() => {
    if (!tipoEquipamentoId) {
      setBlocosDoTipo([]);
      setCamposDoTipo([]);
      return;
    }

    setCarregandoBlocos(true);
    Promise.all([
      listarBlocosDoTipoEquipamento(tipoEquipamentoId),
      listarCamposDoTipoEquipamento(tipoEquipamentoId),
    ]).then(([blocos, campos]) => {
      setBlocosDoTipo(blocos);
      setCamposDoTipo(campos);
      setValoresCampos({});
      setEvidencias({});
      setCampoInvalidoId(null);
      setCarregandoBlocos(false);
    });
  }, [tipoEquipamentoId]);

  const blocoFixo = useMemo(() => blocosDoTipo.find((bloco) => bloco.ehFixo) ?? null, [blocosDoTipo]);
  const blocosNormais = useMemo(() => blocosDoTipo.filter((bloco) => !bloco.ehFixo), [blocosDoTipo]);

  const camposPorBloco = useMemo(() => {
    const mapa = new Map<string, CampoTipoEquipamento[]>();
    for (const campo of camposDoTipo) {
      if (!mapa.has(campo.blocoId)) mapa.set(campo.blocoId, []);
      mapa.get(campo.blocoId)?.push(campo);
    }
    return mapa;
  }, [camposDoTipo]);

  function atualizarCampo(campo: keyof ReturnType<typeof formInicial>, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function atualizarValorDinamico(chave: string, valor: unknown) {
    setValoresCampos((atual) => ({ ...atual, [chave]: valor }));
  }

  /*
   * Os 10 campos fixos do sistema (cliente, valor, descrição...) agora são
   * linhas reais em com_estoque_tipos_equipamento_campos (eh_sistema=1) —
   * rótulo/ordem/obrigatório/ativo vêm do admin, mas o input em si (texto
   * simples, dropdown de empresa, textarea...) continua especial por
   * chave, já que cada um escreve numa coluna própria do equipamento, não
   * no JSON genérico de camposValores.
   */
  function renderCampoSistema(campo: CampoTipoEquipamento) {
    const id = `campo-${campo.id}`;
    const destacado = campoInvalidoId === campo.id;
    const erro = destacado ? "Este campo é obrigatório." : undefined;

    switch (campo.chave) {
      case CHAVE_SISTEMA_NOME_CLIENTE:
        return (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            required={campo.obrigatorio}
            error={erro}
            highlighted={destacado}
          >
            <ClienteAutocomplete
              value={form.nomeCliente}
              onChange={(valor) => {
                atualizarCampo("nomeCliente", valor);
                if (!valor) atualizarCampo("codigoCliente", "");
              }}
              onSelecionarItem={(item) => atualizarCampo("codigoCliente", item.cod_cli)}
            />
          </Field>
        );
      case CHAVE_SISTEMA_VALOR:
        return (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            required={campo.obrigatorio}
            error={erro}
            highlighted={destacado}
          >
            <CurrencyInput value={form.valor} onValueChange={(valor) => atualizarCampo("valor", valor)} />
          </Field>
        );
      case CHAVE_SISTEMA_DESCRICAO:
        return (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            required={campo.obrigatorio}
            hint="Ex: Empilhadeira elétrica 2,5t"
            error={erro}
            highlighted={destacado}
          >
            <Input
              value={form.descricao}
              onChange={(event) => atualizarCampo("descricao", event.target.value)}
            />
          </Field>
        );
      case CHAVE_SISTEMA_MARCA:
        return (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            required={campo.obrigatorio}
            error={erro}
            highlighted={destacado}
          >
            <Input value={form.marca} onChange={(event) => atualizarCampo("marca", event.target.value)} />
          </Field>
        );
      case CHAVE_SISTEMA_MODELO:
        return (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            required={campo.obrigatorio}
            error={erro}
            highlighted={destacado}
          >
            <Input value={form.modelo} onChange={(event) => atualizarCampo("modelo", event.target.value)} />
          </Field>
        );
      case CHAVE_SISTEMA_NUMERO_SERIE:
        return (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            required={campo.obrigatorio}
            error={erro}
            highlighted={destacado}
          >
            <Input
              value={form.numeroSerie}
              onChange={(event) => atualizarCampo("numeroSerie", event.target.value)}
            />
          </Field>
        );
      case CHAVE_SISTEMA_CODIGO_EMPRESA:
        return (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            required={campo.obrigatorio}
            error={erro}
            highlighted={destacado}
          >
            <Dropdown
              value={form.codigoEmpresa}
              options={[
                { value: "", label: "Selecione a empresa" },
                ...empresas
                  .filter((empresa) => empresa.codigo)
                  .map((empresa) => ({
                    value: empresa.codigo as string,
                    label: `${empresa.codigo} | ${empresa.nome}`,
                  })),
              ]}
              onValueChange={(valor) => atualizarCampo("codigoEmpresa", valor)}
            />
          </Field>
        );
      case CHAVE_SISTEMA_NUMERO_NF_ENTRADA:
        return campo.vemDeIntegracao ? (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            hint="Preenchido automaticamente pela integração com o ERP assim que a NF for lançada — não é possível digitar aqui"
          >
            <Input value="" disabled placeholder="Aguardando integração com o ERP" />
          </Field>
        ) : (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            required={campo.obrigatorio}
            error={erro}
            highlighted={destacado}
          >
            <Input
              value={form.numeroNfEntrada}
              onChange={(event) => atualizarCampo("numeroNfEntrada", event.target.value)}
            />
          </Field>
        );
      case CHAVE_SISTEMA_ERP_CODIGO_ITEM:
        return campo.vemDeIntegracao ? (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            hint="Preenchido automaticamente pela integração com o ERP junto com a NF de entrada — não é possível digitar aqui"
          >
            <Input value="" disabled placeholder="Aguardando integração com o ERP" />
          </Field>
        ) : (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            required={campo.obrigatorio}
            error={erro}
            highlighted={destacado}
          >
            <Input
              value={form.erpCodigoItem}
              onChange={(event) => atualizarCampo("erpCodigoItem", event.target.value)}
            />
          </Field>
        );
      case CHAVE_SISTEMA_OBSERVACOES:
        return (
          <Field
            key={campo.id}
            id={id}
            label={campo.rotulo}
            required={campo.obrigatorio}
            error={erro}
            highlighted={destacado}
          >
            <Textarea
              rows={3}
              value={form.observacoes}
              onChange={(event) => atualizarCampo("observacoes", event.target.value)}
            />
          </Field>
        );
      default:
        return null;
    }
  }

  function renderCampoDoBlocoFixo(campo: CampoTipoEquipamento) {
    return campo.ehSistema ? (
      renderCampoSistema(campo)
    ) : (
      <CampoDinamicoInput
        key={campo.id}
        id={`campo-${campo.id}`}
        highlighted={campoInvalidoId === campo.id}
        campo={campo}
        value={valoresCampos[campo.chave]}
        onChange={(valor) => atualizarValorDinamico(campo.chave, valor)}
      />
    );
  }

  /*
   * Empacota os campos do bloco fixo numa grade de 3 colunas (em vez de
   * um por linha) pra reduzir a rolagem — só "Descrição" e "Observações
   * livres" (texto longo/textarea) ficam sozinhas em linha de largura
   * total, o resto (inclusive campo dinâmico que o admin adicionar ali)
   * entra na grade, na ordem cadastrada.
   */
  function renderCamposDoBlocoFixoAgrupados(campos: CampoTipoEquipamento[]) {
    const segmentos: ReactNode[] = [];
    let grupoAtual: CampoTipoEquipamento[] = [];

    function flush() {
      if (grupoAtual.length === 0) return;
      segmentos.push(
        <FormGrid key={`grade-${segmentos.length}`} columns={3}>
          {grupoAtual.map((campo) => renderCampoDoBlocoFixo(campo))}
        </FormGrid>
      );
      grupoAtual = [];
    }

    for (const campo of campos) {
      if (campo.ehSistema && CHAVES_SISTEMA_LARGURA_TOTAL.includes(campo.chave)) {
        flush();
        segmentos.push(renderCampoDoBlocoFixo(campo));
      } else {
        grupoAtual.push(campo);
      }
    }

    flush();
    return segmentos;
  }

  function evidenciasDoBloco(blocoId: string): File[] {
    return evidencias[blocoId] ?? [];
  }

  function definirEvidenciasDoBloco(blocoId: string, arquivos: File[]) {
    setEvidencias((atual) => ({ ...atual, [blocoId]: arquivos }));
  }

  function valorAtualDoCampoSistema(chave: string): string {
    switch (chave) {
      case CHAVE_SISTEMA_NOME_CLIENTE:
        return form.nomeCliente;
      case CHAVE_SISTEMA_VALOR:
        return form.valor;
      case CHAVE_SISTEMA_DESCRICAO:
        return form.descricao;
      case CHAVE_SISTEMA_MARCA:
        return form.marca;
      case CHAVE_SISTEMA_MODELO:
        return form.modelo;
      case CHAVE_SISTEMA_NUMERO_SERIE:
        return form.numeroSerie;
      case CHAVE_SISTEMA_CODIGO_EMPRESA:
        return form.codigoEmpresa;
      case CHAVE_SISTEMA_NUMERO_NF_ENTRADA:
        return form.numeroNfEntrada;
      case CHAVE_SISTEMA_ERP_CODIGO_ITEM:
        return form.erpCodigoItem;
      case CHAVE_SISTEMA_OBSERVACOES:
        return form.observacoes;
      default:
        return "";
    }
  }

  /*
   * Checa todo campo obrigatório (sistema + dinâmico, de qualquer bloco)
   * na ordem em que aparece na tela e devolve o primeiro vazio — é pra
   * esse que a tela rola e destaca ao tentar salvar, em vez de só um
   * alerta genérico no topo dizendo "falta algo".
   */
  function encontrarPrimeiroCampoInvalido(): CampoTipoEquipamento | null {
    const todosOrdenados = [
      ...(blocoFixo ? camposPorBloco.get(blocoFixo.id) ?? [] : []),
      ...blocosNormais.flatMap((bloco) => camposPorBloco.get(bloco.id) ?? []),
    ];

    for (const campo of todosOrdenados) {
      if (!campo.obrigatorio) continue;

      if (campo.ehSistema) {
        if (!valorAtualDoCampoSistema(campo.chave).trim()) return campo;
        continue;
      }

      const bruto = valoresCampos[campo.chave];
      const vazio =
        bruto === undefined || bruto === null || bruto === "" || (Array.isArray(bruto) && bruto.length === 0);
      if (vazio) return campo;
    }

    return null;
  }

  async function handleSalvar() {
    setErro(null);

    const campoInvalido = encontrarPrimeiroCampoInvalido();
    if (campoInvalido) {
      setCampoInvalidoId(campoInvalido.id);
      document.getElementById(`campo-${campoInvalido.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setTimeout(() => setCampoInvalidoId(null), 2800);
      return;
    }

    setSalvando(true);

    try {
      const formData = new FormData();
      formData.set("tipoEquipamentoId", tipoEquipamentoId);
      formData.set("nomeCliente", form.nomeCliente);
      formData.set("codigoCliente", form.codigoCliente);
      formData.set("valor", form.valor);
      formData.set("descricao", form.descricao);
      formData.set("marca", form.marca);
      formData.set("modelo", form.modelo);
      formData.set("numeroSerie", form.numeroSerie);
      formData.set("codigoEmpresa", form.codigoEmpresa);
      formData.set("numeroNfEntrada", form.numeroNfEntrada);
      formData.set("observacoes", form.observacoes);
      formData.set("erpCodigoItem", form.erpCodigoItem);
      formData.set("camposValores", JSON.stringify(valoresCampos));

      for (const [blocoId, arquivos] of Object.entries(evidencias)) {
        for (const arquivo of arquivos) {
          formData.append(`evidencias_${blocoId}`, arquivo);
        }
      }

      const resultado = await criarEquipamento(formData);

      if (resultado.ok && resultado.data) {
        setEquipamentoCriado(resultado.data);
      } else {
        setErro(resultado.message ?? "Não foi possível cadastrar o equipamento.");
      }
    } finally {
      setSalvando(false);
    }
  }

  if (equipamentoCriado) {
    return (
      <PageContainer>
        <PageHeader
          title="Entrada cadastrada"
          description={`Equipamento #${equipamentoCriado.numero} — ${equipamentoCriado.descricao}`}
        />

        <Card>
          <Stack gap={16}>
            <Alert variant="success">
              Entrada registrada com sucesso. Assim que a NF de entrada for lançada no ERP, a integração
              automática preenche NF, código do item, ID configurado e data de entrada — sem precisar de
              ação manual.
            </Alert>

            <Stack direction="row" gap={10}>
              <Button
                onClick={() =>
                  exportarPdfEntradaEquipamento(
                    equipamentoCriado,
                    camposDoTipo,
                    empresas.find((empresa) => empresa.codigo === equipamentoCriado.codigoEmpresa)?.nome ?? null
                  )
                }
              >
                <Download size={16} />
                Baixar relatório de entrada
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push(`/estoque-equipamentos-usados/${equipamentoCriado.id}`)}
              >
                Ver equipamento
              </Button>
            </Stack>
          </Stack>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Nova entrada"
        description="Cadastro de um equipamento usado no estoque."
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          {
            label: "Estoque de Equipamentos Usados",
            href: "/estoque-equipamentos-usados",
            icon: <Warehouse size={14} />,
          },
          { label: "Nova entrada", current: true },
        ]}
      />

      {erro && <Alert variant="danger">{erro}</Alert>}

      <Card title="Tipo de equipamento">
        <Field
          label="Tipo de equipamento"
          required
          hint="Define quais blocos e campos aparecem abaixo — gerenciado em Administração"
        >
          <Dropdown
            value={tipoEquipamentoId}
            options={[
              { value: "", label: "Selecione o tipo" },
              ...tipos.map((tipo) => ({ value: tipo.id, label: tipo.nome })),
            ]}
            onValueChange={setTipoEquipamentoId}
          />
        </Field>
      </Card>

      {tipoEquipamentoId && carregandoBlocos && <Loader label="Carregando formulário do tipo..." />}

      {tipoEquipamentoId && !carregandoBlocos && blocoFixo && (
        <Card title={blocoFixo.nome}>
          <Stack gap={16}>
            {renderCamposDoBlocoFixoAgrupados(camposPorBloco.get(blocoFixo.id) ?? [])}

            <Field
              label={`Evidências — ${blocoFixo.nome}`}
              hint="Fotos ou documentos da NF, do estado geral na chegada, etc. — imagens, PDF, Word ou Excel"
            >
              <FileUpload
                multiple
                accept={ACEITA_EVIDENCIAS}
                maxSizeMB={8}
                files={evidenciasDoBloco(blocoFixo.id)}
                onFilesChange={(files) => definirEvidenciasDoBloco(blocoFixo.id, files)}
              />
            </Field>
          </Stack>
        </Card>
      )}

      {!carregandoBlocos &&
        blocosNormais.map((bloco) => (
          <Card key={bloco.id} title={bloco.nome}>
            <Stack gap={16}>
              {(camposPorBloco.get(bloco.id) ?? []).length > 0 && (
                <FormGrid columns={2}>
                  {(camposPorBloco.get(bloco.id) ?? []).map((campo) => (
                    <CampoDinamicoInput
                      key={campo.id}
                      id={`campo-${campo.id}`}
                      highlighted={campoInvalidoId === campo.id}
                      campo={campo}
                      value={valoresCampos[campo.chave]}
                      onChange={(valor) => atualizarValorDinamico(campo.chave, valor)}
                    />
                  ))}
                </FormGrid>
              )}

              <Field label={`Evidências — ${bloco.nome}`} hint="Imagens, PDF, Word ou Excel">
                <FileUpload
                  multiple
                  accept={ACEITA_EVIDENCIAS}
                  maxSizeMB={8}
                  files={evidenciasDoBloco(bloco.id)}
                  onFilesChange={(files) => definirEvidenciasDoBloco(bloco.id, files)}
                />
              </Field>
            </Stack>
          </Card>
        ))}

      <Card>
        <Stack direction="row" justify="end">
          <Button onClick={handleSalvar} loading={salvando} disabled={!tipoEquipamentoId}>
            <Save size={16} />
            Cadastrar entrada
          </Button>
        </Stack>
      </Card>
    </PageContainer>
  );
}
