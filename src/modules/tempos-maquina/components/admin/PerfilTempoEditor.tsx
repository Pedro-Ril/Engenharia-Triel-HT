"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { Textarea } from "@/components/ui/Textarea";

import type { PerfilTempo } from "@/lib/tempos-maquina/tipos";
import { chaveDeRotulo } from "@/lib/tempos-maquina/validacao";

import { atualizarPerfilTempo, criarPerfilTempo } from "../../services/temposMaquinaAdmin.service";
import { ROTULO_METODO, type MetodoTempo, type PerfilTempoCadastro } from "../../types/temposMaquina.types";
import {
  ajustarMatriz,
  CORTE_CNC_VAZIO,
  corteCncParaForm,
  formParaCorteCnc,
  formParaTabela,
  lerDegraus,
  TABELA_VAZIA,
  tabelaParaForm,
  type CorteCncForm,
  type RegraDobraForm,
  type TabelaForm,
} from "../../utils/perfil-form";
import styles from "./TemposMaquina.module.css";

export type PerfilEmEdicao = {
  id: string | null;
  nome: string;
  metodo: MetodoTempo;
  observacao: string | null;
  parametros: PerfilTempo | null;
};

interface PerfilTempoEditorProps {
  inicial: PerfilEmEdicao;
  onClose: () => void;
  onSalvo: (perfil: PerfilTempoCadastro) => void;
}

function formCncInicial(p: PerfilTempo | null): CorteCncForm {
  return p?.metodo === "corte_cnc" ? corteCncParaForm(p) : structuredClone(CORTE_CNC_VAZIO);
}

function formTabelaInicial(p: PerfilTempo | null): TabelaForm {
  return p?.metodo === "tabela_dimensao" ? tabelaParaForm(p) : structuredClone(TABELA_VAZIA);
}

/* Criar, duplicar ou editar um perfil (o método só se escolhe ao criar). */
export function PerfilTempoEditor({ inicial, onClose, onSalvo }: PerfilTempoEditorProps) {
  const [nome, setNome] = useState(inicial.nome);
  const [observacao, setObservacao] = useState(inicial.observacao ?? "");
  const [metodo, setMetodo] = useState<MetodoTempo>(inicial.metodo);
  const [cnc, setCnc] = useState<CorteCncForm>(() => formCncInicial(inicial.parametros));
  const [tabela, setTabela] = useState<TabelaForm>(() => formTabelaInicial(inicial.parametros));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const parametros = metodo === "corte_cnc" ? formParaCorteCnc(cnc) : formParaTabela(tabela);
    const resposta = inicial.id
      ? await atualizarPerfilTempo(inicial.id, { nome, observacao: observacao.trim() || null, parametros })
      : await criarPerfilTempo({ nome, metodo, parametros, observacao: observacao.trim() || null });
    setSalvando(false);

    if (!resposta.ok || !resposta.data) {
      setErro(resposta.message ?? "Não foi possível salvar o perfil.");
      return;
    }
    onSalvo(resposta.data);
  }

  return (
    <Modal
      open
      size="xlarge"
      title={inicial.id ? `Editar perfil: ${inicial.nome}` : "Novo perfil de tempo"}
      description="Parâmetros do cálculo automático de tempo. Perfil novo nasce inativo."
      onClose={onClose}
      closeOnOverlay={false}
      footer={
        <Stack direction="row" gap={8} justify="end">
          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} loading={salvando} loadingLabel="Salvando...">
            Salvar perfil
          </Button>
        </Stack>
      }
    >
      <Stack gap={20}>
        {erro && (
          <Alert variant="danger" title="Não foi salvo">
            {erro}
          </Alert>
        )}

        <FormGrid columns={2}>
          <Field label="Nome" required htmlFor="tm-perfil-nome">
            <Input id="tm-perfil-nome" value={nome} maxLength={150} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: LASER 3000 VE" />
          </Field>
          <Field label="Método de cálculo" hint={inicial.id ? "O método não muda depois de criado." : undefined}>
            <Dropdown
              value={metodo}
              disabled={Boolean(inicial.id)}
              onValueChange={(v) => setMetodo(v as MetodoTempo)}
              options={(Object.keys(ROTULO_METODO) as MetodoTempo[]).map((m) => ({ value: m, label: ROTULO_METODO[m] }))}
            />
          </Field>
        </FormGrid>

        <Field label="Observação" hint="De onde vêm os valores, data da cronometragem, quem validou..." htmlFor="tm-perfil-observacao">
          <Textarea id="tm-perfil-observacao" value={observacao} maxLength={1000} rows={2} onChange={(e) => setObservacao(e.target.value)} />
        </Field>

        {metodo === "corte_cnc" ? <EditorCorteCnc form={cnc} onChange={setCnc} /> : <EditorTabela form={tabela} onChange={setTabela} />}
      </Stack>
    </Modal>
  );
}

