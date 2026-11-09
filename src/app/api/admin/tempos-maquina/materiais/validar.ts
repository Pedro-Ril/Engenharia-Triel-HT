import { ValidationError } from "@/lib/auth/errors";
import { optionalBoolean, optionalInteger, optionalText, requiredText } from "@/lib/auth/validation";
import type { DadosMaterial } from "@/lib/tempos-maquina/cadastro";

export function validarMaterial(corpo: Record<string, unknown>): DadosMaterial {
  const densidade = Number(String(corpo.densidade ?? "").replace(",", "."));
  if (!(densidade > 0 && densidade < 100)) throw new ValidationError("Informe a densidade (kg/dm³), maior que zero.");

  const termos = requiredText(corpo.termos, "palavras da descrição", 400)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");
  if (!termos) throw new ValidationError("Informe ao menos uma palavra da descrição.");

  return {
    nome: requiredText(corpo.nome, "nome", 100),
    termos,
    densidade,
    variante: optionalText(corpo.variante, "variante", 30),
    ordem: optionalInteger(corpo.ordem, "ordem", 0),
    ativo: optionalBoolean(corpo.ativo, "ativo", true),
  };
}
