import type { RoteiroItem } from "../types/cadastroRoteiro.types";

/*
 * Como uma operação que já está no ERP vai de volta na importação v2 --
 * compartilhado entre o cadastro de operação e o "Roteiro continua
 * válido" (testado em roteiro-payload.test.ts).
 */

/* "Roteiro padrão" -> 0; "Alternativo 2" -> 2. */
export function alternativoParaNumero(valor?: string | null): number {
  const texto = String(valor ?? "").trim().toUpperCase();

  if (!texto || texto.includes("PADRÃO") || texto.includes("PADRAO")) {
    return 0;
  }

  const match = texto.match(/ALTERNATIVO\s+(\d+)/);

  return match ? Number(match[1]) : 0;
}

/*
 * Operação existente SEM recursos e consumos: a v2 deixa no ERP o que já
 * existe. A revisão vai com a informada (a da peça) -- o roteiro
 * acompanha a revisão atual.
 */
export function roteiroExistenteParaPayload(roteiro: RoteiroItem, revisao: string | null) {
  return {
    alternativo: alternativoParaNumero(roteiro.ALTERNATIVO),
    seq: Number(roteiro.SEQ),
    cod_operacao: String(roteiro.COD_OPERACAO ?? "").trim(),
    cod_centro_trab: String(roteiro.COD_CENTRO_TRAB ?? "").trim(),
    cod_unid_med: String(roteiro.COD_UNID_MED ?? "").trim(),
    dt_inicio: roteiro.DT_INICIO || null,
    dt_fim: roteiro.DT_FIM || null,
    apontamento: String(roteiro.APONTAMENTO ?? "0"),
    obrigatorio: String(roteiro.OBRIGATORIO ?? "0"),
    tempo: roteiro.TEMPO ?? null,
    observacao: roteiro.OBSERVACAO || null,
    revisao: revisao || null,
  };
}

/* O que /v2/roteiro/importar/validar devolve, no que importa aqui. */
export type DetalhePlanoErp = {
  alternativo: number;
  seq: number;
  status?: string;
  camposAlterados?: { campo: string; de: unknown; para: unknown }[];
  removidos?: { recursos?: number; consumos?: number };
  desligados?: { operacoesOrdens?: number; roteirosMrp?: number };
};

export type PlanoErp = {
  success: boolean;
  message?: string;
  detalhes?: DetalhePlanoErp[];
  excluidos?: DetalhePlanoErp[];
};

/*
 * Tudo o que o plano mudaria ALÉM da revisão. Vazio = seguro para o
 * "Roteiro continua válido" (que só deve trocar a revisão).
 */
export function mudancasAlemDaRevisao(plano: PlanoErp): string[] {
  const mudancas: string[] = [];
  const onde = (d: DetalhePlanoErp) => `operação ${d.seq}${d.alternativo ? ` (alternativo ${d.alternativo})` : ""}`;

  for (const excluida of plano.excluidos ?? []) {
    mudancas.push(`${onde(excluida)} seria excluída`);
  }

  for (const detalhe of plano.detalhes ?? []) {
    const campos = (detalhe.camposAlterados ?? []).map((c) => c.campo).filter((campo) => !/revis/i.test(campo));
    if (campos.length > 0) mudancas.push(`${onde(detalhe)}: mudaria ${campos.join(", ")}`);

    if ((detalhe.removidos?.recursos ?? 0) > 0 || (detalhe.removidos?.consumos ?? 0) > 0) {
      mudancas.push(`${onde(detalhe)}: perderia máquinas ou consumos`);
    }
    if ((detalhe.desligados?.operacoesOrdens ?? 0) > 0 || (detalhe.desligados?.roteirosMrp ?? 0) > 0) {
      mudancas.push(`${onde(detalhe)}: seria desligada das ordens/MRP`);
    }
  }

  return mudancas;
}