/* ---------------- Corte CNC ---------------- */

function EditorCorteCnc({ form, onChange }: { form: CorteCncForm; onChange: (f: CorteCncForm) => void }) {
  const [novaVariante, setNovaVariante] = useState("");
  const set = (parcial: Partial<CorteCncForm>) => onChange({ ...form, ...parcial });

  function alterarLinha(i: number, campo: keyof CorteCncForm["linhas"][number], valor: string) {
    set({ linhas: form.linhas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)) });
  }

  function adicionarVariante() {
    const rotulo = novaVariante.trim();
    if (!rotulo) return;
    let chave = chaveDeRotulo(rotulo).slice(0, 30);
    for (let i = 2; form.variantes.some((v) => v.chave === chave); i++) chave = `${chaveDeRotulo(rotulo).slice(0, 26)}_${i}`;
    set({ variantes: [...form.variantes, { chave, rotulo }] });
    setNovaVariante("");
  }

  const emUso = (chave: string) => form.linhas.some((l) => l.variante === chave);

  return (
    <Stack gap={20}>
      <section className={styles.secao}>
        <h3 className={styles.secaoTitulo}>Máquina</h3>
        <FormGrid columns={4}>
          <Field label="Chapa padrão: largura (mm)" htmlFor="tm-perfil-chapa-padrao-largura-mm">
            <Input id="tm-perfil-chapa-padrao-largura-mm" inputMode="decimal" value={form.chapaLargura} onChange={(e) => set({ chapaLargura: e.target.value })} />
          </Field>
          <Field label="Chapa padrão: comprimento (mm)" htmlFor="tm-perfil-chapa-padrao-comprimento-mm">
            <Input id="tm-perfil-chapa-padrao-comprimento-mm" inputMode="decimal" value={form.chapaComprimento} onChange={(e) => set({ chapaComprimento: e.target.value })} />
          </Field>
          <Field label="Velocidade no vazio (mm/min)" htmlFor="tm-perfil-velocidade-no-vazio-mm-min">
            <Input id="tm-perfil-velocidade-no-vazio-mm-min" inputMode="decimal" value={form.vazio} onChange={(e) => set({ vazio: e.target.value })} />
          </Field>
          <Field label="Entrada + saída por furo (mm)" hint="Planilha: laser 5, plasma 4,5." htmlFor="tm-perfil-entrada-saida-por-furo-mm">
            <Input id="tm-perfil-entrada-saida-por-furo-mm" inputMode="decimal" value={form.entradaSaida} onChange={(e) => set({ entradaSaida: e.target.value })} />
          </Field>
          <Field label="Aproximação por entrada (s)" hint="Plasma: 5,16 s (0,086 min). Laser: 0." htmlFor="tm-perfil-aproximacao-por-entrada-s">
            <Input id="tm-perfil-aproximacao-por-entrada-s" inputMode="decimal" value={form.aproximacaoSeg} onChange={(e) => set({ aproximacaoSeg: e.target.value })} />
          </Field>
          <Field label="Limpeza do bico (min)" hint="Vazio = a máquina não limpa bico." htmlFor="tm-perfil-limpeza-do-bico-min">
            <Input id="tm-perfil-limpeza-do-bico-min" inputMode="decimal" value={form.limpezaBico} onChange={(e) => set({ limpezaBico: e.target.value })} />
          </Field>
        </FormGrid>
      </section>

      <section className={styles.secao}>
        <h3 className={styles.secaoTitulo}>Tempos por chapa (min)</h3>
        <p className={styles.secaoDica}>Cronometrados por chapa; cada peça leva a fração da chapa padrão que ocupa.</p>
        {form.temposPorChapa.length > 0 && (
          <div className={styles.rolagem}>
            <table className={styles.grade}>
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Minutos por chapa</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {form.temposPorChapa.map((t, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        className={styles.celula}
                        value={t.rotulo}
                        aria-label="Etapa"
                        onChange={(e) => set({ temposPorChapa: form.temposPorChapa.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)) })}
                      />
                    </td>
                    <td>
                      <input
                        className={`${styles.celula} ${styles.celulaEstreita}`}
                        inputMode="decimal"
                        value={t.minutos}
                        aria-label="Minutos por chapa"
                        onChange={(e) => set({ temposPorChapa: form.temposPorChapa.map((x, j) => (j === i ? { ...x, minutos: e.target.value } : x)) })}
                      />
                    </td>
                    <td className={styles.acoes}>
                      <IconButton
                        icon={<Trash2 size={15} />}
                        label="Remover etapa"
                        variant="danger"
                        size="small"
                        onClick={() => set({ temposPorChapa: form.temposPorChapa.filter((_, j) => j !== i) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div>
          <Button variant="secondary" onClick={() => set({ temposPorChapa: [...form.temposPorChapa, { chave: "", rotulo: "", minutos: "" }] })}>
            <Plus size={15} /> Adicionar etapa
          </Button>
        </div>
      </section>

      <section className={styles.secao}>
        <h3 className={styles.secaoTitulo}>Variantes da tabela</h3>
        <p className={styles.secaoDica}>
          Laser: material padrão/especial. Plasma: amperagem. Sem variante escolhida, o cálculo usa a primeira que cortar, nesta ordem.
        </p>
        <Stack direction="row" gap={8} wrap align="center">
          {form.variantes.map((v, i) => (
            <Stack key={v.chave} direction="row" gap={4} align="center">
              <input
                className={`${styles.celula} ${styles.celulaEstreita}`}
                style={{ maxWidth: 160 }}
                value={v.rotulo}
                aria-label={`Nome da variante ${v.chave}`}
                onChange={(e) => set({ variantes: form.variantes.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)) })}
              />
              <IconButton
                icon={<Trash2 size={15} />}
                label={emUso(v.chave) ? "Variante usada na tabela" : "Remover variante"}
                variant="danger"
                size="small"
                disabled={emUso(v.chave) || form.variantes.length === 1}
                onClick={() => set({ variantes: form.variantes.filter((_, j) => j !== i) })}
              />
            </Stack>
          ))}
          <input
            className={`${styles.celula} ${styles.celulaEstreita}`}
            style={{ maxWidth: 160 }}
            placeholder="Nova variante"
            value={novaVariante}
            onChange={(e) => setNovaVariante(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionarVariante()}
          />
          <Button variant="secondary" onClick={adicionarVariante} disabled={!novaVariante.trim()}>
            <Plus size={15} /> Adicionar
          </Button>
        </Stack>
      </section>

      <section className={styles.secao}>
        <h3 className={styles.secaoTitulo}>Tabela de corte por espessura</h3>
        <div className={styles.rolagem}>
          <table className={styles.grade}>
            <thead>
              <tr>
                <th>Espessura (mm)</th>
                <th>Variante</th>
                <th>Velocidade (mm/min)</th>
                <th>Pierce (s)</th>
                <th>Espera antes do corte (s)</th>
                <th>Entradas por limpeza</th>
                <th>Furo mínimo (mm)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {form.linhas.map((l, i) => (
                <tr key={i}>
                  <td>
                    <input className={`${styles.celula} ${styles.celulaEstreita}`} inputMode="decimal" value={l.espessura} aria-label="Espessura" onChange={(e) => alterarLinha(i, "espessura", e.target.value)} />
                  </td>
                  <td>
                    <select className={styles.celula} value={l.variante} aria-label="Variante" onChange={(e) => alterarLinha(i, "variante", e.target.value)}>
                      {form.variantes.map((v) => (
                        <option key={v.chave} value={v.chave}>
                          {v.rotulo}
                        </option>
                      ))}
                    </select>
                  </td>
                  {(
                    [
                      ["velocidade", "Velocidade"],
                      ["pierceSeg", "Pierce"],
                      ["esperaSeg", "Espera"],
                      ["piercesPorLimpeza", "Entradas por limpeza"],
                      ["furoMinimo", "Furo mínimo"],
                    ] as const
                  ).map(([campo, rotulo]) => (
                    <td key={campo}>
                      <input className={`${styles.celula} ${styles.celulaEstreita}`} inputMode="decimal" value={l[campo]} aria-label={rotulo} onChange={(e) => alterarLinha(i, campo, e.target.value)} />
                    </td>
                  ))}
                  <td className={styles.acoes}>
                    <IconButton icon={<Trash2 size={15} />} label="Remover linha" variant="danger" size="small" onClick={() => set({ linhas: form.linhas.filter((_, j) => j !== i) })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.secaoDica}>
          Furo mínimo: furo ou oblongo com diâmetro até esse valor não corta nesta linha (planilha: 260 A de 4,75 a 12,7 mm = espessura ÷ 2,5). Ao salvar, a tabela é ordenada.
        </p>
        <div>
          <Button
            variant="secondary"
            onClick={() =>
              set({
                linhas: [
                  ...form.linhas,
                  { espessura: "", variante: form.variantes[0]?.chave ?? "", velocidade: "", pierceSeg: "", esperaSeg: "0", piercesPorLimpeza: "", furoMinimo: "" },
                ],
              })
            }
          >
            <Plus size={15} /> Adicionar linha
          </Button>
        </div>
      </section>
    </Stack>
  );
}

/* ---------------- Tabela por dimensão ---------------- */

function EditorTabela({ form, onChange }: { form: TabelaForm; onChange: (f: TabelaForm) => void }) {
  const set = (parcial: Partial<TabelaForm>) => onChange({ ...form, ...parcial });

  function alterarFaixa(i: number, parcial: Partial<TabelaForm["faixas"][number]>) {
    set({
      faixas: form.faixas.map((f, j) => {
        if (j !== i) return f;
        const nova = { ...f, ...parcial };
        /* Mudou o número de degraus: a matriz acompanha, guardando o que já foi digitado. */
        nova.tempos = ajustarMatriz(nova.tempos, lerDegraus(nova.larguras).length, lerDegraus(nova.comprimentos).length);
        return nova;
      }),
    });
  }

  function alterarTempo(i: number, l: number, c: number, valor: string) {
    alterarFaixa(i, { tempos: form.faixas[i].tempos.map((linha, il) => (il === l ? linha.map((v, ic) => (ic === c ? valor : v)) : linha)) });
  }

  return (
    <Stack gap={20}>
      <section className={styles.secao}>
        <h3 className={styles.secaoTitulo}>Faixas de espessura</h3>
        <p className={styles.secaoDica}>
          Tempo em minutos por largura (menor lado) x comprimento. Medida entre degraus sobe para o próximo. Degraus separados por ponto e vírgula.
        </p>

        {form.faixas.map((faixa, i) => {
          const larguras = lerDegraus(faixa.larguras);
          const comprimentos = lerDegraus(faixa.comprimentos);
          return (
            <div key={i} className={styles.faixa}>
              <div className={styles.barra}>
                <FormGrid columns={4}>
                  <Field label="Nome da faixa" htmlFor={`tm-perfil-nome-da-faixa-${i}`}>
                    <Input id={`tm-perfil-nome-da-faixa-${i}`} value={faixa.rotulo} onChange={(e) => alterarFaixa(i, { rotulo: e.target.value })} />
                  </Field>
                  <Field label="Vale até a espessura (mm)" htmlFor={`tm-perfil-vale-ate-a-espessura-mm-${i}`}>
                    <Input id={`tm-perfil-vale-ate-a-espessura-mm-${i}`} inputMode="decimal" value={faixa.ate} onChange={(e) => alterarFaixa(i, { ate: e.target.value })} />
                  </Field>
                  <Field label="Larguras (mm)" htmlFor={`tm-perfil-larguras-mm-${i}`}>
                    <Input id={`tm-perfil-larguras-mm-${i}`} value={faixa.larguras} onChange={(e) => alterarFaixa(i, { larguras: e.target.value })} />
                  </Field>
                  <Field label="Comprimentos (mm)" htmlFor={`tm-perfil-comprimentos-mm-${i}`}>
                    <Input id={`tm-perfil-comprimentos-mm-${i}`} value={faixa.comprimentos} onChange={(e) => alterarFaixa(i, { comprimentos: e.target.value })} />
                  </Field>
                </FormGrid>
                <IconButton
                  icon={<Trash2 size={15} />}
                  label="Remover faixa"
                  variant="danger"
                  disabled={form.faixas.length === 1}
                  onClick={() => set({ faixas: form.faixas.filter((_, j) => j !== i) })}
                />
              </div>

              <div className={styles.rolagem}>
                <table className={styles.grade}>
                  <thead>
                    <tr>
                      <th>Larg. \ Comp.</th>
                      {comprimentos.map((c, ic) => (
                        <th key={ic}>{String(c)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {larguras.map((l, il) => (
                      <tr key={il}>
                        <td className={styles.rotuloLinha}>{String(l)}</td>
                        {comprimentos.map((c, ic) => (
                          <td key={ic}>
                            <input
                              className={`${styles.celula} ${styles.celulaMatriz}`}
                              inputMode="decimal"
                              value={faixa.tempos[il]?.[ic] ?? ""}
                              aria-label={`Tempo ${String(l)} x ${String(c)}`}
                              onChange={(e) => alterarTempo(i, il, ic, e.target.value)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <div>
          <Button
            variant="secondary"
            onClick={() => {
              const ultima = form.faixas[form.faixas.length - 1];
              set({
                faixas: [
                  ...form.faixas,
                  { rotulo: `Faixa ${form.faixas.length + 1}`, ate: "", larguras: ultima.larguras, comprimentos: ultima.comprimentos, tempos: ajustarMatriz([], ultima.tempos.length, ultima.tempos[0]?.length ?? 0) },
                ],
              });
            }}
          >
            <Plus size={15} /> Adicionar faixa
          </Button>
        </div>
      </section>

      <section className={styles.secao}>
        <h3 className={styles.secaoTitulo}>Dobra</h3>
        <FormGrid columns={2}>
          <Field label="Regra" hint="Sem dobra = guilhotina (o tempo é o da tabela).">
            <Dropdown
              value={form.dobra}
              onValueChange={(v) => set({ dobra: v as RegraDobraForm })}
              options={[
                { value: "nenhuma", label: "Sem dobra (corte)" },
                { value: "fator", label: "Fator por tipo de dobra (planilha)" },
                { value: "por_dobra", label: "Acréscimo por dobra (app do PCP)" },
              ]}
            />
          </Field>
          {form.dobra === "por_dobra" && (
            <Field label="Acréscimo por dobra" hint="0,1 = cada dobra soma 10% do tempo da tabela." htmlFor="tm-perfil-acrescimo-por-dobra">
              <Input id="tm-perfil-acrescimo-por-dobra" inputMode="decimal" value={form.acrescimoPorDobra} onChange={(e) => set({ acrescimoPorDobra: e.target.value })} />
            </Field>
          )}
        </FormGrid>

        {form.dobra === "fator" && (
          <>
            <div className={styles.rolagem}>
              <table className={styles.grade}>
                <thead>
                  <tr>
                    <th>Tipo de dobra</th>
                    <th>Fator (x tempo da tabela)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {form.fatores.map((f, i) => (
                    <tr key={i}>
                      <td>
                        <input className={styles.celula} value={f.rotulo} aria-label="Tipo de dobra" onChange={(e) => set({ fatores: form.fatores.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)) })} />
                      </td>
                      <td>
                        <input className={`${styles.celula} ${styles.celulaEstreita}`} inputMode="decimal" value={f.fator} aria-label="Fator" onChange={(e) => set({ fatores: form.fatores.map((x, j) => (j === i ? { ...x, fator: e.target.value } : x)) })} />
                      </td>
                      <td className={styles.acoes}>
                        <IconButton icon={<Trash2 size={15} />} label="Remover tipo" variant="danger" size="small" onClick={() => set({ fatores: form.fatores.filter((_, j) => j !== i) })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <Button variant="secondary" onClick={() => set({ fatores: [...form.fatores, { chave: "", rotulo: "", fator: "" }] })}>
                <Plus size={15} /> Adicionar tipo de dobra
              </Button>
            </div>
          </>
        )}
      </section>
    </Stack>
  );
}
