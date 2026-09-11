"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Download,
  Handshake,
  History,
  Home,
  PackageCheck,
  PackageX,
  Paperclip,
  Pencil,
  PlugZap,
  RefreshCw,
  Warehouse,
} from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
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

import {
  atualizarDadosEquipamento,
  excluirEvidencia,
  listarTentativasNfEntrada,
  registrarBaixa,
  registrarConsignacao,
  registrarEmprestimo,
  registrarRetorno,
  tentarIntegracaoNfAgora,
} from "../services/estoque.service";
import type {
  AnexoMovimentacao,
  BlocoTipoEquipamento,
  CampoTipoEquipamento,
  EquipamentoComEstrato,
  EvidenciaEquipamento,
  HistoricoAlteracaoDadosTecnicos,
  MotivoBaixa,
  StatusEquipamento,
  TentativaIntegracaoNf,
  TipoAcaoMovimentacao,
} from "../types/estoque.types";
import { CampoDinamicoInput } from "./CampoDinamicoInput";
import { ClienteAutocomplete } from "./ClienteAutocomplete";
import { EvidenciasGaleria } from "./EvidenciasGaleria";
import { exportarPdfEntradaEquipamento, exportarPdfEstratoEquipamento } from "../utils/pdf-export";
import {
  CHAVE_SISTEMA_CODIGO_EMPRESA,
  CHAVE_SISTEMA_DATA_ENTRADA_NF,
  CHAVE_SISTEMA_DESCRICAO,
  CHAVE_SISTEMA_ERP_CODIGO_ITEM,
  CHAVE_SISTEMA_ID_CONFIGURADO,
  CHAVE_SISTEMA_MARCA,
  CHAVE_SISTEMA_MODELO,
  CHAVE_SISTEMA_NOME_CLIENTE,
  CHAVE_SISTEMA_NUMERO_NF_ENTRADA,
  CHAVE_SISTEMA_NUMERO_SERIE,
  CHAVE_SISTEMA_OBSERVACOES,
  CHAVE_SISTEMA_VALOR,
  CHAVES_SISTEMA_LARGURA_TOTAL,
  formatarMoeda,
} from "../constants";
import styles from "./EquipamentoDetalhePage.module.css";

const ACEITA_EVIDENCIAS = "image/*,.pdf,.doc,.docx,.xls,.xlsx";

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

const ACAO_LABELS: Record<TipoAcaoMovimentacao, string> = {
  entrada: "Entrada",
  emprestimo: "Empréstimo",
  consignacao: "Consignação",
  retorno: "Retorno ao estoque",
  baixa: "Baixa",
  nf_vinculada: "NF de entrada vinculada",
};

const STATUS_TENTATIVA_LABEL: Record<TentativaIntegracaoNf["status"], string> = {
  sucesso: "Sucesso",
  nao_encontrado: "Ainda não encontrado",
  erro: "Erro",
};

const STATUS_TENTATIVA_BADGE: Record<TentativaIntegracaoNf["status"], "success" | "warning" | "danger"> = {
  sucesso: "success",
  nao_encontrado: "warning",
  erro: "danger",
};

const OPCOES_MOTIVO_BAIXA: { value: MotivoBaixa; label: string }[] = [
  { value: "venda", label: "Venda" },
  { value: "descarte", label: "Descarte" },
  { value: "perda", label: "Perda" },
  { value: "outro", label: "Outro" },
];

function formatarData(dataIso: string): string {
  return new Date(dataIso).toLocaleDateString("pt-BR");
}

