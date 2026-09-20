"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FileUpload } from "@/components/ui/FileUpload";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import {
  atualizarModeloAssinaturaAdmin,
  criarModeloAssinaturaAdmin,
  urlImagemModeloAdmin,
} from "@/modules/assinaturas/services/assinaturas.service";
import type {
  CampoAssinaturaConfig,
  CamposAssinaturaConfig,
  FonteAssinatura,
  ModeloAssinaturaAdmin,
  ValoresFormularioAssinatura,
} from "@/modules/assinaturas/types/assinaturas.types";
import {
  calcularPosicoesAssinatura,
  carregarFontesAssinatura,
  desenharAssinaturaNoCanvas,
} from "@/modules/assinaturas/utils/canvas";
import type { FeedbackHandler } from "../types/toast.types";
import styles from "./AssinaturaModeloEditor.module.css";

interface AssinaturaModeloEditorProps {
  modelo: ModeloAssinaturaAdmin | null;
  onSalvo: () => void;
  onCancelar: () => void;
  onFeedback: FeedbackHandler;
}

type ChaveCampo = keyof CamposAssinaturaConfig;

const CAMPOS: { valor: ChaveCampo; label: string }[] = [
  { valor: "nome", label: "Nome" },
  { valor: "sobrenome", label: "Sobrenome" },
  { valor: "setor", label: "Setor" },
  { valor: "email", label: "E-mail" },
  { valor: "celular", label: "Celular" },
];

