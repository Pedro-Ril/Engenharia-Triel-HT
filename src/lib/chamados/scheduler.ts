import "server-only";

import { buscarConfigChamados } from "./chamados-config";
import {
  buscarChamadoPorNumero,
  listarChamadosParaAutoResolucao,
  resolverAutomaticamente,
} from "./chamados";
import { notificarSolicitanteChamado } from "./notificacoes-email";

/*
 * Checa a cada 1 hora se algum chamado está parado em
 * "aguardando_confirmacao" há mais dias do que o configurado em
 * Administração → Chamados (portal_chamados_config.dias_auto_resolucao,
 * NULL = recurso desligado) -- mesmo padrão de setInterval fixo +
 * intervalo configurável lido a cada tick de
 * src/lib/materias-primas/scheduler.ts. 1h é só a granularidade da
 * checagem (o prazo em si é em DIAS, configurado pelo admin), não
 * precisa ser configurável à parte.
 */
const INTERVALO_VERIFICACAO_MS = 60 * 60 * 1000;

let verificandoAgora = false;

/*
 * Sem Request disponível aqui (não é uma rota de API) -- ao contrário
 * de origemPublicaEfetivaChamados, que cai de volta pro origin da
 * requisição quando url_publica não está configurada, aqui só resta a
 * própria config. Se não estiver configurada, o link do e-mail sai
 * quebrado, mas a resolução automática acontece de qualquer jeito --
 * não faz sentido travar a auto-resolução por causa do e-mail.
 */
async function verificarEResolverPendentes() {
  if (verificandoAgora) return;
  verificandoAgora = true;

  try {
    const config = await buscarConfigChamados();
    if (!config.diasAutoResolucao) return;

    const origem = config.urlPublica ?? "";
    const chamados = await listarChamadosParaAutoResolucao(config.diasAutoResolucao);

    for (const { id, numero } of chamados) {
      try {
        const sucesso = await resolverAutomaticamente(id, config.diasAutoResolucao);
        if (!sucesso) continue;

        const chamado = await buscarChamadoPorNumero(numero);
        if (!chamado) continue;

        await notificarSolicitanteChamado({
          chamado,
          evento: "resolvido_automatico",
          origem,
        });
      } catch (error) {
        console.error(`Erro ao auto-resolver o chamado #${numero}:`, error);
      }
    }
  } catch (error) {
    console.error("Erro no agendador de auto-resolução de chamados:", error);
  } finally {
    verificandoAgora = false;
  }
}

declare global {
  var engChamadosAutoResolucaoSchedulerIniciado: boolean | undefined;
}

export function iniciarAgendadorAutoResolucaoChamados() {
  if (global.engChamadosAutoResolucaoSchedulerIniciado) return;
  global.engChamadosAutoResolucaoSchedulerIniciado = true;

  setInterval(() => {
    verificarEResolverPendentes().catch((error) => {
      console.error("Erro inesperado no agendador de auto-resolução de chamados:", error);
    });
  }, INTERVALO_VERIFICACAO_MS);
}