function formatarDataHora(dataIso: string): string {
  return new Date(dataIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarValorHistorico(valor: unknown): string {
  if (valor === undefined || valor === null || valor === "") return "-";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (Array.isArray(valor)) return valor.length > 0 ? valor.join(", ") : "-";
  return String(valor);
}

/* Corpo cru do ERP pode não ser JSON (ex: página de erro HTML de um 404) — nesse caso mostra o texto puro em vez de quebrar. */
function formatarCorpoResposta(corpo: string | null): string {
  if (!corpo) return "(sem corpo de resposta)";
  try {
    return JSON.stringify(JSON.parse(corpo), null, 2);
  } catch {
    return corpo;
  }
}

function formatarValorCampo(campo: CampoTipoEquipamento, valor: unknown): string {
  if (valor === undefined || valor === null || valor === "") return "-";
  if (campo.tipoDado === "booleano") return valor ? "Sim" : "Não";
  if (campo.tipoDado === "data") return formatarData(String(valor));
  if (campo.tipoDado === "multipla_escolha" && Array.isArray(valor)) return valor.join(", ") || "-";
  const texto = String(valor);
  return campo.unidade ? `${texto} ${campo.unidade}` : texto;
}

/*
 * Código e descrição SEMPRE ficam em colunas separadas no banco
 * (nome_cliente/codigo_cliente, codigo_empresa + nome resolvido à parte)
 * — "código | descrição" é só o formato de exibição, remontado aqui na
 * leitura, nunca gravado como uma string só.
 */
function formatarCodDescricao(codigo: string | null, descricao: string | null, vazio: string): string {
  if (codigo && descricao) return `${codigo} | ${descricao}`;
  return descricao || codigo || vazio;
}

/*
 * Valor de exibição de cada um dos 12 campos fixos do sistema — usada
 * pelo loop único do card "Recebimento" (ver render abaixo), que itera
 * os campos na ordem cadastrada em Administração em vez de uma sequência
 * fixa no código (senão um "Empresa" arrastado pro topo pelo admin nunca
 * apareceria primeiro aqui).
 */
function valorCampoSistemaExibicao(
  equipamento: EquipamentoComEstrato,
  campo: CampoTipoEquipamento,
  nomeEmpresa: string | null
): string {
  /* Placeholder segue o flag do campo, não a chave — qualquer campo
     marcado "vem de integração" no admin mostra "Aguardando integração"
     quando vazio, mesmo que amanhã seja um campo diferente dos 4 atuais. */
  const vazio = campo.vemDeIntegracao ? "Aguardando integração" : "-";

  switch (campo.chave) {
    case CHAVE_SISTEMA_NOME_CLIENTE:
      return formatarCodDescricao(equipamento.codigoCliente, equipamento.nomeCliente, vazio);
    case CHAVE_SISTEMA_VALOR:
      return formatarMoeda(equipamento.valor);
    case CHAVE_SISTEMA_MARCA:
      return equipamento.marca ?? vazio;
    case CHAVE_SISTEMA_MODELO:
      return equipamento.modelo ?? vazio;
    case CHAVE_SISTEMA_NUMERO_SERIE:
      return equipamento.numeroSerie ?? vazio;
    case CHAVE_SISTEMA_CODIGO_EMPRESA:
      return formatarCodDescricao(equipamento.codigoEmpresa, nomeEmpresa, vazio);
    case CHAVE_SISTEMA_NUMERO_NF_ENTRADA:
      return equipamento.numeroNfEntrada ?? vazio;
    case CHAVE_SISTEMA_ERP_CODIGO_ITEM:
      return equipamento.erpCodigoItem ?? vazio;
    case CHAVE_SISTEMA_ID_CONFIGURADO:
      return equipamento.erpIdItem ?? vazio;
    case CHAVE_SISTEMA_DATA_ENTRADA_NF:
      return equipamento.erpDataEntrada ? formatarData(equipamento.erpDataEntrada) : vazio;
    case CHAVE_SISTEMA_OBSERVACOES:
      return equipamento.observacoes ?? "-";
    default:
      return "-";
  }
}

type ModalAberto = "emprestimo" | "consignacao" | "retorno" | "baixa" | null;

interface EquipamentoDetalhePageProps {
  equipamento: EquipamentoComEstrato;
  blocosDoTipo: BlocoTipoEquipamento[];
  camposDoTipo: CampoTipoEquipamento[];
  evidencias: EvidenciaEquipamento[];
  anexosMovimentacoes: AnexoMovimentacao[];
  historicoDados: HistoricoAlteracaoDadosTecnicos[];
  nomeEmpresa: string | null;
}

export function EquipamentoDetalhePage({
  equipamento,
  blocosDoTipo,
  camposDoTipo,
  evidencias,
  anexosMovimentacoes,
  historicoDados,
  nomeEmpresa,
}: EquipamentoDetalhePageProps) {
  const router = useRouter();

  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [tentativasNfAberto, setTentativasNfAberto] = useState(false);
  const [tentativasNf, setTentativasNf] = useState<TentativaIntegracaoNf[]>([]);
  const [carregandoTentativasNf, setCarregandoTentativasNf] = useState(false);
  const [tentandoNfAgora, setTentandoNfAgora] = useState(false);
  const [erroTentativaNf, setErroTentativaNf] = useState<string | null>(null);
  const [tentativaDetalhada, setTentativaDetalhada] = useState<TentativaIntegracaoNf | null>(null);
  const [modalAberto, setModalAberto] = useState<ModalAberto>(null);
  const [numeroNf, setNumeroNf] = useState("");
  const [destinatarioNome, setDestinatarioNome] = useState("");
  const [motivoBaixa, setMotivoBaixa] = useState<MotivoBaixa>("venda");
  const [observacoes, setObservacoes] = useState("");
  const [anexosAcao, setAnexosAcao] = useState<File[]>([]);
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindoEvidenciaId, setExcluindoEvidenciaId] = useState<string | null>(null);

  const [editandoDados, setEditandoDados] = useState(false);
  const [nomeClienteEdit, setNomeClienteEdit] = useState(equipamento.nomeCliente ?? "");
  const [codigoClienteEdit, setCodigoClienteEdit] = useState(equipamento.codigoCliente ?? "");
  const [valorEdit, setValorEdit] = useState(equipamento.valor !== null ? String(equipamento.valor) : "");
  const [valoresCamposEdit, setValoresCamposEdit] = useState<Record<string, unknown>>(
    equipamento.camposValores ?? {}
  );
  const [evidenciasNovas, setEvidenciasNovas] = useState<Record<string, File[]>>({});
  const [motivoEdicaoDados, setMotivoEdicaoDados] = useState("");
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [erroDados, setErroDados] = useState<string | null>(null);

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

  /*
   * Os 12 campos fixos do sistema (cliente, valor, descrição...) agora têm
   * rótulo/obrigatório/ativo configuráveis pelo admin — este mapa deixa
   * consultar a config de cada um pela chave reservada (ex: sistemaValor)
   * pra rotular os Field certos com o texto atual no modal de edição
   * (o card "Recebimento" em si itera camposRecebimento direto, não usa
   * este mapa — precisa da ordem, que um Map por chave não preserva de
   * um jeito útil pra misturar campo de sistema com campo dinâmico).
   */
  const sistemaPorChave = useMemo(() => {
    const mapa = new Map<string, CampoTipoEquipamento>();
    if (blocoFixo) {
      for (const campo of camposPorBloco.get(blocoFixo.id) ?? []) {
        if (campo.ehSistema) mapa.set(campo.chave, campo);
      }
    }
    return mapa;
  }, [blocoFixo, camposPorBloco]);

  /*
   * Campos do bloco "Recebimento" na ordem cadastrada em Administração
   * (sistema + dinâmico intercalados) — Descrição fica de fora porque já
   * é o título da página, não repete como InfoCampo. Os marcados "vem de
   * integração" (NF de entrada, Código do item, ID Configurado, Data
   * Entrada NF) saem num card à parte ("Dados de Integração"), separados
   * dos dados preenchidos manualmente no cadastro.
   */
  const camposRecebimento = useMemo(() => {
    if (!blocoFixo) return [];
    return (camposPorBloco.get(blocoFixo.id) ?? [])
      .filter((campo) => campo.chave !== CHAVE_SISTEMA_DESCRICAO)
      .filter((campo) => !campo.vemDeIntegracao);
  }, [blocoFixo, camposPorBloco]);

  const camposIntegracao = useMemo(() => {
    if (!blocoFixo) return [];
    return (camposPorBloco.get(blocoFixo.id) ?? []).filter((campo) => campo.vemDeIntegracao);
  }, [blocoFixo, camposPorBloco]);

  const evidenciasPorBloco = useMemo(() => {
    const mapa = new Map<string, EvidenciaEquipamento[]>();
    for (const evidencia of evidencias) {
      if (!mapa.has(evidencia.blocoId)) mapa.set(evidencia.blocoId, []);
      mapa.get(evidencia.blocoId)?.push(evidencia);
    }
    return mapa;
  }, [evidencias]);

  const anexosPorMovimentacao = useMemo(() => {
    const mapa = new Map<string, AnexoMovimentacao[]>();
    for (const anexo of anexosMovimentacoes) {
      if (!mapa.has(anexo.movimentacaoId)) mapa.set(anexo.movimentacaoId, []);
      mapa.get(anexo.movimentacaoId)?.push(anexo);
    }
    return mapa;
  }, [anexosMovimentacoes]);

  function fecharModal() {
    setModalAberto(null);
    setNumeroNf("");
    setDestinatarioNome("");
    setMotivoBaixa("venda");
    setObservacoes("");
    setAnexosAcao([]);
    setErro(null);
  }

  async function handleConfirmarAcao() {
    setErro(null);
    setExecutando(true);

    try {
      const resultado =
        modalAberto === "emprestimo"
          ? await registrarEmprestimo(equipamento.id, {
              numeroNf,
              destinatarioNome,
              observacoes: observacoes || null,
              anexos: anexosAcao,
            })
          : modalAberto === "consignacao"
            ? await registrarConsignacao(equipamento.id, {
                numeroNf,
                destinatarioNome,
                observacoes: observacoes || null,
                anexos: anexosAcao,
              })
            : modalAberto === "retorno"
              ? await registrarRetorno(equipamento.id, { numeroNf, observacoes: observacoes || null })
              : modalAberto === "baixa"
                ? await registrarBaixa(equipamento.id, {
                    numeroNf,
                    motivoBaixa,
                    destinatarioNome: destinatarioNome || null,
                    observacoes: observacoes || null,
                    anexos: anexosAcao,
                  })
                : null;

      if (!resultado) return;

      if (resultado.ok) {
        fecharModal();
        router.refresh();
      } else {
        setErro(resultado.message ?? "Não foi possível concluir a ação.");
      }
    } finally {
      setExecutando(false);
    }
  }

  async function abrirTentativasNf() {
    setTentativasNfAberto(true);
    setCarregandoTentativasNf(true);
    setErroTentativaNf(null);

    try {
      const dados = await listarTentativasNfEntrada(equipamento.id);
      setTentativasNf(dados);
    } finally {
      setCarregandoTentativasNf(false);
    }
  }

  async function handleTentarNfAgora() {
    setErroTentativaNf(null);
    setTentandoNfAgora(true);

    try {
      const resultado = await tentarIntegracaoNfAgora(equipamento.id);

      if (resultado.ok) {
        setTentativasNf(resultado.data ?? []);
        router.refresh();
      } else {
        setErroTentativaNf(resultado.message ?? "Não foi possível concluir a tentativa.");
      }
    } finally {
      setTentandoNfAgora(false);
    }
  }

  async function handleExcluirEvidencia(id: string) {
    setExcluindoEvidenciaId(id);

    try {
      await excluirEvidencia(id);
      router.refresh();
    } finally {
      setExcluindoEvidenciaId(null);
    }
  }

  function abrirEdicaoDados() {
    setNomeClienteEdit(equipamento.nomeCliente ?? "");
    setCodigoClienteEdit(equipamento.codigoCliente ?? "");
    setValorEdit(equipamento.valor !== null ? String(equipamento.valor) : "");
    setValoresCamposEdit(equipamento.camposValores ?? {});
    setEvidenciasNovas({});
    setMotivoEdicaoDados("");
    setErroDados(null);
    setEditandoDados(true);
  }

  async function handleSalvarDados() {
    setErroDados(null);
    setSalvandoDados(true);

    try {
      const formData = new FormData();
      formData.set("nomeCliente", nomeClienteEdit);
      formData.set("codigoCliente", codigoClienteEdit);
      formData.set("valor", valorEdit);
      formData.set("camposValores", JSON.stringify(valoresCamposEdit));
      formData.set("motivo", motivoEdicaoDados);

      for (const [blocoId, arquivos] of Object.entries(evidenciasNovas)) {
        for (const arquivo of arquivos) {
          formData.append(`evidencias_${blocoId}`, arquivo);
        }
      }

      const resultado = await atualizarDadosEquipamento(equipamento.id, formData);

      if (resultado.ok) {
        setEditandoDados(false);
        router.refresh();
      } else {
        setErroDados(resultado.message ?? "Não foi possível salvar os dados.");
      }
    } finally {
      setSalvandoDados(false);
    }
  }

  /* Empréstimo/consignação exigem NF de entrada vinculada — mesma regra do backend (registrarMovimentacao). */
  const temNfEntrada = Boolean(equipamento.numeroNfEntrada);
  const podeEmprestar = equipamento.status === "em_estoque" && temNfEntrada;
  const podeConsignar = equipamento.status === "em_estoque" && temNfEntrada;
  const podeRetornar = equipamento.status === "emprestado" || equipamento.status === "consignado";
  const podeBaixar = equipamento.status === "em_estoque";

  /*
   * Mesmo card renderizado duas vezes (topo e rodapé da página) — pedido
   * explícito, pra não precisar rolar até o fim pra achar as ações mais
   * usadas. Extraído numa variável em vez de duplicar o JSX de verdade,
   * então qualquer ajuste futuro vale nos dois lugares de uma vez.
   */
  const cardAcoes = (
    <Card title="Ações">
      <Stack gap={12}>
        {equipamento.status === "em_estoque" && !temNfEntrada && (
          <Alert variant="warning">
            Empréstimo e consignação ficam bloqueados até este equipamento ter uma NF de entrada vinculada.
          </Alert>
        )}

        <Stack direction="row" gap={10} wrap>
          <Button
            variant="primary"
            onClick={() => exportarPdfEntradaEquipamento(equipamento, camposDoTipo, nomeEmpresa)}
          >
            <Download size={16} />
            Relatório do equipamento
          </Button>

          <Button variant="secondary" onClick={abrirEdicaoDados}>
            <Pencil size={16} />
            Editar dados técnicos
          </Button>

          {historicoDados.length > 0 && (
            <Button variant="secondary" onClick={() => setHistoricoAberto(true)}>
              <History size={16} />
              Ver alterações
            </Button>
          )}

          <Button variant="secondary" onClick={abrirTentativasNf}>
            <PlugZap size={16} />
            Tentativas de integração NF
          </Button>

          {podeEmprestar && (
            <Button onClick={() => setModalAberto("emprestimo")}>
              <Handshake size={16} />
              Registrar empréstimo
            </Button>
          )}

          {podeConsignar && (
            <Button onClick={() => setModalAberto("consignacao")}>
              <ArrowLeftRight size={16} />
              Registrar consignação
            </Button>
          )}

          {podeRetornar && (
            <Button onClick={() => setModalAberto("retorno")}>
              <PackageCheck size={16} />
              Registrar retorno ao estoque
            </Button>
          )}

          {podeBaixar && (
            <Button variant="danger" onClick={() => setModalAberto("baixa")}>
              <PackageX size={16} />
              Dar baixa
            </Button>
          )}
        </Stack>
      </Stack>
    </Card>
  );

  return (
    <PageContainer>
      <PageHeader
        title={equipamento.descricao}
        description={`Nº ${equipamento.numero}${equipamento.marca ? ` · ${equipamento.marca}` : ""}${equipamento.modelo ? ` ${equipamento.modelo}` : ""}`}
        actions={<Badge variant={STATUS_BADGE[equipamento.status]}>{STATUS_LABELS[equipamento.status]}</Badge>}
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home size={14} /> },
          {
            label: "Estoque de Equipamentos Usados",
            href: "/estoque-equipamentos-usados",
            icon: <Warehouse size={14} />,
          },
          { label: `Nº ${equipamento.numero}`, current: true },
        ]}
      />

      {cardAcoes}

      <Card title={blocoFixo?.nome ?? "Dados do equipamento"}>
        <Stack gap={20}>
          <FormGrid columns={3}>
            {camposRecebimento
              .filter((campo) => !CHAVES_SISTEMA_LARGURA_TOTAL.includes(campo.chave))
              .map((campo) => (
                <InfoCampo
                  key={campo.id}
                  label={campo.rotulo}
                  valor={
                    campo.ehSistema
                      ? valorCampoSistemaExibicao(equipamento, campo, nomeEmpresa)
                      : formatarValorCampo(campo, equipamento.camposValores?.[campo.chave])
                  }
                />
              ))}
            <InfoCampo label="Cadastrado por" valor={equipamento.criadoPorNome} />
            <InfoCampo label="Cadastrado em" valor={formatarData(equipamento.criadoEm)} />
          </FormGrid>

          {camposRecebimento
            .filter((campo) => CHAVES_SISTEMA_LARGURA_TOTAL.includes(campo.chave))
            .map((campo) => (
              <InfoCampo
                key={campo.id}
                label={campo.rotulo}
                valor={
                  campo.ehSistema
                    ? valorCampoSistemaExibicao(equipamento, campo, nomeEmpresa)
                    : formatarValorCampo(campo, equipamento.camposValores?.[campo.chave])
                }
              />
            ))}

          {blocoFixo && (
            <div>
              <p className={styles.infoLabel}>Evidências — {blocoFixo.nome}</p>
              <EvidenciasGaleria
                evidencias={evidenciasPorBloco.get(blocoFixo.id) ?? []}
                onExcluir={handleExcluirEvidencia}
                excluindo={excluindoEvidenciaId}
              />
            </div>
          )}
        </Stack>
      </Card>

      {camposIntegracao.length > 0 && (
        <Card title="Dados de Integração">
          <FormGrid columns={3}>
            {camposIntegracao.map((campo) => (
              <InfoCampo
                key={campo.id}
                label={campo.rotulo}
                valor={
                  campo.ehSistema
                    ? valorCampoSistemaExibicao(equipamento, campo, nomeEmpresa)
                    : formatarValorCampo(campo, equipamento.camposValores?.[campo.chave])
                }
              />
            ))}
          </FormGrid>
        </Card>
      )}

      {blocosNormais.map((bloco) => {
        const campos = camposPorBloco.get(bloco.id) ?? [];
        const evidenciasBloco = evidenciasPorBloco.get(bloco.id) ?? [];

        if (campos.length === 0 && evidenciasBloco.length === 0) return null;

        return (
          <Card key={bloco.id} title={bloco.nome}>
            <Stack gap={20}>
              {campos.length > 0 && (
                <FormGrid columns={3}>
                  {campos.map((campo) => (
                    <InfoCampo
                      key={campo.id}
                      label={campo.rotulo}
                      valor={formatarValorCampo(campo, equipamento.camposValores?.[campo.chave])}
                    />
                  ))}
                </FormGrid>
              )}

              <div>
                <p className={styles.infoLabel}>Evidências — {bloco.nome}</p>
                <EvidenciasGaleria
                  evidencias={evidenciasBloco}
                  onExcluir={handleExcluirEvidencia}
                  excluindo={excluindoEvidenciaId}
                />
              </div>
            </Stack>
          </Card>
        );
      })}

      {cardAcoes}

      <Card
        title="Extrato — histórico completo"
        actions={
          <Button
            variant="secondary"
            onClick={() => exportarPdfEstratoEquipamento(equipamento, anexosPorMovimentacao)}
          >
            <Download size={16} />
            Exportar extrato
          </Button>
        }
      >
        <Table minWidth={860}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Ação</TableHeaderCell>
              <TableHeaderCell>NF</TableHeaderCell>
              <TableHeaderCell>Destinatário</TableHeaderCell>
              <TableHeaderCell>Status resultante</TableHeaderCell>
              <TableHeaderCell>Anexos</TableHeaderCell>
              <TableHeaderCell>Responsável</TableHeaderCell>
              <TableHeaderCell>Data</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {equipamento.movimentacoes.map((movimentacao) => {
              const anexos = anexosPorMovimentacao.get(movimentacao.id) ?? [];

              return (
                <TableRow key={movimentacao.id}>
                  <TableCell>{ACAO_LABELS[movimentacao.tipoAcao]}</TableCell>
                  <TableCell>{movimentacao.numeroNf ?? "-"}</TableCell>
                  <TableCell>{movimentacao.destinatarioNome ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[movimentacao.statusResultante]}>
                      {STATUS_LABELS[movimentacao.statusResultante]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {anexos.length === 0 ? (
                      "-"
                    ) : (
                      <Stack gap={4}>
                        {anexos.map((anexo) => (
                          <a
                            key={anexo.id}
                            href={`/api/estoque-equipamentos-usados/anexos/${anexo.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.linkAnexo}
                          >
                            <Paperclip size={13} />
                            {anexo.nomeArquivo}
                          </a>
                        ))}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell>{movimentacao.criadoPorNome}</TableCell>
                  <TableCell>{formatarData(movimentacao.dataAcao)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Modal
        open={modalAberto === "emprestimo" || modalAberto === "consignacao"}
        title={modalAberto === "emprestimo" ? "Registrar empréstimo" : "Registrar consignação"}
        onClose={fecharModal}
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={fecharModal}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarAcao}
              loading={executando}
              disabled={!numeroNf.trim() || !destinatarioNome.trim()}
            >
              Confirmar
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          <Field label="Número da NF">
            <Input value={numeroNf} onChange={(event) => setNumeroNf(event.target.value)} />
          </Field>
          <Field label="Destinatário">
            <ClienteAutocomplete value={destinatarioNome} onChange={setDestinatarioNome} />
          </Field>
          <Field label="Observações">
            <Textarea rows={3} value={observacoes} onChange={(event) => setObservacoes(event.target.value)} />
          </Field>
          <Field label="Anexos" hint="Contrato, comprovante, etc. — imagens, PDF, Word ou Excel">
            <FileUpload
              multiple
              accept={ACEITA_EVIDENCIAS}
              maxSizeMB={8}
              files={anexosAcao}
              onFilesChange={setAnexosAcao}
            />
          </Field>
          {erro && <Alert variant="danger">{erro}</Alert>}
        </Stack>
      </Modal>

      <Modal
        open={modalAberto === "retorno"}
        title="Registrar retorno ao estoque"
        onClose={fecharModal}
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={fecharModal}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmarAcao} loading={executando} disabled={!numeroNf.trim()}>
              Confirmar
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          <Field label="Número da NF">
            <Input value={numeroNf} onChange={(event) => setNumeroNf(event.target.value)} />
          </Field>
          <Field label="Observações">
            <Textarea rows={3} value={observacoes} onChange={(event) => setObservacoes(event.target.value)} />
          </Field>
          {erro && <Alert variant="danger">{erro}</Alert>}
        </Stack>
      </Modal>

      <Modal
        open={modalAberto === "baixa"}
        title="Dar baixa no equipamento"
        onClose={fecharModal}
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={fecharModal}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmarAcao}
              loading={executando}
              disabled={!numeroNf.trim()}
            >
              Confirmar baixa
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          <Alert variant="warning">
            Esta ação é definitiva — depois da baixa, nenhuma outra movimentação é permitida para este
            equipamento.
          </Alert>
          <Field label="Número da NF">
            <Input value={numeroNf} onChange={(event) => setNumeroNf(event.target.value)} />
          </Field>
          <Field label="Motivo">
            <Dropdown
              value={motivoBaixa}
              options={OPCOES_MOTIVO_BAIXA}
              onValueChange={(valor) => setMotivoBaixa(valor as MotivoBaixa)}
            />
          </Field>
          <Field label="Destinatário" hint="Comprador, se aplicável">
            <ClienteAutocomplete value={destinatarioNome} onChange={setDestinatarioNome} />
          </Field>
          <Field label="Observações">
            <Textarea rows={3} value={observacoes} onChange={(event) => setObservacoes(event.target.value)} />
          </Field>
          <Field label="Anexos" hint="Nota fiscal, comprovante, etc. — imagens, PDF, Word ou Excel">
            <FileUpload
              multiple
              accept={ACEITA_EVIDENCIAS}
              maxSizeMB={8}
              files={anexosAcao}
              onFilesChange={setAnexosAcao}
            />
          </Field>
          {erro && <Alert variant="danger">{erro}</Alert>}
        </Stack>
      </Modal>

      <Modal
        open={historicoAberto}
        title="Histórico de alterações — dados técnicos"
        size="large"
        onClose={() => setHistoricoAberto(false)}
        footer={
          <Stack direction="row" justify="end">
            <Button variant="secondary" onClick={() => setHistoricoAberto(false)}>
              Fechar
            </Button>
          </Stack>
        }
      >
        <Table minWidth={860}>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Usuário</TableHeaderCell>
              <TableHeaderCell>Data/Hora</TableHeaderCell>
              <TableHeaderCell>Campo</TableHeaderCell>
              <TableHeaderCell>De</TableHeaderCell>
              <TableHeaderCell>Para</TableHeaderCell>
              <TableHeaderCell>Motivo</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {historicoDados.flatMap((registro) =>
              registro.alteracoes.map((alteracao, index) => (
                <TableRow key={`${registro.id}-${index}`}>
                  <TableCell>{registro.autorNome}</TableCell>
                  <TableCell>{formatarDataHora(registro.criadoEm)}</TableCell>
                  <TableCell>{alteracao.rotulo}</TableCell>
                  <TableCell>{formatarValorHistorico(alteracao.de)}</TableCell>
                  <TableCell>{formatarValorHistorico(alteracao.para)}</TableCell>
                  <TableCell>{registro.motivo ?? "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Modal>

      <Modal
        open={tentativasNfAberto}
        title="Tentativas de integração — NF de entrada"
        description="Consultas automáticas ao ERP feitas a cada intervalo configurado, buscando a NF de entrada por empresa, cliente e número do carro."
        size="large"
        onClose={() => setTentativasNfAberto(false)}
        footer={
          <Stack direction="row" justify="between">
            <Button variant="secondary" onClick={handleTentarNfAgora} loading={tentandoNfAgora}>
              <RefreshCw size={16} />
              Tentar agora
            </Button>
            <Button variant="secondary" onClick={() => setTentativasNfAberto(false)}>
              Fechar
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          {erroTentativaNf && <Alert variant="danger">{erroTentativaNf}</Alert>}

          {carregandoTentativasNf ? (
            <Loader label="Carregando tentativas..." />
          ) : tentativasNf.length === 0 ? (
            <p>Nenhuma tentativa de integração registrada ainda para este equipamento.</p>
          ) : (
            <Table minWidth={700}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Mensagem</TableHeaderCell>
                  <TableHeaderCell>Parâmetros da consulta</TableHeaderCell>
                  <TableHeaderCell>Quando</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tentativasNf.map((tentativa) => (
                  <TableRow key={tentativa.id}>
                    <TableCell>
                      <button
                        type="button"
                        className={styles.badgeClicavel}
                        onClick={() => setTentativaDetalhada(tentativa)}
                        title="Ver requisição e resposta completas"
                      >
                        <Badge variant={STATUS_TENTATIVA_BADGE[tentativa.status]}>
                          {STATUS_TENTATIVA_LABEL[tentativa.status]}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell>{tentativa.mensagem ?? "-"}</TableCell>
                    <TableCell>{tentativa.parametrosConsulta ?? "-"}</TableCell>
                    <TableCell>{formatarDataHora(tentativa.iniciadoEm)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Modal>

      <Modal
        open={tentativaDetalhada !== null}
        title="Detalhe da tentativa"
        size="large"
        onClose={() => setTentativaDetalhada(null)}
        footer={
          <Stack direction="row" justify="end">
            <Button variant="secondary" onClick={() => setTentativaDetalhada(null)}>
              Fechar
            </Button>
          </Stack>
        }
      >
        {tentativaDetalhada && (
          <Stack gap={16}>
            <FormGrid columns={3}>
              <InfoCampo
                label="Status"
                valor={STATUS_TENTATIVA_LABEL[tentativaDetalhada.status]}
              />
              <InfoCampo
                label="Quando"
                valor={formatarDataHora(tentativaDetalhada.iniciadoEm)}
              />
              <InfoCampo
                label="Disparado por"
                valor={tentativaDetalhada.disparadoPor ?? "Automático (job)"}
              />
            </FormGrid>

            <InfoCampo label="Mensagem" valor={tentativaDetalhada.mensagem ?? "-"} />

            <div>
              <p className={styles.infoLabel}>Requisição (URL completa)</p>
              <pre className={styles.blocoJson}>
                {tentativaDetalhada.requestUrl ?? "(nenhuma requisição chegou a ser feita)"}
              </pre>
            </div>

            <div>
              <p className={styles.infoLabel}>
                Resposta{tentativaDetalhada.responseStatus ? ` — HTTP ${tentativaDetalhada.responseStatus}` : ""}
              </p>
              <pre className={styles.blocoJson}>{formatarCorpoResposta(tentativaDetalhada.responseBody)}</pre>
            </div>
          </Stack>
        )}
      </Modal>

      <Modal
        open={editandoDados}
        title="Editar dados técnicos"
        size="large"
        onClose={() => setEditandoDados(false)}
        footer={
          <Stack direction="row" justify="end" gap={10}>
            <Button variant="secondary" onClick={() => setEditandoDados(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarDados}
              loading={salvandoDados}
              disabled={!motivoEdicaoDados.trim()}
            >
              Salvar
            </Button>
          </Stack>
        }
      >
        <Stack gap={20}>
          <FormGrid columns={2}>
            <Field
              label={sistemaPorChave.get(CHAVE_SISTEMA_NOME_CLIENTE)?.rotulo ?? "Cliente"}
              required={sistemaPorChave.get(CHAVE_SISTEMA_NOME_CLIENTE)?.obrigatorio}
            >
              <ClienteAutocomplete
                value={nomeClienteEdit}
                onChange={(valor) => {
                  setNomeClienteEdit(valor);
                  if (!valor) setCodigoClienteEdit("");
                }}
                onSelecionarItem={(item) => setCodigoClienteEdit(item.cod_cli)}
              />
            </Field>
            <Field
              label={sistemaPorChave.get(CHAVE_SISTEMA_VALOR)?.rotulo ?? "Valor"}
              required={sistemaPorChave.get(CHAVE_SISTEMA_VALOR)?.obrigatorio}
            >
              <CurrencyInput value={valorEdit} onValueChange={setValorEdit} />
            </Field>
          </FormGrid>

          {blocoFixo && (camposPorBloco.get(blocoFixo.id) ?? []).some((campo) => !campo.ehSistema) && (
            <FormGrid columns={2}>
              {(camposPorBloco.get(blocoFixo.id) ?? [])
                .filter((campo) => !campo.ehSistema)
                .map((campo) => (
                  <CampoDinamicoInput
                    key={campo.id}
                    campo={campo}
                    value={valoresCamposEdit[campo.chave]}
                    onChange={(valor) =>
                      setValoresCamposEdit((atual) => ({ ...atual, [campo.chave]: valor }))
                    }
                  />
                ))}
            </FormGrid>
          )}

          {blocoFixo && (
            <Field label={`Adicionar evidências — ${blocoFixo.nome}`} hint="Imagens, PDF, Word ou Excel">
              <FileUpload
                multiple
                accept={ACEITA_EVIDENCIAS}
                maxSizeMB={8}
                files={evidenciasNovas[blocoFixo.id] ?? []}
                onFilesChange={(files) =>
                  setEvidenciasNovas((atual) => ({ ...atual, [blocoFixo.id]: files }))
                }
              />
            </Field>
          )}

          {blocosNormais.map((bloco) => {
            const campos = camposPorBloco.get(bloco.id) ?? [];
            if (campos.length === 0) return null;

            return (
              <Stack key={bloco.id} gap={12}>
                <strong>{bloco.nome}</strong>
                <FormGrid columns={2}>
                  {campos.map((campo) => (
                    <CampoDinamicoInput
                      key={campo.id}
                      campo={campo}
                      value={valoresCamposEdit[campo.chave]}
                      onChange={(valor) =>
                        setValoresCamposEdit((atual) => ({ ...atual, [campo.chave]: valor }))
                      }
                    />
                  ))}
                </FormGrid>
                <Field label={`Adicionar evidências — ${bloco.nome}`} hint="Imagens, PDF, Word ou Excel">
                  <FileUpload
                    multiple
                    accept={ACEITA_EVIDENCIAS}
                    maxSizeMB={8}
                    files={evidenciasNovas[bloco.id] ?? []}
                    onFilesChange={(files) =>
                      setEvidenciasNovas((atual) => ({ ...atual, [bloco.id]: files }))
                    }
                  />
                </Field>
              </Stack>
            );
          })}

          <Field
            label="Motivo da alteração"
            required
            hint="Obrigatório em toda edição de dados técnicos — fica registrado no histórico de alterações"
          >
            <Textarea
              rows={3}
              value={motivoEdicaoDados}
              onChange={(event) => setMotivoEdicaoDados(event.target.value)}
            />
          </Field>

          {erroDados && <Alert variant="danger">{erroDados}</Alert>}
        </Stack>
      </Modal>
    </PageContainer>
  );
}

function InfoCampo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className={styles.infoCampo}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValor}>{valor}</span>
    </div>
  );
}
