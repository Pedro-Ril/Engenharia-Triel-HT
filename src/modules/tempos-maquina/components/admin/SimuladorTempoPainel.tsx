"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { FileUp, Plus, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Stack } from "@/components/ui/Stack";

import { calcularTempo, geometriaManual } from "@/lib/tempos-maquina/calculo";
import { lerGeometriaDxf, type ResultadoGeometriaDxf } from "@/lib/tempos-maquina/dxf-geometria";
import type { ResultadoTempo } from "@/lib/tempos-maquina/tipos";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";

import { listarPerfisTempo } from "../../services/temposMaquinaAdmin.service";
import type { PerfilTempoCadastro } from "../../types/temposMaquina.types";
import { textoDeNumero } from "../../utils/perfil-form";
import { ResultadoTempoView } from "./ResultadoTempoView";
import styles from "./TemposMaquina.module.css";

const AUTOMATICA = "";

type Linha = { quantidade: string; a: string; b: string };

/* Dobradeira com tipos de dobra: começa no primeiro, para o simulador já mostrar um tempo. */
function fatorPadrao(perfil: PerfilTempoCadastro | undefined): string {
  const p = perfil?.parametros;
  return p?.metodo === "tabela_dimensao" && p.dobra?.regra === "fator" ? (p.dobra.fatores[0]?.chave ?? "") : "";
}

