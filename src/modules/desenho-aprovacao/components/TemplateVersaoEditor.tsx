"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, Image as ImageIcon, RectangleHorizontal, Ruler, Type } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";
import {
  enviarAssetSvgTemplateAdmin,
  listarCamposDinamicosAdmin,
  preVisualizarVersaoTemplateAdmin,
  salvarRascunhoTemplateAdmin,
} from "@/modules/admin-permissoes/services/adminPermissoes.service";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";
import { resolverLayout, type BoundsResolvidos } from "@/modules/desenho-aprovacao/generator/resolve-template-layout";

import type {
  CampoDinamico,
  Template,
  TemplateElemento,
  TemplateJson,
  TemplateVersao,
} from "../types/template.types";
import { TemplateElementoPropriedades } from "./TemplateElementoPropriedades";

interface TemplateVersaoEditorProps {
  template: Template;
  versao: TemplateVersao;
  onVoltar: () => void;
  onVersaoAtualizada: (versao: TemplateVersao) => void;
  onFeedback: FeedbackHandler;
}

type AbaEditor = "editor" | "campos" | "codigo";

const ABAS: { valor: AbaEditor; label: string }[] = [
  { valor: "editor", label: "Editor" },
  { valor: "campos", label: "Campos" },
  { valor: "codigo", label: "Código-fonte" },
];

let proximoIdSequencial = 1;

function novoIdElemento(prefixo: string): string {
  proximoIdSequencial += 1;
  return `${prefixo}-${Date.now()}-${proximoIdSequencial}`;
}

function elementoBase(ordem: number) {
  return { ordem, visivel: true, bloqueado: false, opacidade: 1, rotacaoGraus: 0 };
}

function criarElementoPadrao(tipo: TemplateElemento["tipo"], ordem: number): TemplateElemento {
  switch (tipo) {
    case "retangulo":
      return {
        ...elementoBase(ordem),
        id: novoIdElemento("retangulo"),
        tipo: "retangulo",
        xMm: 10,
        yMm: 10,
        larguraMm: 50,
        alturaMm: 30,
        raioBordaMm: 0,
        preenchimento: { cor: "#e5e5e5" },
        borda: { cor: "#333333", espessuraMm: 0.5 },
      };

    case "texto_dinamico":
      return {
        ...elementoBase(ordem),
        id: novoIdElemento("texto"),
        tipo: "texto_dinamico",
        xMm: 10,
        yMm: 10,
        campo: "cliente",
        ocultarQuandoVazio: false,
        estiloTexto: {
          familiaFonte: "Arial",
          tamanhoFonteMm: 4,
          pesoFonte: "normal",
          cor: "#111111",
          alinhamentoHorizontal: "esquerda",
          alinhamentoVertical: "topo",
        },
      };

    case "cota":
      return {
        ...elementoBase(ordem),
        id: novoIdElemento("cota"),
        tipo: "cota",
        orientacao: "horizontal",
        origem: { modo: "manual", inicioMm: 10, fimMm: 60 },
        deslocamentoMm: 5,
        extensaoMm: 2,
        tamanhoSetaMm: 1.6,
        espessuraMm: 0.35,
        corLinha: "#1f4e79",
        corTexto: "#111111",
        fonte: { familiaFonte: "Arial", tamanhoFonteMm: 3.8, cor: "#111111" },
        unidade: "mm",
        casasDecimais: 0,
        textoAcimaDaLinha: true,
      };

    case "imagem_svg":
      return {
        ...elementoBase(ordem),
        id: novoIdElemento("imagem"),
        tipo: "imagem_svg",
        xMm: 10,
        yMm: 10,
        larguraMm: 100,
        alturaMm: 60,
        assetId: "",
        ajuste: "conter",
      };
  }
}

function coletarCamposUsados(elementos: TemplateElemento[]): string[] {
  const chaves = new Set<string>();

  for (const elemento of elementos) {
    if (elemento.tipo === "texto_dinamico") chaves.add(elemento.campo);
    if (elemento.tipo === "cota" && elemento.campoMedida) chaves.add(elemento.campoMedida);

    for (const valor of [
      "larguraMm" in elemento ? elemento.larguraMm : undefined,
      "alturaMm" in elemento ? elemento.alturaMm : undefined,
    ]) {
      if (valor && typeof valor === "object" && valor.tipo === "campo") chaves.add(valor.campo);
    }
  }

  return [...chaves];
}

