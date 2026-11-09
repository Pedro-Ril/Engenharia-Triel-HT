"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { FormGrid } from "@/components/ui/FormGrid";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Loader } from "@/components/ui/Loader";
import { Modal } from "@/components/ui/Modal";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";

import { identificarMaterial } from "@/lib/tempos-maquina/materiais";
import type { FeedbackHandler } from "@/modules/admin-permissoes/types/toast.types";
import { extrairEspessuraDaDescricaoMp } from "@/modules/integra-lantek-ve/utils/espessura";

import { excluirMaterialTempo, listarMateriaisTempo, salvarMaterialTempo } from "../../services/temposMaquinaAdmin.service";
import type { MaterialTempo } from "../../types/temposMaquina.types";
import { textoDeNumero } from "../../utils/perfil-form";
import styles from "./TemposMaquina.module.css";

type FormMaterial = { id: string | null; nome: string; termos: string; densidade: string; variante: string; ordem: string; ativo: boolean };

const FORM_VAZIO: FormMaterial = { id: null, nome: "", termos: "", densidade: "", variante: "", ordem: "50", ativo: true };

/* Materiais: como reconhecer pela descrição da matéria-prima, densidade e variante da tabela de corte. */
export function MateriaisTempoPainel({ onFeedback }: { onFeedback: FeedbackHandler }) {
  const [materiais, setMateriais] = useState<MaterialTempo[] | null>(null);
  const [form, setForm] = useState<FormMaterial | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<MaterialTempo | null>(null);
  const [teste, setTeste] = useState("CHAPA DE ACO INOX 304  4,00 X 1500 X 3000 MM VE");

  const aplicar = useCallback(
    (resposta: Awaited<ReturnType<typeof listarMateriaisTempo>>) => {
      if (!resposta.ok) onFeedback("danger", "Materiais", resposta.message ?? "Não foi possível carregar.");
      setMateriais(resposta.data ?? []);
    },
    [onFeedback]
  );

  const carregar = useCallback(async () => aplicar(await listarMateriaisTempo()), [aplicar]);

  useEffect(() => {
    void listarMateriaisTempo().then(aplicar);
  }, [aplicar]);

  const resultadoTeste = useMemo(() => {
    const material = identificarMaterial(teste, materiais ?? []);
    return { material, espessura: extrairEspessuraDaDescricaoMp(teste) };
  }, [teste, materiais]);

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    const resposta = await salvarMaterialTempo(form.id, {
      nome: form.nome,
      termos: form.termos,
      densidade: Number(form.densidade.replace(",", ".")),
      variante: form.variante.trim() || null,
      ordem: Number(form.ordem) || 0,
      ativo: form.ativo,
    });
    setSalvando(false);
    if (!resposta.ok) {
      onFeedback("danger", "Material não salvo", resposta.message ?? "Tente de novo.");
      return;
    }
    setForm(null);
    onFeedback("success", "Material salvo", form.nome);
    await carregar();
  }

  async function excluir(material: MaterialTempo) {
    setSalvando(true);
    const resposta = await excluirMaterialTempo(material.id);
    setSalvando(false);
    setParaExcluir(null);
    if (!resposta.ok) {
      onFeedback("danger", "Material não excluído", resposta.message ?? "Tente de novo.");
      return;
    }
    onFeedback("success", "Material excluído", material.nome);
    await carregar();
  }

  return (
    <Stack gap={20}>
      <Card
        title="Materiais"
        description="O primeiro material ativo (na ordem) com alguma das palavras na descrição da matéria-prima vale. A densidade converte peso em área; a variante escolhe a linha da tabela de corte (vazio = automática)."
        actions={
          <Button onClick={() => setForm({ ...FORM_VAZIO })}>
            <Plus size={15} /> Novo material
          </Button>
        }
      >
        {materiais === null ? (
          <Loader />
        ) : (
          <Table minWidth={760}>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Ordem</TableHeaderCell>
                <TableHeaderCell>Material</TableHeaderCell>
                <TableHeaderCell>Palavras na descrição</TableHeaderCell>
                <TableHeaderCell align="right">Densidade (kg/dm³)</TableHeaderCell>
                <TableHeaderCell>Variante</TableHeaderCell>
                <TableHeaderCell>Situação</TableHeaderCell>
                <TableHeaderCell align="right">Ações</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {materiais.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.ordem}</TableCell>
                  <TableCell>
                    <strong>{m.nome}</strong>
                  </TableCell>
                  <TableCell>{m.termos}</TableCell>
                  <TableCell align="right">{textoDeNumero(m.densidade, 4)}</TableCell>
                  <TableCell>{m.variante ?? <span className={styles.textoFraco}>automática</span>}</TableCell>
                  <TableCell>{m.ativo ? <Badge variant="success">Ativo</Badge> : <Badge variant="neutral">Inativo</Badge>}</TableCell>
                  <TableCell align="right">
                    <div className={styles.acoes}>
                      <IconButton
                        icon={<Pencil size={15} />}
                        label="Editar"
                        onClick={() =>
                          setForm({
                            id: m.id,
                            nome: m.nome,
                            termos: m.termos,
                            densidade: textoDeNumero(m.densidade, 4),
                            variante: m.variante ?? "",
                            ordem: String(m.ordem),
                            ativo: m.ativo,
                          })
                        }
                      />
                      <IconButton icon={<Trash2 size={15} />} label="Excluir" variant="danger" onClick={() => setParaExcluir(m)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card title="Testar uma descrição" description="Como o cálculo vai ler a matéria-prima do item.">
        <Stack gap={12}>
          <Field label="Descrição da matéria-prima" htmlFor="tm-mat-descricao-da-materia-prima">
            <Input id="tm-mat-descricao-da-materia-prima" value={teste} onChange={(e) => setTeste(e.target.value)} />
          </Field>
          <p className={styles.texto}>
            Material: <strong>{resultadoTeste.material ? resultadoTeste.material.nome : "nenhum reconhecido"}</strong>
            {resultadoTeste.material && <> · densidade {textoDeNumero(resultadoTeste.material.densidade, 4)} kg/dm³</>} · espessura:{" "}
            <strong>{resultadoTeste.espessura ? `${resultadoTeste.espessura} mm` : "não encontrada"}</strong>
          </p>
        </Stack>
      </Card>

      {form && (
        <Modal
          open
          title={form.id ? "Editar material" : "Novo material"}
          onClose={() => setForm(null)}
          footer={
            <Stack direction="row" gap={8} justify="end">
              <Button variant="secondary" onClick={() => setForm(null)} disabled={salvando}>
                Cancelar
              </Button>
              <Button onClick={salvar} loading={salvando} loadingLabel="Salvando...">
                Salvar
              </Button>
            </Stack>
          }
        >
          <Stack gap={16}>
            <FormGrid columns={2}>
              <Field label="Nome" required htmlFor="tm-mat-nome">
                <Input id="tm-mat-nome" value={form.nome} maxLength={100} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </Field>
              <Field label="Densidade (kg/dm³)" required htmlFor="tm-mat-densidade-kg-dm">
                <Input id="tm-mat-densidade-kg-dm" inputMode="decimal" value={form.densidade} onChange={(e) => setForm({ ...form, densidade: e.target.value })} />
              </Field>
            </FormGrid>
            <Field label="Palavras na descrição" hint='Separadas por vírgula; basta uma ("ALUM" pega "ALUMINIO").' required htmlFor="tm-mat-palavras-na-descricao">
              <Input id="tm-mat-palavras-na-descricao" value={form.termos} maxLength={400} onChange={(e) => setForm({ ...form, termos: e.target.value })} />
            </Field>
            <FormGrid columns={2}>
              <Field label="Variante da tabela de corte" hint='Chave da variante (ex.: "padrao", "especial"); vazio = automática.' htmlFor="tm-mat-variante-da-tabela-de-corte">
                <Input id="tm-mat-variante-da-tabela-de-corte" value={form.variante} maxLength={30} onChange={(e) => setForm({ ...form, variante: e.target.value })} />
              </Field>
              <Field label="Ordem" hint="Menor vem primeiro (inox antes de aço)." htmlFor="tm-mat-ordem">
                <Input id="tm-mat-ordem" inputMode="numeric" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} />
              </Field>
            </FormGrid>
            <Switch label="Ativo" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
          </Stack>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(paraExcluir)}
        title="Excluir material"
        variant="danger"
        confirmLabel="Excluir"
        loading={salvando}
        message={paraExcluir && <>Excluir <strong>{paraExcluir.nome}</strong>?</>}
        onConfirm={() => (paraExcluir ? excluir(paraExcluir) : undefined)}
        onClose={() => setParaExcluir(null)}
      />
    </Stack>
  );
}
