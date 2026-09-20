"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Home, ImageIcon, Pencil, Trash2, X } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Stack } from "@/components/ui/Stack";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { Toast } from "@/components/ui/Toast";
import type { ToastState } from "@/modules/admin-permissoes/types/toast.types";

import {
  atualizarAssinatura,
  excluirAssinatura,
  gerarAssinatura,
  listarAssinaturasGeradas,
  listarModelosAssinatura,
  urlArquivoAssinaturaGerada,
  urlImagemModelo,
} from "../services/assinaturas.service";
import type { AssinaturaGerada, ModeloAssinatura, ValoresFormularioAssinatura } from "../types/assinaturas.types";
import { carregarFontesAssinatura, carregarImagem, desenharAssinaturaNoCanvas } from "../utils/canvas";
import styles from "./AssinaturasPage.module.css";

const toastInicial: ToastState = { open: false, variant: "success", title: "", description: "" };

const valoresIniciais: ValoresFormularioAssinatura = {
  nome: "",
  sobrenome: "",
  setor: "",
  email: "",
  celular: "",
};

const POR_PAGINA_ASSINATURAS = 20;

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function AssinaturasPage() {
  const [toast, setToast] = useState<ToastState>(toastInicial);
  const [carregando, setCarregando] = useState(true);
  const [fontesProntas, setFontesProntas] = useState(false);

  const [modelos, setModelos] = useState<ModeloAssinatura[]>([]);
  const [modeloSelecionadoId, setModeloSelecionadoId] = useState<string | null>(null);
  const [valores, setValores] = useState<ValoresFormularioAssinatura>(valoresIniciais);

  const [previewAberto, setPreviewAberto] = useState(false);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [gerando, setGerando] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [assinaturas, setAssinaturas] = useState<AssinaturaGerada[]>([]);
  const [totalAssinaturas, setTotalAssinaturas] = useState(0);
  const [carregandoAssinaturas, setCarregandoAssinaturas] = useState(true);
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [assinaturaParaExcluir, setAssinaturaParaExcluir] = useState<AssinaturaGerada | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  /* null = formulário está criando uma assinatura nova; caso contrário, é o id da assinatura já gerada sendo editada (ver handleEditar). */
  const [assinaturaEmEdicaoId, setAssinaturaEmEdicaoId] = useState<string | null>(null);

  function mostrarFeedback(variant: ToastState["variant"], title: string, description: string) {
    setToast({ open: true, variant, title, description });
  }

  async function carregarAssinaturas() {
    setCarregandoAssinaturas(true);
    const resultado = await listarAssinaturasGeradas({ pagina, porPagina: POR_PAGINA_ASSINATURAS, busca: busca || undefined });
    if (resultado) {
      setAssinaturas(resultado.itens);
      setTotalAssinaturas(resultado.total);
    }
    setCarregandoAssinaturas(false);
  }

  useEffect(() => {
    let cancelado = false;

    async function inicial() {
      setCarregando(true);

      const [listaModelos] = await Promise.all([
        listarModelosAssinatura(),
        carregarFontesAssinatura().then(() => {
          if (!cancelado) setFontesProntas(true);
        }),
      ]);

      if (cancelado) return;
      setModelos(listaModelos);
      setCarregando(false);
    }

    inicial();

    return () => {
      cancelado = true;
    };
  }, []);

  /* Busca digitada separada da aplicada, com debounce -- mesmo padrão do log do admin (ver AssinaturasPainel.tsx). */
  useEffect(() => {
    const temporizador = setTimeout(() => {
      setBusca(buscaDigitada);
      setPagina(1);
    }, 400);
    return () => clearTimeout(temporizador);
  }, [buscaDigitada]);

  useEffect(() => {
    carregarAssinaturas();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carregarAssinaturas já lê busca/pagina do closure; incluí-la como dep recriaria o efeito a cada render
  }, [busca, pagina]);

  const modeloSelecionado = modelos.find((modelo) => modelo.id === modeloSelecionadoId) ?? null;
  const [imagemCarregada, setImagemCarregada] = useState<HTMLImageElement | null>(null);

  const camposPreenchidos =
    valores.nome.trim() && valores.sobrenome.trim() && valores.setor.trim() && valores.email.trim();

  /*
   * O <canvas> só existe no DOM depois que o Modal abre de verdade
   * (Modal desmonta os filhos quando fechado -- ver Modal.tsx, "if
   * (!mounted || !open) return null") -- desenhar direto dentro de
   * handleVisualizar (antes do setPreviewAberto de fato re-renderizar)
   * encontrava canvasRef.current ainda nulo e ficava em silêncio sem
   * desenhar nada (visto ao vivo: modal abria sempre em branco). Por
   * isso o desenho roda aqui, reagindo à abertura do modal.
   */
  useEffect(() => {
    if (previewAberto && imagemCarregada && modeloSelecionado && canvasRef.current) {
      desenharAssinaturaNoCanvas(canvasRef.current, imagemCarregada, modeloSelecionado.camposConfig, valores);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só deve redesenhar quando o modal abre/a imagem muda, não a cada tecla digitada nos campos
  }, [previewAberto, imagemCarregada]);

  async function handleVisualizar() {
    if (!modeloSelecionado) {
      mostrarFeedback("danger", "Selecione um modelo", "Escolha um modelo de assinatura antes de visualizar.");
      return;
    }
    if (!camposPreenchidos) {
      mostrarFeedback("danger", "Preencha os campos obrigatórios", "Nome, sobrenome, setor e e-mail são obrigatórios.");
      return;
    }

    setCarregandoPreview(true);

    try {
      const imagem = await carregarImagem(urlImagemModelo(modeloSelecionado.id));
      setImagemCarregada(imagem);
      setPreviewAberto(true);
    } catch {
      mostrarFeedback("danger", "Erro ao carregar o modelo", "Tente novamente em instantes.");
    } finally {
      setCarregandoPreview(false);
    }
  }

  async function handleSalvar() {
    if (!canvasRef.current || !modeloSelecionado) return;

    setGerando(true);

    try {
      const imagemBase64 = canvasRef.current.toDataURL("image/png");
      const payload = {
        modeloId: modeloSelecionado.id,
        nome: valores.nome.trim(),
        sobrenome: valores.sobrenome.trim(),
        setor: valores.setor.trim(),
        email: valores.email.trim(),
        celular: valores.celular.trim(),
        imagemBase64,
      };

      const resultado = assinaturaEmEdicaoId
        ? await atualizarAssinatura(assinaturaEmEdicaoId, payload)
        : await gerarAssinatura(payload);

      if (resultado.ok) {
        mostrarFeedback(
          "success",
          assinaturaEmEdicaoId ? "Assinatura atualizada" : "Assinatura gerada",
          assinaturaEmEdicaoId ? "As alterações foram salvas." : "Já está disponível em “Minhas assinaturas”."
        );
        setPreviewAberto(false);
        setAssinaturaEmEdicaoId(null);
        await carregarAssinaturas();
      } else {
        mostrarFeedback("danger", "Não foi possível salvar", resultado.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setGerando(false);
    }
  }

  function handleBaixar(id: string) {
    window.location.href = urlArquivoAssinaturaGerada(id);
  }

  /* Preenche o formulário com os dados já gerados -- a mesma tela de "Visualizar/Gerar" é reaproveitada, só muda o destino final (PATCH em vez de POST, ver handleSalvar). */
  function handleEditar(assinatura: AssinaturaGerada) {
    setAssinaturaEmEdicaoId(assinatura.id);
    setValores({
      nome: assinatura.nome,
      sobrenome: assinatura.sobrenome,
      setor: assinatura.setor,
      email: assinatura.email,
      celular: assinatura.celular ?? "",
    });

    const modeloAindaAtivo =
      assinatura.modeloId && modelos.some((modelo) => modelo.id === assinatura.modeloId);
    setModeloSelecionadoId(modeloAindaAtivo ? assinatura.modeloId : null);

    if (!modeloAindaAtivo) {
      mostrarFeedback(
        "danger",
        "Escolha um modelo",
        `O modelo "${assinatura.modeloNome}" não está mais disponível -- selecione outro pra continuar editando.`
      );
    }
  }

  function cancelarEdicao() {
    setAssinaturaEmEdicaoId(null);
    setValores(valoresIniciais);
    setModeloSelecionadoId(null);
  }

  async function handleConfirmarExclusao() {
    if (!assinaturaParaExcluir) return;
    setExcluindo(true);

    try {
      const resultado = await excluirAssinatura(assinaturaParaExcluir.id);

      mostrarFeedback(
        resultado.ok ? "success" : "danger",
        resultado.ok ? "Assinatura excluída" : "Não foi possível excluir",
        resultado.ok
          ? `A assinatura de ${assinaturaParaExcluir.nome} ${assinaturaParaExcluir.sobrenome} foi excluída.`
          : resultado.message ?? "Tente novamente em instantes."
      );

      if (resultado.ok) {
        if (assinaturaEmEdicaoId === assinaturaParaExcluir.id) cancelarEdicao();
        await carregarAssinaturas();
      }
    } finally {
      setExcluindo(false);
      setAssinaturaParaExcluir(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Gerador de assinatura de e-mail"
        description="Preencha os dados, escolha um modelo e gere sua assinatura -- fica salva aqui pra baixar de novo quando precisar."
      />
      <Breadcrumb items={[{ label: "Início", href: "/", icon: <Home size={14} /> }, { label: "Assinaturas" }]} />

      {carregando ? (
        <Loader label="Carregando modelos..." />
      ) : (
        <Stack gap={20}>
          <Card title="Dados da assinatura">
            <Stack gap={16}>
              {assinaturaEmEdicaoId && (
                <Alert
                  variant="info"
                  actions={
                    <Button variant="secondary" onClick={cancelarEdicao}>
                      <X size={14} />
                      Cancelar edição
                    </Button>
                  }
                >
                  Editando uma assinatura já gerada -- salvar substitui a versão anterior.
                </Alert>
              )}

              <FormGrid columns={2}>
                <Field label="Nome" htmlFor="assinatura-nome" required>
                  <Input
                    id="assinatura-nome"
                    value={valores.nome}
                    onChange={(event) => setValores((atual) => ({ ...atual, nome: event.target.value }))}
                  />
                </Field>
                <Field label="Sobrenome" htmlFor="assinatura-sobrenome" required>
                  <Input
                    id="assinatura-sobrenome"
                    value={valores.sobrenome}
                    onChange={(event) => setValores((atual) => ({ ...atual, sobrenome: event.target.value }))}
                  />
                </Field>
                <Field label="Setor" htmlFor="assinatura-setor" required>
                  <Input
                    id="assinatura-setor"
                    value={valores.setor}
                    onChange={(event) => setValores((atual) => ({ ...atual, setor: event.target.value }))}
                  />
                </Field>
                <Field label="E-mail" htmlFor="assinatura-email" required>
                  <Input
                    id="assinatura-email"
                    type="email"
                    value={valores.email}
                    onChange={(event) => setValores((atual) => ({ ...atual, email: event.target.value }))}
                  />
                </Field>
                <Field label="Celular/WhatsApp" htmlFor="assinatura-celular">
                  <Input
                    id="assinatura-celular"
                    value={valores.celular}
                    onChange={(event) => setValores((atual) => ({ ...atual, celular: event.target.value }))}
                  />
                </Field>
              </FormGrid>

              <Field label="Selecione um modelo">
                {modelos.length === 0 ? (
                  <EmptyState
                    icon={<ImageIcon size={24} />}
                    title="Nenhum modelo cadastrado"
                    description="Peça a um administrador para cadastrar um modelo em Administração."
                  />
                ) : (
                  <div className={styles.gradeModelos}>
                    {modelos.map((modelo) => (
                      <button
                        key={modelo.id}
                        type="button"
                        className={`${styles.cardModelo} ${
                          modeloSelecionadoId === modelo.id ? styles.cardModeloSelecionado : ""
                        }`}
                        onClick={() => setModeloSelecionadoId(modelo.id)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de modelo vinda do banco, não do pipeline de otimização do Next */}
                        <img src={urlImagemModelo(modelo.id)} alt={modelo.nome} className={styles.miniaturaModelo} />
                        <span>{modelo.nome}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Field>

              <Stack direction="row" justify="end">
                <Button
                  onClick={handleVisualizar}
                  loading={carregandoPreview}
                  disabled={!fontesProntas || !modeloSelecionado || !camposPreenchidos}
                >
                  {assinaturaEmEdicaoId ? "Visualizar alterações" : "Visualizar assinatura"}
                </Button>
              </Stack>
            </Stack>
          </Card>

          <Card
            title="Assinaturas geradas"
            description="Todas as assinaturas já geradas no portal, por qualquer pessoa -- baixe, edite ou exclua quando precisar."
          >
            <Stack gap={16}>
              <Field label="Buscar" htmlFor="assinaturas-busca">
                <Input
                  id="assinaturas-busca"
                  value={buscaDigitada}
                  placeholder="Nome da assinatura ou de quem gerou"
                  onChange={(event) => setBuscaDigitada(event.target.value)}
                />
              </Field>

              {carregandoAssinaturas ? (
                <Loader label="Carregando..." />
              ) : assinaturas.length === 0 ? (
                <EmptyState
                  icon={<ImageIcon size={24} />}
                  title="Nenhuma assinatura encontrada"
                  description={
                    busca
                      ? "Sem resultados para essa busca."
                      : "Gere a primeira assinatura acima."
                  }
                />
              ) : (
                <>
                  <Table minWidth={720}>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Nome</TableHeaderCell>
                        <TableHeaderCell>Modelo</TableHeaderCell>
                        <TableHeaderCell>Gerado por</TableHeaderCell>
                        <TableHeaderCell>Quando</TableHeaderCell>
                        <TableHeaderCell align="center">Ações</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {assinaturas.map((assinatura) => (
                        <TableRow key={assinatura.id}>
                          <TableCell>
                            {assinatura.nome} {assinatura.sobrenome}
                          </TableCell>
                          <TableCell>{assinatura.modeloNome}</TableCell>
                          <TableCell>{assinatura.usuarioNome}</TableCell>
                          <TableCell>
                            {formatarDataHora(assinatura.criadoEm)}
                            {assinatura.atualizadoEm && (
                              <span className={styles.editadoEm}>
                                {" "}
                                (editada em {formatarDataHora(assinatura.atualizadoEm)})
                              </span>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            <Stack direction="row" gap={6} justify="center">
                              <IconButton
                                icon={<Pencil size={15} />}
                                label="Editar assinatura"
                                size="small"
                                onClick={() => handleEditar(assinatura)}
                              />
                              <IconButton
                                icon={<Download size={15} />}
                                label="Baixar assinatura"
                                size="small"
                                onClick={() => handleBaixar(assinatura.id)}
                              />
                              <IconButton
                                icon={<Trash2 size={15} />}
                                label="Excluir assinatura"
                                size="small"
                                variant="danger"
                                onClick={() => setAssinaturaParaExcluir(assinatura)}
                              />
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Pagination
                    page={pagina}
                    totalPages={Math.max(1, Math.ceil(totalAssinaturas / POR_PAGINA_ASSINATURAS))}
                    onPageChange={setPagina}
                  />
                </>
              )}
            </Stack>
          </Card>
        </Stack>
      )}

      <Modal
        open={previewAberto}
        onClose={() => setPreviewAberto(false)}
        title={assinaturaEmEdicaoId ? "Confirmar alterações" : "Visualização da assinatura"}
        size="large"
      >
        <Stack gap={16}>
          <div className={styles.canvasContainer}>
            <canvas ref={canvasRef} className={styles.canvas} />
          </div>
          <Stack direction="row" justify="end">
            <Button onClick={handleSalvar} loading={gerando}>
              {assinaturaEmEdicaoId ? "Salvar alterações" : "Gerar assinatura"}
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={assinaturaParaExcluir !== null}
        title="Excluir assinatura?"
        message={`A assinatura de "${assinaturaParaExcluir?.nome} ${assinaturaParaExcluir?.sobrenome}" (gerada por ${assinaturaParaExcluir?.usuarioNome}) deixa de poder ser baixada. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="danger"
        loading={excluindo}
        onClose={() => setAssinaturaParaExcluir(null)}
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
