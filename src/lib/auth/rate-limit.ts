import "server-only";

/*
 * Limitador simples em memória, no escopo do módulo — vale
 * enquanto o processo do `next start` estiver de pé, o que é
 * suficiente para este deploy (processo Node único, sem
 * múltiplas instâncias atrás de um load balancer).
 */

const JANELA_MS = 5 * 60 * 1000;
const MAXIMO_TENTATIVAS = 8;

interface RegistroTentativas {
  tentativas: number;
  reinicioEm: number;
}

const tentativasPorChave = new Map<string, RegistroTentativas>();

function limparRegistrosExpirados(agora: number): void {
  for (const [chave, registro] of tentativasPorChave) {
    if (registro.reinicioEm <= agora) {
      tentativasPorChave.delete(chave);
    }
  }
}

export function verificarLimiteLogin(chave: string): {
  permitido: boolean;
  tentativasRestantes: number;
} {
  const agora = Date.now();

  limparRegistrosExpirados(agora);

  const registro = tentativasPorChave.get(chave);

  if (!registro || registro.reinicioEm <= agora) {
    return { permitido: true, tentativasRestantes: MAXIMO_TENTATIVAS };
  }

  return {
    permitido: registro.tentativas < MAXIMO_TENTATIVAS,
    tentativasRestantes: Math.max(
      0,
      MAXIMO_TENTATIVAS - registro.tentativas
    ),
  };
}

export function registrarTentativaFalha(chave: string): void {
  const agora = Date.now();
  const registro = tentativasPorChave.get(chave);

  if (!registro || registro.reinicioEm <= agora) {
    tentativasPorChave.set(chave, {
      tentativas: 1,
      reinicioEm: agora + JANELA_MS,
    });
    return;
  }

  registro.tentativas += 1;
}

export function limparTentativas(chave: string): void {
  tentativasPorChave.delete(chave);
}
