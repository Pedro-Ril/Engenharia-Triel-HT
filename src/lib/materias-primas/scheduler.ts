import "server-only";

import {
  buscarConfigMateriaPrima,
  listarEmpresasComCatalogo,
  sincronizarCatalogoMateriaPrima,
} from "./materias-primas";

/*
 * Checa a cada 5 minutos (fixo) se alguma empresa já sincronizada
 * está "vencida" em relação ao intervalo configurado — em vez de
 * tentar alinhar um timer exato ao intervalo escolhido, essa
 * checagem periódica se autocorrige sozinha depois de um restart do
 * servidor, e nunca sincroniza uma empresa nova por conta própria
 * (só quem já foi sincronizado manualmente ao menos uma vez).
 */
const INTERVALO_VERIFICACAO_MS = 5 * 60 * 1000;

let sincronizandoAgora = false;

async function verificarESincronizarVencidas() {
  if (sincronizandoAgora) return;
  sincronizandoAgora = true;

  try {
    const config = await buscarConfigMateriaPrima();
    if (!config.intervaloSincronizacaoMinutos) return;

    const empresas = await listarEmpresasComCatalogo();
    const agora = Date.now();
    const intervaloMs = config.intervaloSincronizacaoMinutos * 60 * 1000;

    for (const empresa of empresas) {
      const ultimaMs = empresa.ultimaSincronizacao
        ? new Date(empresa.ultimaSincronizacao).getTime()
        : 0;

      if (agora - ultimaMs < intervaloMs) continue;

      try {
        await sincronizarCatalogoMateriaPrima(empresa.codEmpresa, null);
      } catch (error) {
        console.error(
          `Erro ao sincronizar automaticamente a empresa ${empresa.codEmpresa}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error("Erro no agendador de sincronização de matéria-prima:", error);
  } finally {
    sincronizandoAgora = false;
  }
}

declare global {
  var engManMpSchedulerIniciado: boolean | undefined;
}

/*
 * Guarda por `global` (mesmo padrão do pool do SQL Server) pra não
 * criar mais de um interval se register() do instrumentation.ts for
 * chamado mais de uma vez.
 */
export function iniciarAgendadorMateriaPrima() {
  if (global.engManMpSchedulerIniciado) return;
  global.engManMpSchedulerIniciado = true;

  setInterval(() => {
    verificarESincronizarVencidas().catch((error) => {
      console.error("Erro inesperado no agendador de matéria-prima:", error);
    });
  }, INTERVALO_VERIFICACAO_MS);
}
