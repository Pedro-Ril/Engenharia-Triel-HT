/*
 * Configuração específica da rota de impressão (coluna `config` de
 * portal_rotas_avulsas). Sem "server-only": a administração usa os mesmos
 * padrões e faixas para o formulário.
 */
export interface ConfigImpressao {
  tamanhoMaxMb: number;
  paginasMax: number;
  copiasMax: number;
}

export const FAIXAS_CONFIG_IMPRESSAO: Record<keyof ConfigImpressao, { min: number; max: number; padrao: number }> = {
  tamanhoMaxMb: { min: 1, max: 100, padrao: 20 },
  paginasMax: { min: 1, max: 2000, padrao: 200 },
  copiasMax: { min: 1, max: 100, padrao: 10 },
};

function inteiroNaFaixa(valor: unknown, faixa: { min: number; max: number; padrao: number }): number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= faixa.min && valor <= faixa.max
    ? valor
    : faixa.padrao;
}

export function lerConfigImpressao(config: Record<string, unknown>): ConfigImpressao {
  return {
    tamanhoMaxMb: inteiroNaFaixa(config.tamanhoMaxMb, FAIXAS_CONFIG_IMPRESSAO.tamanhoMaxMb),
    paginasMax: inteiroNaFaixa(config.paginasMax, FAIXAS_CONFIG_IMPRESSAO.paginasMax),
    copiasMax: inteiroNaFaixa(config.copiasMax, FAIXAS_CONFIG_IMPRESSAO.copiasMax),
  };
}
