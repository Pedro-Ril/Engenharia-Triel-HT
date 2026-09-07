"use client";

import { Trash2 } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { NumberInput } from "@/components/ui/NumberInput";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";

import type {
  BordaAncoragem,
  CampoDinamico,
  ElementoCota,
  ElementoImagemSvg,
  ElementoRetangulo,
  ElementoTextoDinamico,
  TemplateElemento,
  ValorGeometria,
  ValorPosicao,
} from "../types/template.types";

interface TemplateElementoPropriedadesProps {
  elemento: TemplateElemento;
  elementos: TemplateElemento[];
  camposDinamicos: CampoDinamico[];
  onAtualizar: (patch: Partial<TemplateElemento>) => void;
  onExcluir: () => void;
  onAbrirUpload: () => void;
}

const BORDAS_EIXO_X: { value: BordaAncoragem; label: string }[] = [
  { value: "esquerda", label: "Esquerda" },
  { value: "direita", label: "Direita" },
  { value: "centro", label: "Centro" },
];

const BORDAS_EIXO_Y: { value: BordaAncoragem; label: string }[] = [
  { value: "topo", label: "Topo" },
  { value: "base", label: "Base" },
  { value: "centro", label: "Centro" },
];

function SeletorPosicao({
  label,
  eixo,
  valor,
  elementosDisponiveis,
  onChange,
}: {
  label: string;
  eixo: "x" | "y";
  valor: ValorPosicao;
  elementosDisponiveis: TemplateElemento[];
  onChange: (valor: ValorPosicao) => void;
}) {
  const modo = typeof valor === "number" ? "fixo" : "ancorado";
  const bordas = eixo === "x" ? BORDAS_EIXO_X : BORDAS_EIXO_Y;

  return (
    <Stack gap={8}>
      <SegmentedTabs
        itens={[
          { valor: "fixo", label: "Valor fixo" },
          { valor: "ancorado", label: "Ancorado" },
        ]}
        ativo={modo}
        onSelecionar={(novoModo) => {
          if (novoModo === "fixo") {
            onChange(0);
          } else {
            onChange({
              tipo: "ancorado",
              elementoId: elementosDisponiveis[0]?.id ?? "",
              borda: bordas[0].value,
              deslocamentoMm: 0,
            });
          }
        }}
      />

      {modo === "fixo" ? (
        <Field label={`${label} (mm)`}>
          <NumberInput value={valor as number} onChange={(event) => onChange(Number(event.target.value))} />
        </Field>
      ) : (
        <FormGrid columns={1}>
          <Field label="Ancorado em">
            <Dropdown
              value={(valor as Extract<ValorPosicao, object>).elementoId}
              options={elementosDisponiveis.map((item) => ({ value: item.id, label: item.nome ?? item.id }))}
              onValueChange={(elementoId) => onChange({ ...(valor as Extract<ValorPosicao, object>), elementoId })}
            />
          </Field>
          <FormGrid columns={2}>
            <Field label="Borda">
              <Dropdown
                value={(valor as Extract<ValorPosicao, object>).borda}
                options={bordas}
                onValueChange={(borda) =>
                  onChange({ ...(valor as Extract<ValorPosicao, object>), borda: borda as BordaAncoragem })
                }
              />
            </Field>
            <Field label="Deslocamento (mm)">
              <NumberInput
                value={(valor as Extract<ValorPosicao, object>).deslocamentoMm}
                onChange={(event) =>
                  onChange({ ...(valor as Extract<ValorPosicao, object>), deslocamentoMm: Number(event.target.value) })
                }
              />
            </Field>
          </FormGrid>
        </FormGrid>
      )}
    </Stack>
  );
}

