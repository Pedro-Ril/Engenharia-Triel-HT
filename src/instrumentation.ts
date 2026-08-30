/*
 * Hook do Next.js (App Router) chamado uma única vez quando o
 * servidor sobe — usado aqui pra iniciar o agendador em processo
 * que sincroniza automaticamente o catálogo de matéria-prima
 * (Engenharia de Manufatura) quando um intervalo é configurado em
 * Administração > Matéria-Prima. Ver src/lib/materias-primas/scheduler.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { iniciarAgendadorMateriaPrima } = await import(
    "@/lib/materias-primas/scheduler"
  );
  iniciarAgendadorMateriaPrima();

  const { iniciarMonitoramentoAd } = await import(
    "@/lib/monitoramento/scheduler-apis"
  );
  iniciarMonitoramentoAd();

  const { iniciarSignalingSeNecessario } = await import(
    "@/lib/tv/signaling-processo"
  );
  iniciarSignalingSeNecessario();
}

/*
 * Hook do Next.js (App Router) chamado automaticamente pra
 * QUALQUER erro não tratado em rota de API, Server Component ou
 * Server Action — sem precisar adicionar `try/catch` manual em
 * cada uma das dezenas de rotas do portal. Alimenta a tabela
 * `portal_logs`, usada na tela de Monitoramento (Administração).
 *
 * Erros que uma rota já captura e responde como
 * `{ ok: false, message: ... }` (validação, regra de negócio)
 * NÃO passam por aqui — só o que realmente "vazou" sem
 * tratamento, que é o sinal que importa para saúde do sistema.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: NodeJS.Dict<string | string[]> },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { registrarLog } = await import("@/lib/monitoramento/logs");

    const forwardedFor = request.headers["x-forwarded-for"];
    const ipOrigem = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
      ?.split(",")[0]
      ?.trim();

    const mensagem = error instanceof Error ? error.message : String(error);
    const detalhes = error instanceof Error ? error.stack ?? null : null;

    await registrarLog({
      nivel: "erro",
      origem: `${context.routerKind} · ${context.routeType}`,
      mensagem,
      detalhes,
      metodo: request.method,
      caminho: request.path,
      ipOrigem: ipOrigem ?? null,
    });
  } catch (erroAoRegistrar) {
    console.error("Erro ao registrar log via onRequestError:", erroAoRegistrar);
  }
}
