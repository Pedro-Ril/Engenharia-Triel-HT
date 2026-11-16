"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Stack } from "@/components/ui/Stack";

import { escolhaDaPlanilhaLaser } from "@/lib/tempos-maquina/escolha";

import type { PerfilTempoCadastro } from "../../types/temposMaquina.types";
import { chaveCelulaEscolha, escolhaParaForm, lerDegraus, textoDeNumero, type EscolhaForm } from "../../utils/perfil-form";
import styles from "./TemposMaquina.module.css";

const NAO_CALCULA = "";

/*
 * Grade espessura x variante -> perfil de corte CNC (a célula N7 da aba
 * Laser da planilha). "Preencher com a regra da planilha" monta a grade
 * com os perfis de laser cadastrados com o nome de cada máquina.
 */
export function EditorEscolhaEspessura({
  form,
  onChange,
  perfis,
}: {
  form: EscolhaForm;
  onChange: (f: EscolhaForm) => void;
  perfis: PerfilTempoCadastro[];
}) {
  const [faltando, setFaltando] = useState<string[] | null>(null);
  const opcoes = perfis.filter((p) => p.metodo === "corte_cnc");
  const espessuras = lerDegraus(form.espessuras).filter((e): e is number => typeof e === "number");

  function preencherComPlanilha() {
    const { parametros, faltando: semPerfil } = escolhaDaPlanilhaLaser(perfis);
    onChange(escolhaParaForm(parametros));
    setFaltando(semPerfil);
  }

  function escolher(variante: string, espessura: number, perfilId: string) {
    const celulas = { ...form.celulas };
    const chave = chaveCelulaEscolha(variante, espessura);
    if (perfilId) celulas[chave] = perfilId;
    else delete celulas[chave];
    onChange({ ...form, celulas });
  }

  return (
    <Stack gap={20}>
      <section className={styles.secao}>
        <h3 className={styles.secaoTitulo}>Como funciona</h3>
        <p className={styles.secaoDica}>
          Este perfil não tem tabela própria: para cada espessura e tipo de material, escolhe qual perfil de corte CNC calcula, como a célula N7 da aba
          &quot;Laser&quot; da planilha. A espessura da peça usa a linha mais próxima da grade. Célula em &quot;Não calcula&quot; = sem tempo automático para
          essa combinação. Os perfis escolhidos não precisam estar ativos nem ligados a máquinas; basta ativar este.
        </p>
        <div>
          <Button variant="secondary" onClick={preencherComPlanilha} disabled={opcoes.length === 0}>
            <Wand2 size={15} /> Preencher com a regra da planilha
          </Button>
        </div>
        {faltando && faltando.length > 0 && (
          <Alert variant="warning" title="Faltam perfis">
            Não há perfil de corte CNC com {faltando.join(", ")} no nome: essas células ficaram em &quot;Não calcula&quot;.
          </Alert>
        )}
        {faltando && faltando.length === 0 && <Alert variant="success">Grade preenchida com a regra da planilha. Confira e salve.</Alert>}
      </section>

      <section className={styles.secao}>
        <h3 className={styles.secaoTitulo}>Grade</h3>
        <Field label="Espessuras (mm)" hint="Separadas por ponto e vírgula, em ordem crescente." htmlFor="tm-escolha-espessuras">
          <Input id="tm-escolha-espessuras" value={form.espessuras} onChange={(e) => onChange({ ...form, espessuras: e.target.value })} placeholder="1,5; 2; 2,65; 3" />
        </Field>

        {espessuras.length === 0 ? (
          <p className={styles.textoFraco}>Informe as espessuras ou use &quot;Preencher com a regra da planilha&quot;.</p>
        ) : (
          <div className={styles.rolagem}>
            <table className={styles.grade}>
              <thead>
                <tr>
                  <th>Espessura</th>
                  {form.variantes.map((v) => (
                    <th key={v.chave}>{v.rotulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {espessuras.map((espessura) => (
                  <tr key={espessura}>
                    <td>
                      <strong>{textoDeNumero(espessura)} mm</strong>
                    </td>
                    {form.variantes.map((v) => {
                      const valor = form.celulas[chaveCelulaEscolha(v.chave, espessura)] ?? NAO_CALCULA;
                      return (
                        <td key={v.chave}>
                          <select
                            className={styles.celula}
                            aria-label={`${v.rotulo}, ${textoDeNumero(espessura)} mm`}
                            value={valor}
                            onChange={(e) => escolher(v.chave, espessura, e.target.value)}
                          >
                            <option value={NAO_CALCULA}>— Não calcula</option>
                            {valor && !opcoes.some((p) => p.id === valor) && <option value={valor}>(perfil excluído)</option>}
                            {opcoes.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Stack>
  );
}