function SeletorGeometria({
  label,
  valor,
  camposDinamicos,
  onChange,
}: {
  label: string;
  valor: ValorGeometria;
  camposDinamicos: CampoDinamico[];
  onChange: (valor: ValorGeometria) => void;
}) {
  const modo = typeof valor === "number" ? "fixo" : "campo";
  const camposNumericos = camposDinamicos.filter((item) => item.tipoDado === "numero");

  return (
    <Stack gap={8}>
      <SegmentedTabs
        itens={[
          { valor: "fixo", label: "Valor fixo" },
          { valor: "campo", label: "Vinculado a campo" },
        ]}
        ativo={modo}
        onSelecionar={(novoModo) => {
          if (novoModo === "fixo") {
            onChange(10);
          } else {
            onChange({ tipo: "campo", campo: camposNumericos[0]?.chave ?? "", fatorMm: 1, deslocamentoMm: 0 });
          }
        }}
      />

      {modo === "fixo" ? (
        <Field label={`${label} (mm)`}>
          <NumberInput value={valor as number} onChange={(event) => onChange(Number(event.target.value))} />
        </Field>
      ) : (
        <FormGrid columns={1}>
          <Field label="Campo" hint="mm = valor do campo × fator + deslocamento">
            <Dropdown
              value={(valor as Extract<ValorGeometria, object>).campo}
              options={camposNumericos.map((item) => ({ value: item.chave, label: item.rotulo }))}
              onValueChange={(campo) => onChange({ ...(valor as Extract<ValorGeometria, object>), campo })}
            />
          </Field>
          <FormGrid columns={2}>
            <Field label="Fator (mm por unidade)">
              <NumberInput
                value={(valor as Extract<ValorGeometria, object>).fatorMm}
                onChange={(event) =>
                  onChange({ ...(valor as Extract<ValorGeometria, object>), fatorMm: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Deslocamento (mm)">
              <NumberInput
                value={(valor as Extract<ValorGeometria, object>).deslocamentoMm}
                onChange={(event) =>
                  onChange({
                    ...(valor as Extract<ValorGeometria, object>),
                    deslocamentoMm: Number(event.target.value),
                  })
                }
              />
            </Field>
          </FormGrid>
        </FormGrid>
      )}
    </Stack>
  );
}

export function TemplateElementoPropriedades({
  elemento,
  elementos,
  camposDinamicos,
  onAtualizar,
  onExcluir,
  onAbrirUpload,
}: TemplateElementoPropriedadesProps) {
  const outrosElementos = elementos.filter((item) => {
    if (item.id === elemento.id) return false;
    if ("xMm" in item && typeof item.xMm === "object" && item.xMm.elementoId === elemento.id) return false;
    if ("yMm" in item && typeof item.yMm === "object" && item.yMm.elementoId === elemento.id) return false;
    return true;
  });

  return (
    <Card
      title="Propriedades"
      actions={<IconButton icon={<Trash2 size={16} />} label="Excluir elemento" variant="danger" onClick={onExcluir} />}
    >
      <Stack gap={16}>
        <Field label="Nome">
          <Input
            value={elemento.nome ?? ""}
            onChange={(event) => onAtualizar({ nome: event.target.value || undefined })}
          />
        </Field>

        <FormGrid columns={2}>
          <Field label="Ordem">
            <NumberInput value={elemento.ordem} onChange={(event) => onAtualizar({ ordem: Number(event.target.value) })} />
          </Field>
          <Field label="Opacidade (0-1)">
            <NumberInput
              value={elemento.opacidade}
              min={0}
              max={1}
              step={0.1}
              onChange={(event) => onAtualizar({ opacidade: Number(event.target.value) })}
            />
          </Field>
        </FormGrid>

        <Stack direction="row" gap={16}>
          <Switch
            label="Visível"
            checked={elemento.visivel}
            onChange={(event) => onAtualizar({ visivel: event.target.checked })}
          />
          <Switch
            label="Bloqueado"
            checked={elemento.bloqueado}
            onChange={(event) => onAtualizar({ bloqueado: event.target.checked })}
          />
        </Stack>

        {elemento.tipo !== "cota" && (
          <>
            <SeletorPosicao
              label="X"
              eixo="x"
              valor={elemento.xMm}
              elementosDisponiveis={outrosElementos}
              onChange={(xMm) => onAtualizar({ xMm })}
            />
            <SeletorPosicao
              label="Y"
              eixo="y"
              valor={elemento.yMm}
              elementosDisponiveis={outrosElementos}
              onChange={(yMm) => onAtualizar({ yMm })}
            />
          </>
        )}

        {(elemento.tipo === "retangulo" || elemento.tipo === "imagem_svg") && (
          <>
            <SeletorGeometria
              label="Largura"
              valor={elemento.larguraMm}
              camposDinamicos={camposDinamicos}
              onChange={(larguraMm) => onAtualizar({ larguraMm })}
            />
            <SeletorGeometria
              label="Altura"
              valor={elemento.alturaMm}
              camposDinamicos={camposDinamicos}
              onChange={(alturaMm) => onAtualizar({ alturaMm })}
            />
          </>
        )}

        {elemento.tipo === "retangulo" && <PropriedadesRetangulo elemento={elemento} onAtualizar={onAtualizar} />}
        {elemento.tipo === "texto_dinamico" && (
          <PropriedadesTextoDinamico elemento={elemento} camposDinamicos={camposDinamicos} onAtualizar={onAtualizar} />
        )}
        {elemento.tipo === "cota" && (
          <PropriedadesCota elemento={elemento} elementos={outrosElementos} camposDinamicos={camposDinamicos} onAtualizar={onAtualizar} />
        )}
        {elemento.tipo === "imagem_svg" && (
          <PropriedadesImagemSvg elemento={elemento} onAtualizar={onAtualizar} onAbrirUpload={onAbrirUpload} />
        )}
      </Stack>
    </Card>
  );
}

function PropriedadesRetangulo({
  elemento,
  onAtualizar,
}: {
  elemento: ElementoRetangulo;
  onAtualizar: (patch: Partial<TemplateElemento>) => void;
}) {
  return (
    <Stack gap={12}>
      <Field label="Raio da borda (mm)">
        <NumberInput
          value={elemento.raioBordaMm}
          onChange={(event) => onAtualizar({ raioBordaMm: Number(event.target.value) } as Partial<TemplateElemento>)}
        />
      </Field>
      <FormGrid columns={2}>
        <Field label="Cor de preenchimento">
          <Input
            type="color"
            value={elemento.preenchimento?.cor ?? "#ffffff"}
            onChange={(event) =>
              onAtualizar({ preenchimento: { ...elemento.preenchimento, cor: event.target.value } } as Partial<TemplateElemento>)
            }
          />
        </Field>
        <Field label="Cor da borda">
          <Input
            type="color"
            value={elemento.borda?.cor ?? "#000000"}
            onChange={(event) =>
              onAtualizar({
                borda: { cor: event.target.value, espessuraMm: elemento.borda?.espessuraMm ?? 0.5 },
              } as Partial<TemplateElemento>)
            }
          />
        </Field>
      </FormGrid>
    </Stack>
  );
}

function PropriedadesTextoDinamico({
  elemento,
  camposDinamicos,
  onAtualizar,
}: {
  elemento: ElementoTextoDinamico;
  camposDinamicos: CampoDinamico[];
  onAtualizar: (patch: Partial<TemplateElemento>) => void;
}) {
  return (
    <Stack gap={12}>
      <Field label="Campo">
        <Dropdown
          value={elemento.campo}
          options={camposDinamicos.map((item) => ({ value: item.chave, label: item.rotulo }))}
          onValueChange={(campo) => onAtualizar({ campo } as Partial<TemplateElemento>)}
        />
      </Field>
      <FormGrid columns={2}>
        <Field label="Prefixo">
          <Input
            value={elemento.prefixo ?? ""}
            onChange={(event) => onAtualizar({ prefixo: event.target.value || undefined } as Partial<TemplateElemento>)}
          />
        </Field>
        <Field label="Sufixo">
          <Input
            value={elemento.sufixo ?? ""}
            onChange={(event) => onAtualizar({ sufixo: event.target.value || undefined } as Partial<TemplateElemento>)}
          />
        </Field>
      </FormGrid>
      <Field label="Unidade">
        <Input
          value={elemento.unidade ?? ""}
          onChange={(event) => onAtualizar({ unidade: event.target.value || undefined } as Partial<TemplateElemento>)}
        />
      </Field>
      <Switch
        label="Ocultar quando vazio"
        checked={elemento.ocultarQuandoVazio}
        onChange={(event) => onAtualizar({ ocultarQuandoVazio: event.target.checked } as Partial<TemplateElemento>)}
      />
      <FormGrid columns={2}>
        <Field label="Tamanho da fonte (mm)">
          <NumberInput
            value={elemento.estiloTexto.tamanhoFonteMm}
            onChange={(event) =>
              onAtualizar({
                estiloTexto: { ...elemento.estiloTexto, tamanhoFonteMm: Number(event.target.value) },
              } as Partial<TemplateElemento>)
            }
          />
        </Field>
        <Field label="Cor do texto">
          <Input
            type="color"
            value={elemento.estiloTexto.cor}
            onChange={(event) =>
              onAtualizar({
                estiloTexto: { ...elemento.estiloTexto, cor: event.target.value },
              } as Partial<TemplateElemento>)
            }
          />
        </Field>
      </FormGrid>
    </Stack>
  );
}

function PropriedadesCota({
  elemento,
  elementos,
  camposDinamicos,
  onAtualizar,
}: {
  elemento: ElementoCota;
  elementos: TemplateElemento[];
  camposDinamicos: CampoDinamico[];
  onAtualizar: (patch: Partial<TemplateElemento>) => void;
}) {
  const camposNumericos = camposDinamicos.filter((item) => item.tipoDado === "numero");

  return (
    <Stack gap={12}>
      <Field label="Orientação">
        <Dropdown
          value={elemento.orientacao}
          options={[
            { value: "horizontal", label: "Horizontal" },
            { value: "vertical", label: "Vertical" },
          ]}
          onValueChange={(orientacao) =>
            onAtualizar({ orientacao: orientacao as "horizontal" | "vertical" } as Partial<TemplateElemento>)
          }
        />
      </Field>

      <SegmentedTabs
        itens={[
          { valor: "limites_elemento", label: "Elemento" },
          { valor: "manual", label: "Manual" },
        ]}
        ativo={elemento.origem.modo}
        onSelecionar={(modo) =>
          onAtualizar({
            origem:
              modo === "limites_elemento"
                ? { modo: "limites_elemento", elementoId: elementos[0]?.id ?? "" }
                : { modo: "manual", inicioMm: 0, fimMm: 100 },
          } as Partial<TemplateElemento>)
        }
      />

      {elemento.origem.modo === "limites_elemento" ? (
        <Field label="Elemento medido">
          <Dropdown
            value={elemento.origem.elementoId}
            options={elementos.map((item) => ({ value: item.id, label: item.nome ?? item.id }))}
            onValueChange={(elementoId) =>
              onAtualizar({ origem: { modo: "limites_elemento", elementoId } } as Partial<TemplateElemento>)
            }
          />
        </Field>
      ) : (
        <FormGrid columns={2}>
          <Field label="Início (mm)">
            <NumberInput
              value={typeof elemento.origem.inicioMm === "number" ? elemento.origem.inicioMm : 0}
              onChange={(event) =>
                onAtualizar({
                  origem: { modo: "manual", inicioMm: Number(event.target.value), fimMm: (elemento.origem as { fimMm: number }).fimMm },
                } as Partial<TemplateElemento>)
              }
            />
          </Field>
          <Field label="Fim (mm)">
            <NumberInput
              value={typeof elemento.origem.fimMm === "number" ? elemento.origem.fimMm : 0}
              onChange={(event) =>
                onAtualizar({
                  origem: {
                    modo: "manual",
                    inicioMm: (elemento.origem as { inicioMm: number }).inicioMm,
                    fimMm: Number(event.target.value),
                  },
                } as Partial<TemplateElemento>)
              }
            />
          </Field>
        </FormGrid>
      )}

      <Field label="Campo de medida (rótulo)" hint="Se vazio, mostra a distância desenhada.">
        <Dropdown
          value={elemento.campoMedida ?? ""}
          options={[{ value: "", label: "Nenhum" }, ...camposNumericos.map((item) => ({ value: item.chave, label: item.rotulo }))]}
          onValueChange={(campoMedida) =>
            onAtualizar({ campoMedida: campoMedida || undefined } as Partial<TemplateElemento>)
          }
        />
      </Field>

      <FormGrid columns={2}>
        <Field label="Deslocamento da linha (mm)">
          <NumberInput
            value={elemento.deslocamentoMm}
            onChange={(event) => onAtualizar({ deslocamentoMm: Number(event.target.value) } as Partial<TemplateElemento>)}
          />
        </Field>
        <Field label="Casas decimais">
          <NumberInput
            value={elemento.casasDecimais}
            onChange={(event) => onAtualizar({ casasDecimais: Number(event.target.value) } as Partial<TemplateElemento>)}
          />
        </Field>
      </FormGrid>

      <FormGrid columns={2}>
        <Field label="Prefixo">
          <Input
            value={elemento.prefixo ?? ""}
            onChange={(event) => onAtualizar({ prefixo: event.target.value || undefined } as Partial<TemplateElemento>)}
          />
        </Field>
        <Field label="Sufixo/Unidade">
          <Input
            value={elemento.unidade}
            onChange={(event) => onAtualizar({ unidade: event.target.value } as Partial<TemplateElemento>)}
          />
        </Field>
      </FormGrid>
    </Stack>
  );
}

function PropriedadesImagemSvg({
  elemento,
  onAtualizar,
  onAbrirUpload,
}: {
  elemento: ElementoImagemSvg;
  onAtualizar: (patch: Partial<TemplateElemento>) => void;
  onAbrirUpload: () => void;
}) {
  return (
    <Stack gap={12}>
      <Field label="Arte SVG" hint={elemento.assetId ? `Asset: ${elemento.assetId}` : "Nenhum arquivo enviado ainda."}>
        <button
          type="button"
          onClick={onAbrirUpload}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border-input)",
            borderRadius: 8,
            background: "var(--bg-surface)",
            cursor: "pointer",
          }}
        >
          {elemento.assetId ? "Trocar arquivo" : "Enviar arquivo SVG"}
        </button>
      </Field>
      <Field label="Ajuste">
        <Dropdown
          value={elemento.ajuste}
          options={[
            { value: "conter", label: "Conter (preserva proporção)" },
            { value: "preencher", label: "Preencher (estica)" },
          ]}
          onValueChange={(ajuste) => onAtualizar({ ajuste: ajuste as "conter" | "preencher" } as Partial<TemplateElemento>)}
        />
      </Field>
    </Stack>
  );
}