const OPCOES_FONTE: { value: FonteAssinatura; label: string }[] = [
  { value: "Metropolis", label: "Metropolis" },
  { value: "Metropolis Bold", label: "Metropolis Bold" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Montserrat Bold", label: "Montserrat Bold" },
];

const VALORES_EXEMPLO: ValoresFormularioAssinatura = {
  nome: "João",
  sobrenome: "Silva",
  setor: "Setor Exemplo",
  email: "email@trielht.com.br",
  celular: "(11) 99999-9999",
};

function criarConfigPadrao(largura: number, altura: number): CamposAssinaturaConfig {
  const tamanhoPx = Math.max(12, Math.round(altura * 0.12));
  const x = Math.round(largura * 0.4);

  return {
    nome: { x, y: Math.round(altura * 0.3), tamanhoPx, fonte: "Metropolis Bold", cor: "#000000" },
    sobrenome: {
      x,
      y: Math.round(altura * 0.3),
      tamanhoPx,
      fonte: "Metropolis Bold",
      cor: "#ff0000",
      seguirNome: true,
      espacamentoAposNomePx: 20,
    },
    setor: { x, y: Math.round(altura * 0.42), tamanhoPx: Math.round(tamanhoPx * 0.6), fonte: "Metropolis", cor: "#000000" },
    email: { x, y: Math.round(altura * 0.65), tamanhoPx: Math.round(tamanhoPx * 0.55), fonte: "Metropolis", cor: "#000000" },
    celular: { x, y: Math.round(altura * 0.55), tamanhoPx: Math.round(tamanhoPx * 0.58), fonte: "Metropolis", cor: "#000000" },
  };
}

interface EstadoArrasto {
  campo: ChaveCampo;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  ajustaEspacamento: boolean;
}

export function AssinaturaModeloEditor({ modelo, onSalvo, onCancelar, onFeedback }: AssinaturaModeloEditorProps) {
  const [nome, setNome] = useState(modelo?.nome ?? "");
  const [ativo, setAtivo] = useState(modelo?.ativo ?? true);
  const [arquivoImagem, setArquivoImagem] = useState<File[]>([]);
  const [imagemUrl, setImagemUrl] = useState<string | null>(modelo ? urlImagemModeloAdmin(modelo.id) : null);
  const [imagemDimensoes, setImagemDimensoes] = useState<{ largura: number; altura: number } | null>(
    modelo ? { largura: modelo.imagemLargura, altura: modelo.imagemAltura } : null
  );
  const [camposConfig, setCamposConfig] = useState<CamposAssinaturaConfig | null>(modelo?.camposConfig ?? null);
  const [campoSelecionado, setCampoSelecionado] = useState<ChaveCampo>("nome");
  const [salvando, setSalvando] = useState(false);
  const [previewAberto, setPreviewAberto] = useState(false);
  const [fontesProntas, setFontesProntas] = useState(false);

  const imagemRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const arrastoRef = useRef<EstadoArrasto | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const canvasMedicao = useMemo(() => (typeof document !== "undefined" ? document.createElement("canvas") : null), []);
  const [posicoes, setPosicoes] = useState<Record<ChaveCampo, { x: number; y: number }> | null>(null);

  useEffect(() => {
    carregarFontesAssinatura().then(() => setFontesProntas(true));
  }, []);

  useEffect(() => {
    if (!canvasMedicao || !camposConfig) return;
    const ctx = canvasMedicao.getContext("2d");
    setPosicoes(calcularPosicoesAssinatura(ctx, camposConfig, VALORES_EXEMPLO));
  }, [camposConfig, canvasMedicao, fontesProntas]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function handleArquivoChange(files: File[]) {
    setArquivoImagem(files);
    const arquivo = files[0];
    if (!arquivo) return;

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(arquivo);
    objectUrlRef.current = url;

    const img = new window.Image();
    img.onload = () => {
      setImagemDimensoes({ largura: img.naturalWidth, altura: img.naturalHeight });
      setImagemUrl(url);
      setCamposConfig((atual) => atual ?? criarConfigPadrao(img.naturalWidth, img.naturalHeight));
    };
    img.src = url;
  }

  function atualizarCampo(campo: ChaveCampo, patch: Partial<CampoAssinaturaConfig>) {
    setCamposConfig((atual) => (atual ? { ...atual, [campo]: { ...atual[campo], ...patch } } : atual));
  }

  function atualizarSobrenome(patch: Partial<CamposAssinaturaConfig["sobrenome"]>) {
    setCamposConfig((atual) => (atual ? { ...atual, sobrenome: { ...atual.sobrenome, ...patch } } : atual));
  }

  function handlePointerDownAlca(event: ReactPointerEvent<HTMLDivElement>, campo: ChaveCampo) {
    event.preventDefault();
    setCampoSelecionado(campo);
    if (!imagemDimensoes || !camposConfig) return;

    const ajustaEspacamento = campo === "sobrenome" && camposConfig.sobrenome.seguirNome;

    arrastoRef.current = {
      campo,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: ajustaEspacamento ? camposConfig.sobrenome.espacamentoAposNomePx : camposConfig[campo].x,
      startY: camposConfig[campo].y,
      ajustaEspacamento,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMoveAlca(event: ReactPointerEvent<HTMLDivElement>) {
    const arrasto = arrastoRef.current;
    if (!arrasto || !imagemRef.current || !imagemDimensoes) return;

    const rect = imagemRef.current.getBoundingClientRect();
    if (rect.width === 0) return;
    const escala = imagemDimensoes.largura / rect.width;

    const deltaX = Math.round((event.clientX - arrasto.startClientX) * escala);
    const deltaY = Math.round((event.clientY - arrasto.startClientY) * escala);

    if (arrasto.ajustaEspacamento) {
      atualizarSobrenome({ espacamentoAposNomePx: arrasto.startX + deltaX, y: arrasto.startY + deltaY });
    } else {
      atualizarCampo(arrasto.campo, { x: arrasto.startX + deltaX, y: arrasto.startY + deltaY });
    }
  }

  function handlePointerUpAlca() {
    arrastoRef.current = null;
  }

  function handlePreVisualizar() {
    if (!imagemRef.current || !camposConfig) return;
    setPreviewAberto(true);
  }

  /*
   * O <canvas> do preview só existe no DOM depois que o Modal abre de
   * verdade (Modal desmonta os filhos quando fechado) -- desenhar
   * direto no clique do botão encontrava previewCanvasRef.current
   * ainda nulo (o guard fazia a função inteira retornar sem nunca
   * abrir o modal). Por isso o desenho roda aqui, reagindo à abertura.
   */
  useEffect(() => {
    if (previewAberto && imagemRef.current && camposConfig && previewCanvasRef.current) {
      desenharAssinaturaNoCanvas(previewCanvasRef.current, imagemRef.current, camposConfig, VALORES_EXEMPLO);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só deve redesenhar quando o modal abre, não a cada ajuste de posição feito enquanto ele está fechado
  }, [previewAberto]);

  async function handleSalvar() {
    if (!nome.trim()) {
      onFeedback("danger", "Informe o nome do modelo", "O nome é obrigatório.");
      return;
    }
    if (!camposConfig) {
      onFeedback("danger", "Envie a imagem de fundo", "Selecione a imagem antes de salvar.");
      return;
    }
    const arquivo = arquivoImagem[0];
    if (!modelo && !arquivo) {
      onFeedback("danger", "Envie a imagem de fundo", "Selecione a imagem antes de salvar.");
      return;
    }

    setSalvando(true);

    try {
      const resultado = modelo
        ? await atualizarModeloAssinaturaAdmin(modelo.id, {
            nome: nome.trim(),
            camposConfig,
            ativo,
            ...(arquivo ? { imagem: arquivo } : {}),
          })
        : await criarModeloAssinaturaAdmin({ nome: nome.trim(), imagem: arquivo!, camposConfig });

      if (resultado.ok) {
        onFeedback("success", modelo ? "Modelo atualizado" : "Modelo criado", resultado.message ?? "Salvo.");
        onSalvo();
      } else {
        onFeedback("danger", "Não foi possível salvar", resultado.message ?? "Tente novamente em instantes.");
      }
    } finally {
      setSalvando(false);
    }
  }

  const configSelecionada = camposConfig?.[campoSelecionado] ?? null;

  return (
    <Stack gap={20}>
      <Field label="Nome do modelo" htmlFor="assinatura-modelo-nome" required>
        <Input id="assinatura-modelo-nome" value={nome} onChange={(event) => setNome(event.target.value)} />
      </Field>

      <Field
        label={imagemUrl ? "Substituir imagem de fundo" : "Imagem de fundo"}
        hint="PNG -- a resolução da imagem enviada define a resolução final da assinatura gerada."
        required={!modelo}
      >
        <FileUpload accept="image/png" maxSizeMB={10} files={arquivoImagem} onFilesChange={handleArquivoChange} />
      </Field>

      {modelo && (
        <Switch label={ativo ? "Ativo (aparece pra seleção)" : "Inativo (oculto)"} checked={ativo} onChange={(event) => setAtivo(event.target.checked)} />
      )}

      {imagemUrl && imagemDimensoes && camposConfig && configSelecionada && (
        <Stack direction="row" gap={20} align="start">
          <div className={styles.areaImagem}>
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem de fundo do modelo, exibida direto pro editor de posição (precisa de ref pra medir dimensões renderizadas) */}
            <img ref={imagemRef} src={imagemUrl} alt="Imagem de fundo do modelo" className={styles.imagemFundo} />

            {CAMPOS.map(({ valor, label }) => {
              const posicao = posicoes?.[valor];
              if (!posicao) return null;
              const config = camposConfig[valor];

              return (
                <div
                  key={valor}
                  className={`${styles.alca} ${campoSelecionado === valor ? styles.alcaSelecionada : ""}`}
                  style={{
                    left: `${(posicao.x / imagemDimensoes.largura) * 100}%`,
                    top: `${(posicao.y / imagemDimensoes.altura) * 100}%`,
                    fontFamily: `"${config.fonte}"`,
                    fontSize: `${(config.tamanhoPx / imagemDimensoes.largura) * 100}cqw`,
                    color: config.cor,
                  }}
                  onPointerDown={(event) => handlePointerDownAlca(event, valor)}
                  onPointerMove={handlePointerMoveAlca}
                  onPointerUp={handlePointerUpAlca}
                  title={label}
                >
                  {VALORES_EXEMPLO[valor]}
                </div>
              );
            })}
          </div>

          <Stack gap={12} className={styles.painelCampo}>
            <Field label="Campo selecionado">
              <Dropdown
                value={campoSelecionado}
                options={CAMPOS.map((campo) => ({ value: campo.valor, label: campo.label }))}
                onValueChange={(valor) => setCampoSelecionado(valor as ChaveCampo)}
              />
            </Field>

            <Field label="Fonte">
              <Dropdown
                value={configSelecionada.fonte}
                options={OPCOES_FONTE}
                onValueChange={(valor) => atualizarCampo(campoSelecionado, { fonte: valor as FonteAssinatura })}
              />
            </Field>

            <Field label="Tamanho (px)">
              <NumberInput
                value={String(configSelecionada.tamanhoPx)}
                min={1}
                onChange={(event) => atualizarCampo(campoSelecionado, { tamanhoPx: Number(event.target.value) || 1 })}
              />
            </Field>

            <Field label="Cor">
              <input
                type="color"
                className={styles.corInput}
                value={configSelecionada.cor}
                onChange={(event) => atualizarCampo(campoSelecionado, { cor: event.target.value })}
              />
            </Field>

            <Stack direction="row" gap={10}>
              <Field label="X (px)">
                <NumberInput
                  value={String(configSelecionada.x)}
                  onChange={(event) => atualizarCampo(campoSelecionado, { x: Number(event.target.value) || 0 })}
                />
              </Field>
              <Field label="Y (px)">
                <NumberInput
                  value={String(configSelecionada.y)}
                  onChange={(event) => atualizarCampo(campoSelecionado, { y: Number(event.target.value) || 0 })}
                />
              </Field>
            </Stack>

            {campoSelecionado === "sobrenome" && (
              <>
                <Switch
                  label="Começa logo após o nome"
                  checked={camposConfig.sobrenome.seguirNome}
                  onChange={(event) => atualizarSobrenome({ seguirNome: event.target.checked })}
                />
                {camposConfig.sobrenome.seguirNome && (
                  <Field label="Espaçamento após o nome (px)">
                    <NumberInput
                      value={String(camposConfig.sobrenome.espacamentoAposNomePx)}
                      onChange={(event) =>
                        atualizarSobrenome({ espacamentoAposNomePx: Number(event.target.value) || 0 })
                      }
                    />
                  </Field>
                )}
              </>
            )}
          </Stack>
        </Stack>
      )}

      <Stack direction="row" justify="end" gap={10}>
        <Button variant="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        {imagemUrl && camposConfig && (
          <Button variant="secondary" onClick={handlePreVisualizar} disabled={!fontesProntas}>
            Pré-visualizar
          </Button>
        )}
        <Button onClick={handleSalvar} loading={salvando}>
          Salvar
        </Button>
      </Stack>

      <Modal open={previewAberto} onClose={() => setPreviewAberto(false)} title="Pré-visualização" size="large">
        <div className={styles.previewContainer}>
          <canvas ref={previewCanvasRef} className={styles.previewCanvas} />
        </div>
      </Modal>
    </Stack>
  );
}
