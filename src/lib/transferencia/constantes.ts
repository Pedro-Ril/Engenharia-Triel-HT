/*
 * Sem `server-only` de propósito — importado tanto pelo backend
 * (transferencia-config.ts) quanto por componentes cliente (o texto
 * de dica no painel de admin), então não pode carregar nada exclusivo
 * de servidor.
 */
export const DURACAO_MAXIMA_HORAS_PADRAO = 24 * 30;
