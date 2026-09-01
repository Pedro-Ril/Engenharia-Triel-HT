"use client";

import { useEffect, useState } from "react";
import { History, Home, Search } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/Autocomplete";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
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
import { Toast } from "@/components/ui/Toast";
import type { ToastState } from "@/modules/admin-permissoes/types/toast.types";
import { buscarUsuarioAtual } from "@/modules/auth/services/auth.service";

import {
  buscarEstruturaCompleta,
  buscarHistoricoSubstituicao,
  listarEmpresasParaSubstituicao,
  obterAmbienteAtivo,
  substituirItemNaEstrutura,
  validarCodigosNoErp,
} from "../services/estruturaSubstituicao.service";
import type {
  AmbienteEstruturaSubstituicao,
  EmpresaEstruturaSubstituicao,
  EstruturaCompleta,
  HistoricoSubstituicaoItem,
} from "../types/estruturaSubstituicao.types";

const toastInicial: ToastState = { open: false, variant: "success", title: "", description: "" };
const ITENS_POR_PAGINA = 20;

export function EstruturaSubstituicaoPage() {
  const [toast, setToast] = useState<ToastState>(toastInicial);

  const [empresas, setEmpresas] = useState<EmpresaEstruturaSubstituicao[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [ambiente, setAmbiente] = useState<AmbienteEstruturaSubstituicao | null>(null);

  const [codPaiDigitado, setCodPaiDigitado] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [estrutura, setEstrutura] = useState<EstruturaCompleta | null>(null);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [paginaAtual, setPaginaAtual] = useState(1);

  const [codigoAntigo, setCodigoAntigo] = useState("");
  const [codigoNovo, setCodigoNovo] = useState("");
  const [validando, setValidando] = useState(false);
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [substituindo, setSubstituindo] = useState(false);

  const [historico, setHistorico] = useState<HistoricoSubstituicaoItem[]>([]);
  const [historicoPagina, setHistoricoPagina] = useState(1);
  const [historicoTotalPaginas, setHistoricoTotalPaginas] = useState(1);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);
  const [itemHistoricoEmVisualizacao, setItemHistoricoEmVisualizacao] =
    useState<HistoricoSubstituicaoItem | null>(null);

  const [codPaiFiltroDigitado, setCodPaiFiltroDigitado] = useState("");
  const [codPaiFiltroAplicado, setCodPaiFiltroAplicado] = useState("");

  async function carregarHistorico(pagina: number, codPai: string) {
    setCarregandoHistorico(true);
    try {
      const resultado = await buscarHistoricoSubstituicao(pagina, codPai);
      if (resultado.ok && resultado.data) {
        setHistorico(resultado.data.itens);
        setHistoricoTotalPaginas(resultado.data.totalPaginas);
        setHistoricoPagina(pagina);
      }
    } finally {
      setCarregandoHistorico(false);
    }
  }

  // Debounce: só aplica o filtro 400ms depois de parar de digitar, evitando uma requisição por tecla.
  useEffect(() => {
    const timer = setTimeout(() => {
      setCodPaiFiltroAplicado(codPaiFiltroDigitado.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [codPaiFiltroDigitado]);

  useEffect(() => {
    carregarHistorico(1, codPaiFiltroAplicado);
  }, [codPaiFiltroAplicado]);

  useEffect(() => {
    obterAmbienteAtivo().then(setAmbiente);

    /*
     * Pré-preenche a empresa com a cadastrada no usuário logado — só
     * quando dá pra saber com certeza qual é: se o usuário não tem
     * empresa vinculada, ou se mais de uma empresa cadastrada no
     * portal compartilha esse mesmo código, mantém o dropdown vazio
     * pra escolha manual em vez de arriscar um palpite errado.
     */
    Promise.all([listarEmpresasParaSubstituicao(), buscarUsuarioAtual()]).then(
      ([listaEmpresas, usuario]) => {
        setEmpresas(listaEmpresas);

        if (!usuario?.codigoEmpresa) return;

        const correspondentes = listaEmpresas.filter(
          (empresa) => empresa.codigo === usuario.codigoEmpresa
        );

        if (correspondentes.length === 1) {
          setEmpresaId(correspondentes[0].id);
        }
      }
    );
  }, []);

  function mostrarFeedback(variant: ToastState["variant"], title: string, description: string) {
    setToast({ open: true, variant, title, description });
  }

  function limparResultadoBusca() {
    setEstrutura(null);
    setErroBusca(null);
    setCodigoAntigo("");
    setCodigoNovo("");
    setPaginaAtual(1);
  }

  async function handleBuscar() {
    const codigo = codPaiDigitado.trim();
    if (!codigo) return;

    setBuscando(true);
    limparResultadoBusca();

    try {
      const resultado = await buscarEstruturaCompleta(codigo);

      if (resultado.ok && resultado.data) {
        setEstrutura(resultado.data);
      } else {
        setErroBusca(resultado.message ?? "Não foi possível buscar a estrutura.");
      }
    } finally {
      setBuscando(false);
    }
  }

  async function handleIniciarSubstituicao() {
    if (!estrutura || !empresaId || !codigoAntigo || !codigoNovo.trim()) return;

    const novo = codigoNovo.trim();

    if (novo === codigoAntigo) {
      mostrarFeedback("danger", "Códigos iguais", "O código substituto precisa ser diferente do original.");
      return;
    }

    setValidando(true);

    try {
      const resultado = await validarCodigosNoErp(empresaId, [novo]);

      if (!resultado.ok || !resultado.data) {
        mostrarFeedback(
          "danger",
          "Não foi possível validar",
          resultado.message ?? "Tente novamente em instantes."
        );
        return;
      }

      const validacao = resultado.data[0];

      if (!validacao || !validacao.existeNoErp) {
        mostrarFeedback(
          "danger",
          "Código substituto não encontrado",
          `O código "${novo}" não existe no ERP.`
        );
        return;
      }

      setConfirmacaoAberta(true);
    } finally {
      setValidando(false);
    }
  }

  async function handleConfirmarSubstituicao() {
    if (!estrutura || !empresaId || !codigoAntigo || !codigoNovo.trim()) return;

    setSubstituindo(true);

    try {
      const resultado = await substituirItemNaEstrutura({
        empresaId,
        codPai: estrutura.codigoRaiz,
        codigoAntigo,
        codigoNovo: codigoNovo.trim(),
      });

      if (resultado.ok) {
        const totalNiveis = resultado.data?.niveis.length ?? 0;
        mostrarFeedback(
          "success",
          "Substituição aplicada",
          `A estrutura foi atualizada no ERP em ${totalNiveis} nível(is).`
        );
        setConfirmacaoAberta(false);
        await Promise.all([handleBuscar(), carregarHistorico(1, codPaiFiltroAplicado)]);
      } else {
        mostrarFeedback(
          "danger",
          "Não foi possível substituir",
          resultado.message ?? "Tente novamente em instantes."
        );
        setConfirmacaoAberta(false);
        await Promise.all([handleBuscar(), carregarHistorico(1, codPaiFiltroAplicado)]);
      }
    } finally {
      setSubstituindo(false);
    }
  }

  const opcoesEmpresa = [
    { value: "", label: "Selecione a empresa..." },
    ...empresas.map((empresa) => ({
      value: empresa.id,
      label: empresa.codigo ? `${empresa.nome} (${empresa.codigo})` : empresa.nome,
    })),
  ];

  /*
   * A estrutura pode ter vários níveis, e o mesmo código pode ocorrer
   * como filho em mais de um nível abaixo do raiz pesquisado — o
   * seletor agrupa por código (não por ocorrência) e indica em quantos
   * níveis distintos aquele código aparece, já que a substituição age
   * em TODAS as ocorrências, não numa só.
   */
  const ocorrenciasPorCodigo = new Map<string, { descricao: string | null; paisDistintos: Set<string> }>();
  for (const item of estrutura?.itens ?? []) {
    const existente = ocorrenciasPorCodigo.get(item.codigo);
    if (existente) {
      existente.paisDistintos.add(item.codigoPai);
      existente.descricao ??= item.descricao;
    } else {
      ocorrenciasPorCodigo.set(item.codigo, {
        descricao: item.descricao,
        paisDistintos: new Set([item.codigoPai]),
      });
    }
  }

  const opcoesItem: AutocompleteOption[] = [...ocorrenciasPorCodigo.entries()].map(
    ([codigo, info]) => {
      const base = info.descricao ? `${codigo} — ${info.descricao}` : codigo;
      const rotuloNiveis = info.paisDistintos.size > 1 ? ` (em ${info.paisDistintos.size} níveis)` : "";
      return { value: codigo, label: `${base}${rotuloNiveis}` };
    }
  );

  const itemSelecionado = codigoAntigo ? ocorrenciasPorCodigo.get(codigoAntigo) ?? null : null;
  const opcaoSelecionada = codigoAntigo
    ? opcoesItem.find((opcao) => opcao.value === codigoAntigo) ?? null
    : null;
  const niveisAfetados = itemSelecionado ? [...itemSelecionado.paisDistintos] : [];

  const totalItens = estrutura?.itens.length ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalItens / ITENS_POR_PAGINA));
  const itensDaPagina =
    estrutura?.itens.slice(
      (paginaAtual - 1) * ITENS_POR_PAGINA,
      paginaAtual * ITENS_POR_PAGINA
    ) ?? [];

  function formatarDataHistorico(iso: string): string {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function formatarLogEnvio(item: HistoricoSubstituicaoItem): string {
    const ambienteLabel = item.ambiente === "teste" ? "Teste" : "Produção";
    const empresa = item.empresaNome ? ` · ${item.empresaNome}` : "";
    const paiLabel =
      item.codPaiRaiz && item.codPaiRaiz !== item.codPai
        ? `Raiz ${item.codPaiRaiz} · Nível ${item.codPai}`
        : item.codPai;
    return `${paiLabel}: ${item.codigoAntigo} → ${item.codigoNovo}${empresa} · Ambiente: ${ambienteLabel}`;
  }

  function formatarPayloadJson(payloadEnviado: string | null): string {
    if (!payloadEnviado) return "Nenhum payload registrado para este envio.";
    try {
      return JSON.stringify(JSON.parse(payloadEnviado), null, 2);
    } catch {
      return payloadEnviado;
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Substituição de item na estrutura"
        description="Troca o código de um item filho na estrutura de um produto, direto no ERP."
        actions={
          ambiente && (
            <Badge variant={ambiente === "teste" ? "warning" : "success"}>
              Ambiente: {ambiente === "teste" ? "Teste" : "Produção"}
            </Badge>
          )
        }
      />

      <Breadcrumb
        items={[
          { label: "Início", href: "/", icon: <Home /> },
          { label: "Substituição de item na estrutura" },
        ]}
      />

      <Stack gap={20}>
        <Card title="1. Localizar a estrutura">
          <Stack gap={16}>
            <FormGrid columns={2}>
              <Field label="Empresa" htmlFor="empresaId">
                <Dropdown
                  value={empresaId}
                  options={opcoesEmpresa}
                  onValueChange={(valor) => {
                    setEmpresaId(valor);
                    limparResultadoBusca();
                  }}
                />
              </Field>

              <Field label="Código pai da estrutura" htmlFor="codPai">
                <Stack direction="row" gap={10}>
                  <Input
                    id="codPai"
                    value={codPaiDigitado}
                    onChange={(event) => setCodPaiDigitado(event.target.value)}
                    placeholder="Ex: 40099"
                    disabled={!empresaId}
                  />

                  <Button
                    onClick={handleBuscar}
                    loading={buscando}
                    disabled={!empresaId || !codPaiDigitado.trim()}
                  >
                    <Search size={15} />
                    Buscar
                  </Button>
                </Stack>
              </Field>
            </FormGrid>

            {erroBusca && <Alert variant="danger">{erroBusca}</Alert>}
          </Stack>
        </Card>

        {estrutura && (
          <Card
            title={`2. Itens da estrutura — ${estrutura.codigoRaiz}${estrutura.descricaoRaiz ? ` (${estrutura.descricaoRaiz})` : ""}`}
            description={`${estrutura.itens.length} item(ns) no total, em todos os níveis abaixo deste código.`}
          >
            <Stack gap={16}>
              <Table minWidth={800}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Código</TableHeaderCell>
                    <TableHeaderCell>Descrição</TableHeaderCell>
                    <TableHeaderCell>Pai / Nível</TableHeaderCell>
                    <TableHeaderCell align="center">Sequência</TableHeaderCell>
                    <TableHeaderCell align="center">Quantidade</TableHeaderCell>
                    <TableHeaderCell>Data inicial</TableHeaderCell>
                    <TableHeaderCell>Data final</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {itensDaPagina.map((item, indice) => (
                    <TableRow key={`${item.codigoPai}-${item.codigo}-${item.sequencia}-${indice}`}>
                      <TableCell>
                        <strong>{item.codigo}</strong>
                      </TableCell>
                      <TableCell>{item.descricao ?? "—"}</TableCell>
                      <TableCell>
                        {item.codigoPai}
                        {item.descricaoPai ? ` — ${item.descricaoPai}` : ""}
                      </TableCell>
                      <TableCell align="center">{item.sequencia}</TableCell>
                      <TableCell align="center">{item.quantidade}</TableCell>
                      <TableCell>{item.dataInicial}</TableCell>
                      <TableCell>{item.dataFinal}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPaginas > 1 && (
                <Pagination
                  page={paginaAtual}
                  totalPages={totalPaginas}
                  onPageChange={setPaginaAtual}
                />
              )}
            </Stack>
          </Card>
        )}

        {estrutura && (
          <Card title="3. Substituir item" allowOverflow>
            <Stack gap={16}>
              <FormGrid columns={2}>
                <Field label="Código a substituir" htmlFor="codigoAntigo">
                  <Autocomplete
                    id="codigoAntigo"
                    options={opcoesItem}
                    selectedOption={opcaoSelecionada}
                    onSelect={(opcao) => setCodigoAntigo(opcao?.value ?? "")}
                    placeholder="Digite o início do código..."
                    maxOptions={50}
                    filterOption={(opcao, query) =>
                      opcao.value.toLocaleLowerCase("pt-BR").startsWith(query)
                    }
                  />
                </Field>

                <Field label="Código substituto" htmlFor="codigoNovo">
                  <Input
                    id="codigoNovo"
                    value={codigoNovo}
                    onChange={(event) => setCodigoNovo(event.target.value)}
                    placeholder="Ex: 36400"
                    disabled={!codigoAntigo}
                  />
                </Field>
              </FormGrid>

              {codigoAntigo && niveisAfetados.length > 0 && (
                <Alert variant={niveisAfetados.length > 1 ? "warning" : "info"}>
                  {niveisAfetados.length > 1
                    ? `Esse código aparece em ${niveisAfetados.length} níveis diferentes desta estrutura (pais: ${niveisAfetados.join(", ")}). Todas as ocorrências serão substituídas.`
                    : `Esse código aparece em 1 nível desta estrutura (pai: ${niveisAfetados[0]}).`}
                </Alert>
              )}

              <Stack direction="row" justify="end">
                <Button
                  onClick={handleIniciarSubstituicao}
                  loading={validando}
                  disabled={!codigoAntigo || !codigoNovo.trim()}
                >
                  Substituir
                </Button>
              </Stack>
            </Stack>
          </Card>
        )}

        <Card
          title="4. Histórico"
          description="Cada substituição enviada ao ERP, por quem e quando."
        >
          <Stack gap={16}>
            <Field
              label="Filtrar por código pai"
              htmlFor="filtroCodPaiHistorico"
              hint="Busca tanto pelo nível específico alterado quanto pelo código raiz pesquisado originalmente."
            >
              <Input
                id="filtroCodPaiHistorico"
                value={codPaiFiltroDigitado}
                onChange={(event) => setCodPaiFiltroDigitado(event.target.value)}
                placeholder="Ex: 40999"
              />
            </Field>

            {carregandoHistorico ? (
              <Loader label="Carregando histórico..." />
            ) : historico.length === 0 ? (
              <EmptyState
                icon={<History size={28} />}
                title={
                  codPaiFiltroAplicado
                    ? "Nenhum registro para esse código pai"
                    : "Nenhuma substituição registrada"
                }
                description={
                  codPaiFiltroAplicado
                    ? `Não há substituições registradas para o pai "${codPaiFiltroAplicado}".`
                    : "Os envios feitos por esta ferramenta aparecem aqui."
                }
              />
            ) : (
              <>
                <Table minWidth={800}>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Usuário</TableHeaderCell>
                      <TableHeaderCell>Ação</TableHeaderCell>
                      <TableHeaderCell>Log de envio</TableHeaderCell>
                      <TableHeaderCell>Data/hora</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {historico.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.usuarioNome}</TableCell>
                        <TableCell>Substituição de item</TableCell>
                        <TableCell>
                          <Stack gap={4}>
                            <Stack direction="row" align="center" gap={8}>
                              <button
                                type="button"
                                onClick={() => setItemHistoricoEmVisualizacao(item)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                }}
                                title="Ver JSON enviado ao ERP"
                              >
                                <Badge variant={item.sucesso ? "success" : "danger"}>
                                  {item.sucesso ? "Sucesso" : "Falha"}
                                </Badge>
                              </button>
                              <span>{formatarLogEnvio(item)}</span>
                            </Stack>
                            {!item.sucesso && item.mensagemErro && (
                              <span style={{ color: "var(--danger-text)", fontSize: 13 }}>
                                {item.mensagemErro}
                              </span>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>{formatarDataHistorico(item.criadoEm)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {historicoTotalPaginas > 1 && (
                  <Pagination
                    page={historicoPagina}
                    totalPages={historicoTotalPaginas}
                    onPageChange={(pagina) => carregarHistorico(pagina, codPaiFiltroAplicado)}
                  />
                )}
              </>
            )}
          </Stack>
        </Card>
      </Stack>

      <ConfirmDialog
        open={confirmacaoAberta}
        title="Confirmar substituição?"
        message={`O item "${codigoAntigo}"${
          itemSelecionado?.descricao ? ` (${itemSelecionado.descricao})` : ""
        } será substituído por "${codigoNovo.trim()}" em ${niveisAfetados.length} nível(is) desta estrutura (pai${
          niveisAfetados.length > 1 ? "s" : ""
        }: ${niveisAfetados.join(", ")}). Sequência, quantidade e datas são mantidas em cada nível. Essa mudança é enviada direto para o ERP, nível por nível.`}
        confirmLabel="Substituir"
        loading={substituindo}
        onClose={() => setConfirmacaoAberta(false)}
        onConfirm={handleConfirmarSubstituicao}
      />

      <Toast
        open={toast.open}
        variant={toast.variant}
        title={toast.title}
        description={toast.description}
        onClose={() => setToast((atual) => ({ ...atual, open: false }))}
      />

      <Modal
        open={itemHistoricoEmVisualizacao !== null}
        title="JSON enviado ao ERP"
        description={
          itemHistoricoEmVisualizacao
            ? `Pai ${itemHistoricoEmVisualizacao.codPai} · ${formatarDataHistorico(itemHistoricoEmVisualizacao.criadoEm)}`
            : undefined
        }
        size="medium"
        onClose={() => setItemHistoricoEmVisualizacao(null)}
      >
        <pre
          style={{
            margin: 0,
            padding: 16,
            background: "var(--bg-surface-muted)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            color: "var(--text)",
            fontSize: 13,
            lineHeight: 1.5,
            maxHeight: "60vh",
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {formatarPayloadJson(itemHistoricoEmVisualizacao?.payloadEnviado ?? null)}
        </pre>
      </Modal>
    </PageContainer>
  );
}
