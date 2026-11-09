"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { FileUp } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Stack } from "@/components/ui/Stack";

import { calcularTempo } from "@/lib/tempos-maquina/calculo";
import { lerGeometriaDxf, type ResultadoGeometriaDxf } from "@/lib/tempos-maquina/dxf-geometria";
import type { ResultadoTempo } from "@/lib/tempos-maquina/tipos";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { listarPerfisTempo } from "../../services/temposMaquinaAdmin.service";
import type { PerfilTempoCadastro } from "../../types/temposMaquina.types";
import { geometriaDoForm, numeroDoTexto, type GeometriaManualForm } from "../../utils/geometria-form";
import { textoDeNumero } from "../../utils/perfil-form";
import { GeometriaManualCampos, ResumoDxf } from "../GeometriaPecaCampos";
import { ResultadoTempoView } from "./ResultadoTempoView";
import styles from "./TemposMaquina.module.css";

const AUTOMATICA = "";

/* Dobradeira com tipos de dobra: começa no primeiro, para o simulador já mostrar um tempo. */
function fatorPadrao(perfil: PerfilTempoCadastro | undefined): string {
  const p = perfil?.parametros;
  return p?.metodo === "tabela_dimensao" && p.dobra?.regra === "fator" ? (p.dobra.fatores[0]?.chave ?? "") : "";
}

/* Simulador: qualquer perfil (ativo ou não) com medidas digitadas ou um DXF, sem gravar nada. */
export function SimuladorTempoPainel({ onFeedback }: { onFeedback: FeedbackHandler }) {
  const [perfis, setPerfis] = useState<PerfilTempoCadastro[] | null>(null);
  const [perfilId, setPerfilId] = useState("");
  const [espessura, setEspessura] = useState("3");
  const [variante, setVariante] = useState(AUTOMATICA);
  const [dobraFator, setDobraFator] = useState("");
  const [dobraQuantidade, setDobraQuantidade] = useState("1");
  const [origem, setOrigem] = useState<"manual" | "dxf">("manual");
  const [manual, setManual] = useState<GeometriaManualForm>({
    largura: "500",
    comprimento: "300",
    perimetro: "",
    entradas: "",
    furos: [{ quantidade: "4", a: "20", b: "" }],
    oblongos: [],
  });
  const [dxf, setDxf] = useState<{ arquivo: string; leitura: ResultadoGeometriaDxf } | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listarPerfisTempo().then((resposta) => {
      if (!resposta.ok) onFeedback("danger", "Simulador", resposta.message ?? "Não foi possível carregar os perfis.");
      const lista = resposta.data ?? [];
      setPerfis(lista);
      setPerfilId(lista[0]?.id ?? "");
      setDobraFator(fatorPadrao(lista[0]));
    });
  }, [onFeedback]);

  const perfil = perfis?.find((p) => p.id === perfilId) ?? null;
  const geometria = useMemo(() => (origem === "dxf" ? (dxf?.leitura.geometria ?? null) : geometriaDoForm(manual)), [origem, dxf, manual]);

  const resultado = useMemo<ResultadoTempo | null>(() => {
    if (!perfil) return null;
    if (!geometria) return { ok: false, tempoMin: null, parcelas: [], referencia: [], avisos: [], erros: ["Carregue um DXF."] };
    return calcularTempo(perfil.parametros, {
      espessuraMm: numeroDoTexto(espessura) ?? 0,
      geometria,
      variante: variante || null,
      dobra: { fator: dobraFator || null, quantidade: numeroDoTexto(dobraQuantidade) },
    });
  }, [perfil, geometria, espessura, variante, dobraFator, dobraQuantidade]);

  function escolherPerfil(id: string) {
    setPerfilId(id);
    setVariante(AUTOMATICA);
    setDobraFator(fatorPadrao(perfis?.find((x) => x.id === id)));
  }

  async function carregarDxf(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    setDxf({ arquivo: arquivo.name, leitura: lerGeometriaDxf(await arquivo.text()) });
  }

  if (perfis === null) return <Loader />;

  const p = perfil?.parametros;

  return (
    <div className={styles.simulador}>
      <Card title="Peça" description="Nada é gravado: serve para conferir um perfil antes de ativar.">
        <Stack gap={16}>
          <FormGrid columns={2}>
            <Field label="Perfil">
              <Dropdown
                value={perfilId}
                onValueChange={escolherPerfil}
                options={perfis.map((x) => ({ value: x.id, label: x.ativo ? x.nome : `${x.nome} (inativo)` }))}
                placeholder="Escolha um perfil"
              />
            </Field>
            <Field label="Espessura (mm)" htmlFor="tm-sim-espessura">
              <Input id="tm-sim-espessura" inputMode="decimal" value={espessura} onChange={(e) => setEspessura(e.target.value)} />
            </Field>
            {p?.metodo === "corte_cnc" && (
              <Field label="Variante">
                <Dropdown
                  value={variante}
                  onValueChange={setVariante}
                  options={[{ value: AUTOMATICA, label: "Automática (a primeira que cortar)" }, ...p.variantes.map((v) => ({ value: v.chave, label: v.rotulo }))]}
                />
              </Field>
            )}
            {p?.metodo === "tabela_dimensao" && p.dobra?.regra === "fator" && (
              <Field label="Tipo de dobra">
                <Dropdown value={dobraFator} onValueChange={setDobraFator} options={p.dobra.fatores.map((f) => ({ value: f.chave, label: `${f.rotulo} (x ${textoDeNumero(f.fator)})` }))} />
              </Field>
            )}
            {p?.metodo === "tabela_dimensao" && p.dobra?.regra === "por_dobra" && (
              <Field label="Número de dobras" htmlFor="tm-sim-dobras">
                <Input id="tm-sim-dobras" inputMode="numeric" value={dobraQuantidade} onChange={(e) => setDobraQuantidade(e.target.value)} />
              </Field>
            )}
          </FormGrid>

          <RadioGroup
            name="origem-geometria"
            orientation="horizontal"
            value={origem}
            onValueChange={(v) => setOrigem(v as "manual" | "dxf")}
            options={[
              { value: "manual", label: "Medidas digitadas" },
              { value: "dxf", label: "Arquivo DXF" },
            ]}
          />

          {origem === "manual" ? (
            <GeometriaManualCampos form={manual} onChange={setManual} idPrefixo="tm-sim" />
          ) : (
            <Stack gap={12}>
              <input ref={arquivoRef} type="file" accept=".dxf" hidden onChange={(e) => void carregarDxf(e)} aria-label="Arquivo DXF" />
              <div>
                <Button variant="secondary" onClick={() => arquivoRef.current?.click()}>
                  <FileUp size={15} /> {dxf ? "Trocar DXF" : "Escolher DXF"}
                </Button>
              </div>
              {dxf && <ResumoDxf arquivo={dxf.arquivo} leitura={dxf.leitura} />}
            </Stack>
          )}
        </Stack>
      </Card>

      <Card title="Tempo calculado">
        {resultado ? <ResultadoTempoView resultado={resultado} /> : <p className={styles.texto}>Escolha um perfil.</p>}
      </Card>
    </div>
  );
}
