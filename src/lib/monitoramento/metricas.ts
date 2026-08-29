import "server-only";

import { registrarMetricaApiSemFalhar } from "./requisicoes";

type RouteHandler = (...args: never[]) => Promise<Response> | Response;

/*
 * Envolve um handler de rota (`GET`/`POST`/`PATCH`/`DELETE` exportado
 * de um route.ts) pra medir volume/latência/status de toda requisição
 * às rotas /api/** — usado na aba Administração → Monitoramento → APIs.
 * `rota` é o caminho da pasta dentro de src/app/api/ (ex:
 * "admin/usuarios/[id]/forcar-logout"), igual ao Next já usa nas
 * pastas, pra ficar fácil rastrear até o arquivo.
 *
 * Só mede — nunca muda o comportamento da rota: se o handler lançar,
 * o erro propaga normalmente (onRequestError em instrumentation.ts
 * continua responsável por virar log de erro e resposta 500).
 */
export function comMetricasApi<T extends RouteHandler>(rota: string, handler: T): T {
  return (async (...args: Parameters<T>) => {
    const inicio = performance.now();
    const metodo = (args[0] as Request)?.method ?? "GET";
    let status = 500;

    try {
      const resposta = await handler(...args);
      status = resposta.status;
      return resposta;
    } finally {
      await registrarMetricaApiSemFalhar({
        rota,
        metodo,
        status,
        duracaoMs: performance.now() - inicio,
      });
    }
  }) as T;
}
