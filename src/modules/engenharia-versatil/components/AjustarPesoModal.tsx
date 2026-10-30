"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { NumberInput } from "@/components/ui/NumberInput";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Stack } from "@/components/ui/Stack";

import { ajustarPeso, type LinhaFator } from "../services/engenhariaVersatil.service";
import styles from "./EngenhariaVersatil.module.css";
import type { AvisoErp } from "./RetornoErpAviso";

type Opcao = "planilha" | "erp" | "outro";

function kg(valor: number | null): string {
  return valor === null ? "—" : `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 6 })} kg`;
}

/*
 * Peso divergente: o usuário diz qual é o peso certo (planilha, ERP ou
 * outro). O Portal grava o peso líquido no cadastro do item no ERP e, na
 * mesma transação, o fator unidade de estoque -> KG = 1 / peso.
 */
export function AjustarPesoModal({
  linha,
  planilha,
  ambienteRotulo,
  onFechar,
  onConcluido,
}: {
  linha: LinhaFator;
  planilha: File;
  ambienteRotulo: string;
  onFechar: () => void;
  onConcluido: (aviso: AvisoErp, gravou: boolean) => void;
}) {
  const [opcao, setOpcao] = useState<Opcao>("planilha");
  const [outro, setOutro] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState(false);

  const pesoOutro = Number(outro.replace(",", "."));
  const peso =
    opcao === "planilha" ? linha.pesoPlanilha : opcao === "erp" ? linha.pesoErp : outro.trim() && pesoOutro > 0 ? pesoOutro : null;
  const mudaPeso = peso !== null && (linha.pesoErp === null || Math.abs(peso - linha.pesoErp) > 1e-9);
  const unidade = linha.unidEstoque ?? "UN";

  async function gravar() {
    if (peso === null) return;
    setGravando(true);
    try {
      const r = await ajustarPeso(planilha, linha.codigo, peso);
      setConfirmando(false);
      if (r.ok && r.data) {
        const d = r.data;
        onConcluido(
          {
            variante: "success",
            titulo: `Peso e fator gravados no ERP (${d.ambiente})`,
            descricao: `${d.codigo}: peso ${kg(d.pesoAntes)} → ${kg(d.pesoDepois)}; ${d.leitura ?? "fator para KG ajustado"}.${
              d.avisos.length ? ` Aviso do ERP: ${d.avisos.join(" ")}` : ""
            }`,
            retorno: d,
          },
          true
        );
      } else {
        onConcluido(
          {
            variante: "danger",
            titulo: "Ajuste de peso recusado",
            descricao: `${r.message ?? "Não foi possível ajustar o peso no ERP."} Nada foi gravado.`,
            retorno: { mensagem: r.message ?? null, ...((r.data as object | undefined) ?? {}) },
          },
          false
        );
      }
    } finally {
      setGravando(false);
    }
  }

  return (
    <>
      <Modal
        open
        title={`Ajustar peso · ${linha.codigo}`}
        description="Escolha o peso líquido correto. O Portal grava esse peso no cadastro do item no ERP e ajusta o fator para KG junto."
        size="medium"
        onClose={() => {
          if (!gravando) onFechar();
        }}
        footer={
          <Stack direction="row" justify="end" gap={12}>
            <Button variant="secondary" onClick={onFechar} disabled={gravando}>
              Cancelar
            </Button>
            <Button onClick={() => setConfirmando(true)} disabled={peso === null}>
              Gravar peso e fator no ERP ({ambienteRotulo})
            </Button>
          </Stack>
        }
      >
        <Stack gap={16}>
          <RadioGroup
            name={`peso-${linha.codigo}`}
            label="Qual é o peso correto?"
            value={opcao}
            onValueChange={(v) => setOpcao(v as Opcao)}
            options={[
              { value: "planilha", label: `Peso da planilha: ${kg(linha.pesoPlanilha)}`, description: "O peso que veio do projeto." },
              { value: "erp", label: `Peso do ERP: ${kg(linha.pesoErp)}`, description: "Mantém o peso do cadastro e só ajusta o fator." },
              { value: "outro", label: "Outro peso", description: "Digite o peso líquido correto." },
            ]}
          />

          {opcao === "outro" && (
            <Field label="Peso líquido correto" htmlFor={`peso-outro-${linha.codigo}`}>
              <NumberInput
                id={`peso-outro-${linha.codigo}`}
                min={0}
                step="any"
                value={outro}
                onChange={(e) => setOutro(e.target.value)}
                suffix="kg"
              />
            </Field>
          )}

          {peso !== null && (
            <Alert variant="info">
              <span className={styles.resumoAjuste}>
                <span>
                  Peso no ERP: {kg(linha.pesoErp)} → <strong>{kg(peso)}</strong>
                  {!mudaPeso && " (sem mudança)"}
                </span>
                <span>
                  Fator: 1 KG = <strong>{(1 / peso).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} {unidade}</strong>
                  {linha.taxaAtual !== null && ` (hoje ${linha.taxaAtual.toLocaleString("pt-BR", { maximumFractionDigits: 6 })})`}
                </span>
                <span className={styles.secundario}>
                  O peso bruto acompanha (1,1 × líquido) só se hoje já seguir essa proporção; senão fica como está.
                </span>
              </span>
            </Alert>
          )}

          {opcao === "erp" && (
            <span className={styles.secundario}>
              A planilha continua com {kg(linha.pesoPlanilha)}: na próxima conferência o item volta como divergente até a
              planilha ser corrigida.
            </span>
          )}
        </Stack>
      </Modal>

      <ConfirmDialog
        open={confirmando}
        title={`Gravar o peso de ${linha.codigo} no ERP (${ambienteRotulo})?`}
        confirmLabel="Sim, gravar no ERP"
        variant={ambienteRotulo === "PRODUÇÃO" ? "danger" : "default"}
        loading={gravando}
        message={`Peso líquido ${kg(linha.pesoErp)} → ${kg(peso)} e fator 1 KG = ${peso ? (1 / peso).toLocaleString("pt-BR", { maximumFractionDigits: 6 }) : "—"} ${unidade}. O ERP simula antes; se recusar, nada é gravado.`}
        onConfirm={gravar}
        onClose={() => {
          if (!gravando) setConfirmando(false);
        }}
      />
    </>
  );
}
