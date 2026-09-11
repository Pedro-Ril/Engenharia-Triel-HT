"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import { DateInput } from "@/components/ui/DateInput";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { NumberInput } from "@/components/ui/NumberInput";
import { Stack } from "@/components/ui/Stack";
import { Switch } from "@/components/ui/Switch";

import type { CampoTipoEquipamento } from "../types/estoque.types";
import styles from "./CampoDinamicoInput.module.css";

interface CampoDinamicoInputProps {
  campo: CampoTipoEquipamento;
  value: unknown;
  onChange: (value: unknown) => void;
  id?: string;
  highlighted?: boolean;
}

const MENSAGEM_OBRIGATORIO = "Este campo é obrigatório.";

export function CampoDinamicoInput({ campo, value, onChange, id, highlighted = false }: CampoDinamicoInputProps) {
  const label = campo.unidade ? `${campo.rotulo} (${campo.unidade})` : campo.rotulo;
  const erro = highlighted ? MENSAGEM_OBRIGATORIO : undefined;

  /*
   * Campo marcado como "vem de integração" (flag do admin, ver
   * TiposEquipamentoPainel) — sempre bloqueado, independente do tipo de
   * dado configurado, porque quem preenche é o job automático, não a
   * pessoa no formulário.
   */
  if (campo.vemDeIntegracao) {
    return (
      <Field
        id={id}
        label={label}
        hint="Preenchido automaticamente por integração — não é possível digitar aqui"
      >
        <Input value="" disabled placeholder="Aguardando integração" />
      </Field>
    );
  }

  if (campo.tipoDado === "numero") {
    return (
      <Field id={id} label={label} required={campo.obrigatorio} error={erro} highlighted={highlighted}>
        <NumberInput
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
        />
      </Field>
    );
  }

  if (campo.tipoDado === "data") {
    return (
      <Field id={id} label={label} required={campo.obrigatorio} error={erro} highlighted={highlighted}>
        <DateInput value={(value as string) ?? ""} onValueChange={onChange} />
      </Field>
    );
  }

  if (campo.tipoDado === "booleano") {
    return (
      <div id={id} className={highlighted ? styles.destaque : undefined}>
        <Switch
          label={
            campo.obrigatorio ? (
              <>
                {label}
                <span className={styles.required} aria-hidden="true">
                  *
                </span>
              </>
            ) : (
              label
            )
          }
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
    );
  }

  if (campo.tipoDado === "unica_escolha") {
    return (
      <Field id={id} label={label} required={campo.obrigatorio} error={erro} highlighted={highlighted}>
        <Dropdown
          value={(value as string) ?? ""}
          options={[
            { value: "", label: "Selecione" },
            ...(campo.opcoes ?? []).map((opcao) => ({ value: opcao, label: opcao })),
          ]}
          onValueChange={onChange}
        />
      </Field>
    );
  }

  if (campo.tipoDado === "multipla_escolha") {
    const valoresSelecionados = Array.isArray(value) ? (value as string[]) : [];

    function alternar(opcao: string, marcado: boolean) {
      onChange(
        marcado
          ? [...valoresSelecionados, opcao]
          : valoresSelecionados.filter((item) => item !== opcao)
      );
    }

    return (
      <Field id={id} label={label} required={campo.obrigatorio} error={erro} highlighted={highlighted}>
        <Stack direction="row" gap={16} wrap>
          {(campo.opcoes ?? []).map((opcao) => (
            <Checkbox
              key={opcao}
              label={opcao}
              checked={valoresSelecionados.includes(opcao)}
              onChange={(event) => alternar(opcao, event.target.checked)}
            />
          ))}
        </Stack>
      </Field>
    );
  }

  return (
    <Field id={id} label={label} required={campo.obrigatorio} error={erro} highlighted={highlighted}>
      <Input value={(value as string) ?? ""} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}
