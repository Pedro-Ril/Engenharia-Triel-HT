import { ValidationError } from "@/lib/auth/errors";
import { isObject } from "@/lib/auth/validation";

import type { AjusteValoresDecisao } from "./aprovacoes";

/*
 * O ajuste só vem no corpo quando a direção realmente mexeu nos campos
 * de valor/percentual antes de decidir -- ausente significa "decide com
 * o que o solicitante pediu", e não "zera os valores".
 */
export function optionalAjusteValores(body: unknown): AjusteValoresDecisao | null {
  if (!isObject(body) || body.ajuste === undefined || body.ajuste === null) return null;

  if (!isObject(body.ajuste)) {
    throw new ValidationError("Ajuste de valores inválido.");
  }

  const valorReajuste = Number(body.ajuste.valorReajuste);
  const percentualReajuste = Number(body.ajuste.percentualReajuste);

  if (!Number.isFinite(valorReajuste) || !Number.isFinite(percentualReajuste)) {
    throw new ValidationError("Informe um valor e um percentual de reajuste válidos.");
  }

  return { valorReajuste, percentualReajuste };
}
