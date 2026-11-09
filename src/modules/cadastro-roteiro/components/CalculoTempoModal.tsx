"use client";

import { useEffect, useState } from "react";
import { Calculator, Table2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Stack } from "@/components/ui/Stack";

import { calcularTempo } from "@/lib/tempos-maquina/calculo";
import { identificarMaterial } from "@/lib/tempos-maquina/materiais";
import type { ResultadoTempo } from "@/lib/tempos-maquina/tipos";
import { extrairEspessuraDaDescricaoMp } from "@/modules/integra-lantek-ve/utils/espessura";
import { ResultadoTempoView } from "@/modules/tempos-maquina/components/admin/ResultadoTempoView";
import styles from "@/modules/tempos-maquina/components/admin/TemposMaquina.module.css";
import { GeometriaManualCampos, ResumoDxf } from "@/modules/tempos-maquina/components/GeometriaPecaCampos";
import { PerfilTempoLeitura } from "@/modules/tempos-maquina/components/PerfilTempoLeitura";
import { buscarConfigTempos, buscarDxfDoItem, registrarCalculoTempo, type DxfDoItem } from "@/modules/tempos-maquina/services/temposRoteiro.service";
import type { ConfigTemposRoteiro } from "@/modules/tempos-maquina/types/temposMaquina.types";
import {
  GEOMETRIA_MANUAL_VAZIA,
  geometriaDoForm,
  numeroDoTexto,
  type GeometriaManualForm,
} from "@/modules/tempos-maquina/utils/geometria-form";
import { textoDeNumero } from "@/modules/tempos-maquina/utils/perfil-form";

import type { ComponenteEstrutura, RecursoForm, RoteiroTreeNode } from "../types/cadastroRoteiro.types";

const AUTOMATICA = "";
/* Área do DXF x área pelo peso do 3DX: acima disto, avisa (espessura ou material errados no 3DX ou no ERP). */
const DIFERENCA_AREA_AVISO = 0.1;

/*
 * A área do DXF confere com o peso do 3DX para essa espessura e material?
 * Se não, a espessura (ou o material) do 3DX e do ERP não batem.
 */
function avisoDeEspessura(
  pesoTexto: string | null | undefined,
  area: number | null,
  espessura: number | null,
  material: { nome: string; densidade: number } | null
): string | null {
  const peso = numeroDoTexto(String(pesoTexto ?? ""));
  if (!peso || !area || !espessura || !material) return null;
  const areaPeloPeso = (peso / (material.densidade * espessura)) * 1e6;
  if (Math.abs(area / areaPeloPeso - 1) <= DIFERENCA_AREA_AVISO) return null;
  const espessuraPeloPeso = (peso / (material.densidade * area)) * 1e6;
  return `O peso do 3DX (${pesoTexto} kg) não bate com o DXF numa chapa de ${textoDeNumero(espessura)} mm de ${material.nome.toLowerCase()}: daria ${textoDeNumero(espessuraPeloPeso, 2)} mm. Confira a espessura no 3DX e a matéria-prima no ERP antes de usar o tempo.`;
}

type Carga<T> = { estado: "carregando" } | { estado: "ok"; dados: T } | { estado: "erro"; mensagem: string };

interface CalculoTempoModalProps {
  item: RoteiroTreeNode;
  recursos: RecursoForm[];
  componentes: ComponenteEstrutura[];
  alternativo: number;
  seq: number | null;
  /* Código da unidade de medida da operação: o cálculo é em minutos. */
  unidade: string;
  onUsar: (tempoMin: number, info: { perfilNome: string; codRecurso: string }) => void;
  onClose: () => void;
}

/*
 * Cálculo automático de tempo da operação: máquina da operação (com
 * perfil ativo em Administração > Tempos de Máquina), espessura e
 * material da matéria-prima do ERP, geometria do DXF do item (ou
 * digitada). "Usar este tempo" recalcula no servidor, registra e
 * devolve o tempo para o campo -- sem usar, o tempo segue digitado.
 */