export function TemplateVersaoEditor({
  template,
  versao,
  onVoltar,
  onVersaoAtualizada,
  onFeedback,
}: TemplateVersaoEditorProps) {
  const [templateJson, setTemplateJson] = useState<TemplateJson>(versao.templateJson);
  const [aba, setAba] = useState<AbaEditor>("editor");
  const [elementoSelecionadoId, setElementoSelecionadoId] = useState<string | null>(null);
  const [camposDinamicos, setCamposDinamicos] = useState<CampoDinamico[]>([]);
  const [valoresExemplo, setValoresExemplo] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [previewAberto, setPreviewAberto] = useState(false);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [codigoTexto, setCodigoTexto] = useState(() => JSON.stringify(versao.templateJson, null, 2));
  const [erroCodigo, setErroCodigo] = useState<string | null>(null);
  const [uploadAberto, setUploadAberto] = useState(false);
  const [arquivoSvg, setArquivoSvg] = useState<File[]>([]);
  const [enviandoAsset, setEnviandoAsset] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const arrastandoRef = useRef<{ id: string; startX: number; startY: number; xMm: number; yMm: number } | null>(
    null
  );

  useEffect(() => {
    listarCamposDinamicosAdmin().then(setCamposDinamicos);
  }, []);

  const camposUsados = useMemo(() => coletarCamposUsados(templateJson.elementos), [templateJson.elementos]);

  const valoresResolvidos = useMemo(() => {
    const valores: Record<string, unknown> = {};

    for (const chave of camposUsados) {
      const bruto = valoresExemplo[chave];
      const campo = camposDinamicos.find((item) => item.chave === chave);

      if (campo?.tipoDado === "numero") {
        valores[chave] = bruto ? Number(bruto) : 0;
      } else {
        valores[chave] = bruto ?? "";
      }
    }

    return valores;
  }, [camposUsados, valoresExemplo, camposDinamicos]);

  const { bounds, erroLayout } = useMemo(() => {
    try {
      return { bounds: resolverLayout(templateJson.elementos, valoresResolvidos), erroLayout: null };
    } catch (error) {
      return { bounds: new Map<string, BoundsResolvidos>(), erroLayout: error instanceof Error ? error.message : String(error) };
    }
  }, [templateJson.elementos, valoresResolvidos]);

  const elementoSelecionado = templateJson.elementos.find((item) => item.id === elementoSelecionadoId) ?? null;

  function atualizarElemento(id: string, patch: Partial<TemplateElemento>) {
    setTemplateJson((atual) => ({
      ...atual,
      elementos: atual.elementos.map((item) => (item.id === id ? ({ ...item, ...patch } as TemplateElemento) : item)),
    }));
  }

  function excluirElemento(id: string) {
    setTemplateJson((atual) => ({ ...atual, elementos: atual.elementos.filter((item) => item.id !== id) }));
    setElementoSelecionadoId(null);
  }

  function adicionarElemento(tipo: TemplateElemento["tipo"]) {
    const novo = criarElementoPadrao(tipo, templateJson.elementos.length + 1);
    setTemplateJson((atual) => ({ ...atual, elementos: [...atual.elementos, novo] }));
    setElementoSelecionadoId(novo.id);

    if (tipo === "imagem_svg") {
      setUploadAberto(true);
    }
  }

  function handlePointerDownElemento(
    event: ReactPointerEvent<SVGElement>,
    elemento: Exclude<TemplateElemento, { tipo: "cota" }>
  ) {
    if (elemento.bloqueado) return;
    if (typeof elemento.xMm !== "number" || typeof elemento.yMm !== "number") return;

    event.stopPropagation();
    setElementoSelecionadoId(elemento.id);

    arrastandoRef.current = {
      id: elemento.id,
      startX: event.clientX,
      startY: event.clientY,
      xMm: elemento.xMm,
      yMm: elemento.yMm,
    };

    (event.target as Element).setPointerCapture(event.pointerId);
  }

  function handlePointerMoveCanvas(event: ReactPointerEvent<SVGSVGElement>) {
    const arrastando = arrastandoRef.current;
    if (!arrastando || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mmPorPixel = templateJson.pagina.larguraMm / rect.width;

    const deltaXMm = (event.clientX - arrastando.startX) * mmPorPixel;
    const deltaYMm = (event.clientY - arrastando.startY) * mmPorPixel;

    atualizarElemento(arrastando.id, {
      xMm: Math.round((arrastando.xMm + deltaXMm) * 10) / 10,
      yMm: Math.round((arrastando.yMm + deltaYMm) * 10) / 10,
    } as Partial<TemplateElemento>);
  }

  function handlePointerUpCanvas() {
    arrastandoRef.current = null;
  }

  async function handleSalvar() {
    setSalvando(true);
    const resultado = await salvarRascunhoTemplateAdmin(template.id, versao.id, templateJson);
    setSalvando(false);

    if (!resultado.ok || !resultado.data) {
      onFeedback("danger", "Erro ao salvar", resultado.message ?? "Tente novamente.");
      return;
    }

    onVersaoAtualizada(resultado.data);
    setCodigoTexto(JSON.stringify(resultado.data.templateJson, null, 2));
    onFeedback("success", "Rascunho salvo", "As alterações foram gravadas.");
  }

  async function handlePreVisualizar() {
    setGerandoPreview(true);
    const resultado = await preVisualizarVersaoTemplateAdmin(template.id, versao.id, valoresResolvidos);
    setGerandoPreview(false);

    if (!resultado.ok || !resultado.data) {
      onFeedback("danger", "Erro ao gerar prévia", resultado.message ?? "Tente novamente.");
      return;
    }

    setPreviewSvg(resultado.data.svg);
    setPreviewAberto(true);
  }

  async function handleEnviarAsset() {
    if (arquivoSvg.length === 0) return;

    setEnviandoAsset(true);
    const resultado = await enviarAssetSvgTemplateAdmin(template.id, versao.id, arquivoSvg[0]);
    setEnviandoAsset(false);

    if (!resultado.ok || !resultado.data) {
      onFeedback("danger", "Erro ao enviar SVG", resultado.message ?? "Tente novamente.");
      return;
    }

    if (elementoSelecionado?.tipo === "imagem_svg") {
      atualizarElemento(elementoSelecionado.id, { assetId: resultado.data.id } as Partial<TemplateElemento>);
    }

    setUploadAberto(false);
    setArquivoSvg([]);
    onFeedback("success", "Arte enviada", `"${resultado.data.nome}" foi salva. Selecione-a no elemento de imagem.`);
  }

  function handleSalvarCodigo() {
    try {
      const parsed = JSON.parse(codigoTexto);
      setTemplateJson(parsed);
      setErroCodigo(null);
      onFeedback("success", "Código aplicado", 'Revise no "Editor" e clique em "Salvar rascunho" para persistir.');
    } catch {
      setErroCodigo("O texto não é um JSON válido.");
    }
  }

  return (
    <Stack gap={20}>
      <Stack direction="row" align="center" justify="between">
        <Stack direction="row" align="center" gap={12}>
          <IconButton icon={<ArrowLeft size={16} />} label="Voltar" onClick={onVoltar} />
          <div>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
              {template.nome} · versão #{versao.numeroVersao}
            </h2>
            <Badge variant={versao.status === "rascunho" ? "neutral" : "warning"}>
              {versao.status === "rascunho" ? "Rascunho" : "Em teste"}
            </Badge>
          </div>
        </Stack>

        <Stack direction="row" gap={8}>
          <Button variant="secondary" onClick={handlePreVisualizar} loading={gerandoPreview}>
            Pré-visualizar com dados reais
          </Button>
          <Button onClick={handleSalvar} loading={salvando}>
            Salvar rascunho
          </Button>
        </Stack>
      </Stack>

      <SegmentedTabs itens={ABAS} ativo={aba} onSelecionar={setAba} />

      {aba === "editor" && (
        <Stack direction="row" gap={16} align="start" wrap>
          <Stack gap={16} style={{ flex: "2 1 480px", minWidth: 420 }}>
            <Card title="Valores de exemplo" description="Digite valores para ver o layout reagir instantaneamente.">
              {camposUsados.length === 0 ? (
                <span style={{ color: "var(--text-soft)" }}>Nenhum campo usado ainda neste template.</span>
              ) : (
                <Stack direction="row" gap={12} wrap>
                  {camposUsados.map((chave) => {
                    const campo = camposDinamicos.find((item) => item.chave === chave);
                    return (
                      <Field key={chave} label={campo?.rotulo ?? chave} htmlFor={`exemplo-${chave}`}>
                        <Input
                          id={`exemplo-${chave}`}
                          value={valoresExemplo[chave] ?? ""}
                          placeholder={campo?.valorExemplo ?? ""}
                          onChange={(event) =>
                            setValoresExemplo((atual) => ({ ...atual, [chave]: event.target.value }))
                          }
                        />
                      </Field>
                    );
                  })}
                </Stack>
              )}
            </Card>

            <Card
              title="Adicionar elemento"
              actions={
                <Stack direction="row" gap={6}>
                  <IconButton
                    icon={<RectangleHorizontal size={16} />}
                    label="Adicionar retângulo"
                    onClick={() => adicionarElemento("retangulo")}
                  />
                  <IconButton icon={<Type size={16} />} label="Adicionar texto dinâmico" onClick={() => adicionarElemento("texto_dinamico")} />
                  <IconButton icon={<Ruler size={16} />} label="Adicionar cota" onClick={() => adicionarElemento("cota")} />
                  <IconButton icon={<ImageIcon size={16} />} label="Adicionar imagem SVG" onClick={() => adicionarElemento("imagem_svg")} />
                </Stack>
              }
            >
              {erroLayout && <Alert variant="danger">{erroLayout}</Alert>}

              <div style={{ overflowX: "auto" }}>
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${templateJson.pagina.larguraMm} ${templateJson.pagina.alturaMm}`}
                  style={{
                    width: "100%",
                    aspectRatio: `${templateJson.pagina.larguraMm} / ${templateJson.pagina.alturaMm}`,
                    background: templateJson.pagina.corFundo,
                    border: "1px solid var(--border)",
                    touchAction: "none",
                  }}
                  onPointerMove={handlePointerMoveCanvas}
                  onPointerUp={handlePointerUpCanvas}
                  onClick={() => setElementoSelecionadoId(null)}
                >
                  {[...templateJson.elementos]
                    .sort((a, b) => a.ordem - b.ordem)
                    .map((elemento) => {
                      const boundsElemento = bounds.get(elemento.id);
                      if (!boundsElemento || !elemento.visivel) return null;

                      const selecionado = elemento.id === elementoSelecionadoId;
                      const cursor =
                        "xMm" in elemento && typeof elemento.xMm === "number" && !elemento.bloqueado
                          ? "move"
                          : "default";

                      if (elemento.tipo === "retangulo") {
                        return (
                          <rect
                            key={elemento.id}
                            x={boundsElemento.left}
                            y={boundsElemento.top}
                            width={boundsElemento.width}
                            height={boundsElemento.height}
                            fill={elemento.preenchimento?.cor ?? "none"}
                            stroke={selecionado ? "var(--primary)" : elemento.borda?.cor ?? "none"}
                            strokeWidth={selecionado ? 1 : elemento.borda?.espessuraMm ?? 0}
                            style={{ cursor }}
                            onPointerDown={(event) => handlePointerDownElemento(event, elemento)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        );
                      }

                      if (elemento.tipo === "texto_dinamico") {
                        return (
                          <text
                            key={elemento.id}
                            x={boundsElemento.left}
                            y={boundsElemento.top + elemento.estiloTexto.tamanhoFonteMm}
                            fontSize={elemento.estiloTexto.tamanhoFonteMm}
                            fill={selecionado ? "var(--primary)" : elemento.estiloTexto.cor}
                            style={{ cursor }}
                            onPointerDown={(event) => handlePointerDownElemento(event, elemento)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {valoresResolvidos[elemento.campo] ? String(valoresResolvidos[elemento.campo]) : `{${elemento.campo}}`}
                          </text>
                        );
                      }

                      if (elemento.tipo === "imagem_svg") {
                        return (
                          <rect
                            key={elemento.id}
                            x={boundsElemento.left}
                            y={boundsElemento.top}
                            width={boundsElemento.width}
                            height={boundsElemento.height}
                            fill="var(--bg-surface-muted)"
                            stroke={selecionado ? "var(--primary)" : "var(--border-strong)"}
                            strokeDasharray="2 1"
                            style={{ cursor }}
                            onPointerDown={(event) => handlePointerDownElemento(event, elemento)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        );
                      }

                      return (
                        <line
                          key={elemento.id}
                          x1={boundsElemento.left}
                          y1={boundsElemento.top}
                          x2={boundsElemento.right}
                          y2={boundsElemento.bottom}
                          stroke={selecionado ? "var(--primary)" : elemento.corLinha}
                          strokeWidth={selecionado ? 1 : elemento.espessuraMm}
                          onClick={(event) => {
                            event.stopPropagation();
                            setElementoSelecionadoId(elemento.id);
                          }}
                        />
                      );
                    })}
                </svg>
              </div>
            </Card>
          </Stack>

          <div style={{ flex: "1 1 320px", minWidth: 300 }}>
            {elementoSelecionado ? (
              <TemplateElementoPropriedades
                elemento={elementoSelecionado}
                elementos={templateJson.elementos}
                camposDinamicos={camposDinamicos}
                onAtualizar={(patch) => atualizarElemento(elementoSelecionado.id, patch)}
                onExcluir={() => excluirElemento(elementoSelecionado.id)}
                onAbrirUpload={() => setUploadAberto(true)}
              />
            ) : (
              <Card title="Propriedades">
                <span style={{ color: "var(--text-soft)" }}>Selecione um elemento no canvas para editar.</span>
              </Card>
            )}
          </div>
        </Stack>
      )}

      {aba === "campos" && (
        <Card title="Catálogo de campos" description="Campos globais, reaproveitáveis por qualquer template.">
          <Stack gap={8}>
            {camposDinamicos.map((campo) => (
              <Stack key={campo.id} direction="row" justify="between" align="center">
                <span>
                  <strong>{campo.rotulo}</strong> — <code>{campo.chave}</code> ({campo.tipoDado})
                </span>
                {camposUsados.includes(campo.chave) && <Badge variant="info">Usado neste template</Badge>}
              </Stack>
            ))}
          </Stack>
        </Card>
      )}

      {aba === "codigo" && (
        <Card
          title="Código-fonte"
          description="Ajustes pontuais no template_json cru."
          actions={<Button onClick={handleSalvarCodigo}>Aplicar</Button>}
        >
          <Stack gap={12}>
            {erroCodigo && <Alert variant="danger">{erroCodigo}</Alert>}
            <Textarea
              value={codigoTexto}
              onChange={(event) => setCodigoTexto(event.target.value)}
              rows={24}
              style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
            />
          </Stack>
        </Card>
      )}

      <Modal open={previewAberto} title="Prévia com dados reais" size="large" onClose={() => setPreviewAberto(false)}>
        {previewSvg && (
          <div style={{ overflow: "auto", maxHeight: "70vh" }} dangerouslySetInnerHTML={{ __html: previewSvg }} />
        )}
      </Modal>

      <Modal
        open={uploadAberto}
        title="Enviar arte SVG"
        size="small"
        onClose={() => setUploadAberto(false)}
        footer={
          <Stack direction="row" gap={8} justify="end">
            <Button variant="secondary" onClick={() => setUploadAberto(false)} disabled={enviandoAsset}>
              Cancelar
            </Button>
            <Button onClick={handleEnviarAsset} loading={enviandoAsset} disabled={arquivoSvg.length === 0}>
              Enviar
            </Button>
          </Stack>
        }
      >
        <FileUpload
          accept=".svg,image/svg+xml"
          label="Selecionar arquivo SVG"
          description="Máx. 2MB. Sem <script> ou <foreignObject>."
          files={arquivoSvg}
          onFilesChange={setArquivoSvg}
        />
      </Modal>
    </Stack>
  );
}
