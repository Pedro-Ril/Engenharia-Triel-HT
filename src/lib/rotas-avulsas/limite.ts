/*
 * Limites das rotas avulsas, em memória do processo (o Portal roda num
 * processo só, `next start`; reiniciar zera os contadores, o que só
 * afrouxa por um instante, nunca bloqueia indevidamente).
 *
 * - Por token: balde de fichas (N por segundo, com rajada de até R) e,
 *   por cima, um teto de M requisições em qualquer janela de 60 s.
 * - Por IP: quem erra o token 10 vezes em 5 minutos fica 15 minutos
 *   bloqueado, sem nem chegar ao banco.
 *
 * Funções puras recebendo `agora`, para dar para testar sem relógio.
 */

export interface LimitesToken {
  porSegundo: number;
  rajada: number;
  porMinuto: number;
}

export type ResultadoLimite = { ok: true } | { ok: false; aguardarSegundos: number };

interface Balde {
  fichas: number;
  atualizadoEm: number;
  janelaMinuto: number[];
}

const MAX_ENTRADAS = 5000;
const JANELA_MINUTO_MS = 60_000;

const FALHAS_PARA_BLOQUEAR = 10;
const JANELA_FALHAS_MS = 5 * 60_000;
const BLOQUEIO_MS = 15 * 60_000;

const baldes = new Map<string, Balde>();
const falhasPorIp = new Map<string, { tentativas: number[]; bloqueadoAte: number }>();

/* Mapas não crescem sem fim: passou do teto, sai quem está parado há mais tempo. */
function podar<T>(mapa: Map<string, T>, ultimoUso: (valor: T) => number, agora: number, idadeMs: number) {
  if (mapa.size < MAX_ENTRADAS) return;
  for (const [chave, valor] of mapa) {
    if (agora - ultimoUso(valor) > idadeMs) mapa.delete(chave);
  }
  /* Ainda cheio (ataque com muitas chaves distintas): descarta os mais antigos. */
  while (mapa.size >= MAX_ENTRADAS) {
    const primeira = mapa.keys().next().value;
    if (primeira === undefined) break;
    mapa.delete(primeira);
  }
}

export function consumirLimite(chave: string, limites: LimitesToken, agora = Date.now()): ResultadoLimite {
  const porSegundo = Math.max(limites.porSegundo, 0.001);
  const capacidade = Math.max(limites.rajada, 1);

  podar(baldes, (b) => b.atualizadoEm, agora, JANELA_MINUTO_MS * 2);

  const balde = baldes.get(chave) ?? { fichas: capacidade, atualizadoEm: agora, janelaMinuto: [] };
  balde.fichas = Math.min(capacidade, balde.fichas + ((agora - balde.atualizadoEm) / 1000) * porSegundo);
  balde.atualizadoEm = agora;
  balde.janelaMinuto = balde.janelaMinuto.filter((t) => agora - t < JANELA_MINUTO_MS);
  baldes.set(chave, balde);

  if (balde.janelaMinuto.length >= limites.porMinuto) {
    const espera = balde.janelaMinuto[0] + JANELA_MINUTO_MS - agora;
    return { ok: false, aguardarSegundos: Math.max(1, Math.ceil(espera / 1000)) };
  }

  if (balde.fichas < 1) {
    const espera = ((1 - balde.fichas) / porSegundo) * 1000;
    return { ok: false, aguardarSegundos: Math.max(1, Math.ceil(espera / 1000)) };
  }

  balde.fichas -= 1;
  balde.janelaMinuto.push(agora);
  return { ok: true };
}

/* Segundos que ainda faltam de bloqueio do IP (0 = liberado). */
export function segundosDeBloqueioIp(ip: string | null, agora = Date.now()): number {
  const registro = falhasPorIp.get(ip ?? "desconhecido");
  if (!registro || registro.bloqueadoAte <= agora) return 0;
  return Math.ceil((registro.bloqueadoAte - agora) / 1000);
}

/* Conta uma falha de token. Devolve true quando esta falha acabou de bloquear o IP. */
export function registrarFalhaToken(ip: string | null, agora = Date.now()): boolean {
  const chave = ip ?? "desconhecido";
  podar(falhasPorIp, (r) => Math.max(r.bloqueadoAte, r.tentativas.at(-1) ?? 0), agora, BLOQUEIO_MS);

  const registro = falhasPorIp.get(chave) ?? { tentativas: [], bloqueadoAte: 0 };
  registro.tentativas = registro.tentativas.filter((t) => agora - t < JANELA_FALHAS_MS);
  registro.tentativas.push(agora);
  falhasPorIp.set(chave, registro);

  if (registro.tentativas.length >= FALHAS_PARA_BLOQUEAR && registro.bloqueadoAte <= agora) {
    registro.bloqueadoAte = agora + BLOQUEIO_MS;
    registro.tentativas = [];
    return true;
  }
  return false;
}

/* Só para os testes. */
export function limparLimites(): void {
  baldes.clear();
  falhasPorIp.clear();
}