export function CalculoTempoModal({ item, recursos, componentes, alternativo, seq, unidade, onUsar, onClose }: CalculoTempoModalProps) {
  const [config, setConfig] = useState<Carga<ConfigTemposRoteiro>>({ estado: "carregando" });
  const [dxf, setDxf] = useState<Carga<DxfDoItem>>({ estado: "carregando" });

  /* Escolhas da pessoa; null = o padrão calculado a partir dos dados. */
  const [escolhaRecurso, setEscolhaRecurso] = useState<string | null>(null);
  const [escolhaMp, setEscolhaMp] = useState<string | null>(null);
  const [escolhaEspessura, setEscolhaEspessura] = useState<string | null>(null);
  const [escolhaVariante, setEscolhaVariante] = useState<string | null>(null);
  const [escolhaOrigem, setEscolhaOrigem] = useState<"dxf" | "manual" | null>(null);
  const [dobraFator, setDobraFator] = useState<string | null>(null);
  const [dobraQuantidade, setDobraQuantidade] = useState("1");
  const [manual, setManual] = useState<GeometriaManualForm>(GEOMETRIA_MANUAL_VAZIA);
  const [verTabela, setVerTabela] = useState(false);
  const [usando, setUsando] = useState(false);
  const [erroUsar, setErroUsar] = useState<string | null>(null);

  useEffect(() => {
    void buscarConfigTempos().then((r) =>
      setConfig(r.ok && r.data ? { estado: "ok", dados: r.data } : { estado: "erro", mensagem: r.message ?? "Não foi possível carregar os tempos de máquina." })
    );
    void buscarDxfDoItem(item.codigoNormalizado).then((r) =>
      setDxf(r.ok ? { estado: "ok", dados: r.data ?? null } : { estado: "erro", mensagem: r.message ?? "Não foi possível ler o DXF do item." })
    );
  }, [item.codigoNormalizado]);

  const cfg = config.estado === "ok" ? config.dados : null;

  /* Máquinas da operação que têm perfil ativo (a preferencial primeiro). O React Compiler memoriza o que vem abaixo. */
  const maquinas = !cfg
    ? []
    : [...recursos]
        .sort((a, b) => Number(b.preferencial) - Number(a.preferencial))
        .map((r) => {
          const ligacao = cfg.maquinas.find((m) => m.codRecurso === r.codRecurso.trim().toUpperCase());
          const perfilDaMaquina = ligacao ? cfg.perfis.find((p) => p.id === ligacao.perfilId) : undefined;
          return perfilDaMaquina ? { recurso: r, perfil: perfilDaMaquina } : null;
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);

  const maquina = maquinas.find((m) => m.recurso.codRecurso === escolhaRecurso) ?? maquinas[0] ?? null;
  const perfil = maquina?.perfil.parametros ?? null;

  const vigentes = componentes.filter((c) => c.vigente);
  const opcoesMp = vigentes.length ? vigentes : componentes;
  const mp = opcoesMp.find((c) => c.cod_item === escolhaMp) ?? opcoesMp.find((c) => /CHAPA/i.test(c.descricao ?? "")) ?? opcoesMp[0] ?? null;

  const espessuraTexto = escolhaEspessura ?? extrairEspessuraDaDescricaoMp(mp?.descricao);
  const espessura = numeroDoTexto(espessuraTexto);
  const material = cfg ? identificarMaterial(mp?.descricao, cfg.materiais) : null;

  const variantesPerfil = perfil?.metodo === "corte_cnc" ? perfil.variantes : [];
  const variantePadrao = material?.variante && variantesPerfil.some((v) => v.chave === material.variante) ? material.variante : AUTOMATICA;
  const variante = escolhaVariante ?? variantePadrao;

  const fatores = perfil?.metodo === "tabela_dimensao" && perfil.dobra?.regra === "fator" ? perfil.dobra.fatores : [];
  const fator = dobraFator ?? fatores[0]?.chave ?? "";

  const dxfDados = dxf.estado === "ok" ? dxf.dados : null;
  const dxfUtil = Boolean(dxfDados?.leitura.ok && dxfDados.leitura.geometria);
  const origem = escolhaOrigem ?? (dxfUtil ? "dxf" : "manual");
  const geometria = origem === "dxf" ? (dxfDados?.leitura.geometria ?? null) : geometriaDoForm(manual);

  const dadosPeca = geometria
    ? {
        espessuraMm: espessura ?? 0,
        geometria,
        variante: variante || null,
        dobra: { fator: fator || null, quantidade: numeroDoTexto(dobraQuantidade) },
      }
    : null;

  const resultado: ResultadoTempo | null = !perfil
    ? null
    : dadosPeca
      ? calcularTempo(perfil, dadosPeca)
      : { ok: false, tempoMin: null, parcelas: [], referencia: [], avisos: [], erros: ["Sem DXF do item: informe as medidas."] };

  const avisoArea = avisoDeEspessura(item.peso, origem === "dxf" ? (geometria?.areaMm2 ?? null) : null, espessura, material);

  async function usar() {
    if (!maquina || !dadosPeca || !resultado?.ok) return;
    setUsando(true);
    setErroUsar(null);
    const r = await registrarCalculoTempo({
      codItem: item.codigoNormalizado,
      revisao: item.revisao || null,
      alternativo,
      seq,
      codRecurso: maquina.recurso.codRecurso,
      origemGeometria: origem,
      arquivoDxf: origem === "dxf" ? (dxfDados?.caminho ?? null) : null,
      dados: dadosPeca,
      materiaPrima: mp?.descricao ?? null,
      material: material?.nome ?? null,
      peso3dx: item.peso ? String(item.peso) : null,
    });
    setUsando(false);
    if (!r.ok || !r.data || r.data.resultado.tempoMin === null) {
      setErroUsar(r.message ?? "Não foi possível registrar o cálculo.");
      return;
    }
    onUsar(r.data.resultado.tempoMin, { perfilNome: r.data.perfilNome, codRecurso: maquina.recurso.codRecurso });
  }

  const titulo = `Calcular tempo: ${item.codigoNormalizado}`;
  const rodape = (
    <Stack direction="row" gap={8} justify="end">
      <Button variant="secondary" onClick={onClose} disabled={usando}>
        Cancelar
      </Button>
      <Button onClick={() => void usar()} disabled={!resultado?.ok || usando} loading={usando} loadingLabel="Registrando...">
        <Calculator size={15} /> Usar este tempo
      </Button>
    </Stack>
  );

  if (config.estado !== "ok") {
    return (
      <Modal open size="medium" title={titulo} onClose={onClose}>
        {config.estado === "carregando" ? <Loader /> : <Alert variant="danger">{config.mensagem}</Alert>}
      </Modal>
    );
  }

  if (!maquina || !perfil) {
    const comCalculo = [...new Set(config.dados.maquinas.map((m) => m.codRecurso))];
    return (
      <Modal open size="medium" title={titulo} onClose={onClose}>
        <Alert variant="info" title={recursos.length ? "Esta máquina não tem cálculo automático" : "Escolha a máquina da operação"}>
          {recursos.length
            ? `Nenhuma máquina desta operação (${recursos.map((r) => r.codRecurso).join(", ")}) tem perfil de cálculo ativo.`
            : "O tempo é calculado pela máquina: escolha a máquina na seção Máquinas da operação."}{" "}
          {comCalculo.length
            ? `Máquinas com cálculo automático: ${comCalculo.join(", ")}.`
            : "Ainda não há máquina com cálculo automático (Administração > Tempos de Máquina)."}
        </Alert>
      </Modal>
    );
  }

  return (
    <Modal open size="xlarge" title={titulo} description={item.descricaoNormalizada || undefined} onClose={onClose} closeOnOverlay={false} footer={rodape}>
      <Stack gap={16}>
        {unidade && unidade.toUpperCase() !== "MIN" && (
          <Alert variant="warning">A unidade da operação é {unidade}; o cálculo dá minutos por peça.</Alert>
        )}
        {erroUsar && <Alert variant="danger">{erroUsar}</Alert>}

        <div className={styles.simulador}>
          <Card title="Peça">
            <Stack gap={16}>
              <FormGrid columns={2}>
                <Field label="Máquina" hint={`Perfil: ${maquina.perfil.nome}`}>
                  <Dropdown
                    value={maquina.recurso.codRecurso}
                    disabled={maquinas.length < 2}
                    onValueChange={(v) => {
                      setEscolhaRecurso(v);
                      setEscolhaVariante(null);
                      setDobraFator(null);
                    }}
                    options={maquinas.map((m) => ({ value: m.recurso.codRecurso, label: `${m.recurso.codRecurso}${m.recurso.descricao ? ` - ${m.recurso.descricao}` : ""}` }))}
                  />
                </Field>
                <Field label="Matéria-prima (ERP)" hint={material ? `${material.nome} · ${textoDeNumero(material.densidade, 3)} kg/dm³` : "Material não reconhecido"}>
                  <Dropdown
                    value={mp?.cod_item ?? ""}
                    disabled={opcoesMp.length < 2}
                    placeholder="Sem matéria-prima na estrutura"
                    onValueChange={(v) => {
                      setEscolhaMp(v);
                      setEscolhaEspessura(null);
                      setEscolhaVariante(null);
                    }}
                    options={opcoesMp.map((c) => ({ value: c.cod_item, label: `${c.cod_item} - ${c.descricao ?? ""}` }))}
                  />
                </Field>
                <Field label="Espessura (mm)" htmlFor="tm-rot-espessura" hint={escolhaEspessura === null && espessuraTexto ? "Lida da descrição da matéria-prima." : undefined}>
                  <Input id="tm-rot-espessura" inputMode="decimal" value={espessuraTexto} onChange={(e) => setEscolhaEspessura(e.target.value)} />
                </Field>
                {perfil.metodo === "corte_cnc" && (
                  <Field label="Variante" hint={variantePadrao ? `Pelo material: ${variantesPerfil.find((v) => v.chave === variantePadrao)?.rotulo}` : undefined}>
                    <Dropdown
                      value={variante}
                      onValueChange={setEscolhaVariante}
                      options={[{ value: AUTOMATICA, label: "Automática (a primeira que cortar)" }, ...variantesPerfil.map((v) => ({ value: v.chave, label: v.rotulo }))]}
                    />
                  </Field>
                )}
                {fatores.length > 0 && (
                  <Field label="Tipo de dobra">
                    <Dropdown value={fator} onValueChange={setDobraFator} options={fatores.map((f) => ({ value: f.chave, label: `${f.rotulo} (x ${textoDeNumero(f.fator)})` }))} />
                  </Field>
                )}
                {perfil.metodo === "tabela_dimensao" && perfil.dobra?.regra === "por_dobra" && (
                  <Field label="Número de dobras" htmlFor="tm-rot-dobras">
                    <Input id="tm-rot-dobras" inputMode="numeric" value={dobraQuantidade} onChange={(e) => setDobraQuantidade(e.target.value)} />
                  </Field>
                )}
              </FormGrid>

              <RadioGroup
                name="tm-rot-origem"
                orientation="horizontal"
                value={origem}
                onValueChange={(v) => setEscolhaOrigem(v as "dxf" | "manual")}
                options={[
                  { value: "dxf", label: "DXF do item", disabled: !dxfUtil },
                  { value: "manual", label: "Medidas digitadas" },
                ]}
              />

              {origem === "dxf" && dxfDados ? (
                <ResumoDxf arquivo={dxfDados.arquivo} leitura={dxfDados.leitura} />
              ) : (
                <Stack gap={12}>
                  {dxf.estado === "carregando" && <Loader />}
                  {dxf.estado === "erro" && <Alert variant="warning">{dxf.mensagem}</Alert>}
                  {dxf.estado === "ok" && !dxf.dados && <Alert variant="info">Não há DXF de {item.codigoNormalizado} na pasta da Triel-HT: informe as medidas.</Alert>}
                  {dxf.estado === "ok" && dxf.dados && !dxfUtil && <ResumoDxf arquivo={dxf.dados.arquivo} leitura={dxf.dados.leitura} />}
                  <GeometriaManualCampos form={manual} onChange={setManual} idPrefixo="tm-rot" />
                </Stack>
              )}
            </Stack>
          </Card>

          <Card
            title="Tempo calculado"
            actions={
              <Button variant="secondary" onClick={() => setVerTabela((v) => !v)}>
                <Table2 size={15} /> {verTabela ? "Esconder tabela" : "Consultar tempos"}
              </Button>
            }
          >
            <Stack gap={16}>
              {avisoArea && <Alert variant="warning" title="Confira a espessura">{avisoArea}</Alert>}
              {resultado && <ResultadoTempoView resultado={resultado} />}
              {verTabela && (
                <section className={styles.secao}>
                  <h3 className={styles.secaoTitulo}>Tabela da máquina: {maquina.perfil.nome}</h3>
                  <PerfilTempoLeitura perfil={perfil} />
                </section>
              )}
            </Stack>
          </Card>
        </div>
      </Stack>
    </Modal>
  );
}