function numeroOuNulo(texto: string): number | null {
  const n = Number(texto.replace(",", "."));
  return texto.trim() && Number.isFinite(n) ? n : null;
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
  const [largura, setLargura] = useState("500");
  const [comprimento, setComprimento] = useState("300");
  const [perimetro, setPerimetro] = useState("");
  const [entradas, setEntradas] = useState("");
  const [furos, setFuros] = useState<Linha[]>([{ quantidade: "4", a: "20", b: "" }]);
  const [oblongos, setOblongos] = useState<Linha[]>([]);
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

  const geometria = useMemo(() => {
    if (origem === "dxf") return dxf?.leitura.geometria ?? null;
    return geometriaManual({
      larguraMm: numeroOuNulo(largura),
      comprimentoMm: numeroOuNulo(comprimento),
      perimetroMm: numeroOuNulo(perimetro),
      entradas: numeroOuNulo(entradas),
      furos: furos.map((f) => ({ quantidade: numeroOuNulo(f.quantidade) ?? 0, diametroMm: numeroOuNulo(f.a) ?? 0 })),
      oblongos: oblongos.map((o) => ({ quantidade: numeroOuNulo(o.quantidade) ?? 0, larguraMm: numeroOuNulo(o.a) ?? 0, comprimentoMm: numeroOuNulo(o.b) ?? 0 })),
    });
  }, [origem, dxf, largura, comprimento, perimetro, entradas, furos, oblongos]);

  const resultado = useMemo<ResultadoTempo | null>(() => {
    if (!perfil) return null;
    if (!geometria) return { ok: false, tempoMin: null, parcelas: [], referencia: [], avisos: [], erros: ["Carregue um DXF."] };
    return calcularTempo(perfil.parametros, {
      espessuraMm: numeroOuNulo(espessura) ?? 0,
      geometria,
      variante: variante || null,
      dobra: { fator: dobraFator || null, quantidade: numeroOuNulo(dobraQuantidade) },
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
    const texto = await arquivo.text();
    setDxf({ arquivo: arquivo.name, leitura: lerGeometriaDxf(texto) });
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
            <Field label="Espessura (mm)" htmlFor="tm-sim-espessura-mm">
              <Input id="tm-sim-espessura-mm" inputMode="decimal" value={espessura} onChange={(e) => setEspessura(e.target.value)} />
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
              <Field label="Número de dobras" htmlFor="tm-sim-numero-de-dobras">
                <Input id="tm-sim-numero-de-dobras" inputMode="numeric" value={dobraQuantidade} onChange={(e) => setDobraQuantidade(e.target.value)} />
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
            <Stack gap={16}>
              <FormGrid columns={2}>
                <Field label="Largura (mm)" htmlFor="tm-sim-largura-mm">
                  <Input id="tm-sim-largura-mm" inputMode="decimal" value={largura} onChange={(e) => setLargura(e.target.value)} />
                </Field>
                <Field label="Comprimento (mm)" htmlFor="tm-sim-comprimento-mm">
                  <Input id="tm-sim-comprimento-mm" inputMode="decimal" value={comprimento} onChange={(e) => setComprimento(e.target.value)} />
                </Field>
                <Field label="Perímetro adicional (mm)" hint="Soma ao retângulo; sem medidas, é o perímetro da peça." htmlFor="tm-sim-perimetro-adicional-mm">
                  <Input id="tm-sim-perimetro-adicional-mm" inputMode="decimal" value={perimetro} onChange={(e) => setPerimetro(e.target.value)} />
                </Field>
                <Field label="Entradas além dos furos" htmlFor="tm-sim-entradas-alem-dos-furos">
                  <Input id="tm-sim-entradas-alem-dos-furos" inputMode="numeric" value={entradas} onChange={(e) => setEntradas(e.target.value)} />
                </Field>
              </FormGrid>
              <ListaMedidas titulo="Furos" colunas={["Quantidade", "Diâmetro (mm)"]} linhas={furos} onChange={setFuros} />
              <ListaMedidas titulo="Oblongos" colunas={["Quantidade", "Largura (mm)", "Comprimento (mm)"]} linhas={oblongos} onChange={setOblongos} />
            </Stack>
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

function ListaMedidas({ titulo, colunas, linhas, onChange }: { titulo: string; colunas: string[]; linhas: Linha[]; onChange: (l: Linha[]) => void }) {
  const campos = (["quantidade", "a", "b"] as const).slice(0, colunas.length);
  return (
    <section className={styles.secao}>
      <h3 className={styles.secaoTitulo}>{titulo}</h3>
      {linhas.length > 0 && (
        <div className={styles.rolagem}>
          <table className={styles.grade}>
            <thead>
              <tr>
                {colunas.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, i) => (
                <tr key={i}>
                  {campos.map((campo, j) => (
                    <td key={campo}>
                      <input
                        className={`${styles.celula} ${styles.celulaEstreita}`}
                        inputMode="decimal"
                        value={linha[campo]}
                        aria-label={colunas[j]}
                        onChange={(e) => onChange(linhas.map((x, k) => (k === i ? { ...x, [campo]: e.target.value } : x)))}
                      />
                    </td>
                  ))}
                  <td className={styles.acoes}>
                    <IconButton icon={<Trash2 size={15} />} label="Remover" variant="danger" size="small" onClick={() => onChange(linhas.filter((_, k) => k !== i))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <Button variant="secondary" onClick={() => onChange([...linhas, { quantidade: "1", a: "", b: "" }])}>
          <Plus size={15} /> Adicionar
        </Button>
      </div>
    </section>
  );
}

function ResumoDxf({ arquivo, leitura }: { arquivo: string; leitura: ResultadoGeometriaDxf }) {
  if (!leitura.ok || !leitura.geometria) {
    return (
      <Alert variant="danger" title={`Não deu para ler ${arquivo}`}>
        {leitura.erros.join(" ")}
      </Alert>
    );
  }

  const g = leitura.geometria;
  const r = leitura.resumo;
  return (
    <Stack gap={10}>
      <dl className={styles.referencias}>
        {[
          ["Arquivo", arquivo],
          ["Contorno externo", `${textoDeNumero(g.perimetroExternoMm, 1)} mm`],
          ["Retângulo da peça", `${textoDeNumero(g.larguraMm, 1)} x ${textoDeNumero(g.comprimentoMm, 1)} mm`],
          ["Área", `${textoDeNumero((g.areaMm2 ?? 0) / 1e6, 4)} m²`],
          ["Furos / oblongos / recortes", `${r.furos} / ${r.oblongos} / ${r.recortes}`],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className={styles.referencia}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      {leitura.avisos.length > 0 && (
        <Alert variant="warning" title="Leitura do DXF">
          <ul className={styles.lista}>
            {leitura.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alert>
      )}
    </Stack>
  );
}
