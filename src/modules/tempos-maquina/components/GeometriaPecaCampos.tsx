"use client";

import { Plus, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Stack } from "@/components/ui/Stack";

import type { ResultadoGeometriaDxf } from "@/lib/tempos-maquina/dxf-geometria";

import type { GeometriaManualForm, LinhaMedida } from "../utils/geometria-form";
import { textoDeNumero } from "../utils/perfil-form";
import styles from "./admin/TemposMaquina.module.css";

/* Medidas digitadas: largura x comprimento e/ou perímetro, furos, oblongos e entradas extras (como na planilha). */
export function GeometriaManualCampos({
  form,
  onChange,
  idPrefixo,
}: {
  form: GeometriaManualForm;
  onChange: (form: GeometriaManualForm) => void;
  idPrefixo: string;
}) {
  const set = (parcial: Partial<GeometriaManualForm>) => onChange({ ...form, ...parcial });

  return (
    <Stack gap={16}>
      <FormGrid columns={2}>
        <Field label="Largura (mm)" htmlFor={`${idPrefixo}-largura`}>
          <Input id={`${idPrefixo}-largura`} inputMode="decimal" value={form.largura} onChange={(e) => set({ largura: e.target.value })} />
        </Field>
        <Field label="Comprimento (mm)" htmlFor={`${idPrefixo}-comprimento`}>
          <Input id={`${idPrefixo}-comprimento`} inputMode="decimal" value={form.comprimento} onChange={(e) => set({ comprimento: e.target.value })} />
        </Field>
        <Field label="Perímetro adicional (mm)" htmlFor={`${idPrefixo}-perimetro`} hint="Soma ao retângulo; sem medidas, é o perímetro da peça.">
          <Input id={`${idPrefixo}-perimetro`} inputMode="decimal" value={form.perimetro} onChange={(e) => set({ perimetro: e.target.value })} />
        </Field>
        <Field label="Entradas além dos furos" htmlFor={`${idPrefixo}-entradas`}>
          <Input id={`${idPrefixo}-entradas`} inputMode="numeric" value={form.entradas} onChange={(e) => set({ entradas: e.target.value })} />
        </Field>
      </FormGrid>
      <ListaMedidas titulo="Furos" colunas={["Quantidade", "Diâmetro (mm)"]} linhas={form.furos} onChange={(furos) => set({ furos })} />
      <ListaMedidas
        titulo="Oblongos"
        colunas={["Quantidade", "Largura (mm)", "Comprimento (mm)"]}
        linhas={form.oblongos}
        onChange={(oblongos) => set({ oblongos })}
      />
    </Stack>
  );
}

function ListaMedidas({
  titulo,
  colunas,
  linhas,
  onChange,
}: {
  titulo: string;
  colunas: string[];
  linhas: LinhaMedida[];
  onChange: (l: LinhaMedida[]) => void;
}) {
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

/* O que o leitor tirou do DXF (ou por que não leu). */
export function ResumoDxf({ arquivo, leitura }: { arquivo: string; leitura: ResultadoGeometriaDxf }) {
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
