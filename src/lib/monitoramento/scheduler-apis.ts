import "server-only";

import { getConfiguracaoAd } from "@/lib/auth/configuracao-ad";
import { testarConexaoAd } from "@/lib/auth/ldap";

import { registrarChamadaExternaSemFalhar } from "./chamadas-externas";

/*
 * Checagem periódica de saúde do Active Directory pra aba
 * Administração → Monitoramento → APIs — reusa testarConexaoAd, a
 * mesma função (segura, só bind de serviço + checagem de grupo, nunca
 * toca em credencial de usuário) já usada pelo botão manual de teste
 * em Configurações → Active Directory. Sem checagem ativa equivalente
 * pro ERP (o agendador de matéria-prima já dá esse sinal sozinho) nem
 * pro e-mail (pingar de verdade enviaria e-mail real, sem modo de
 * teste disponível) — ver src/lib/monitoramento/chamadas-externas.ts.
 */
const INTERVALO_VERIFICACAO_MS = 5 * 60 * 1000;

let verificandoAgora = false;

async function verificarSaudeAd() {
  if (verificandoAgora) return;
  verificandoAgora = true;

  try {
    const config = await getConfiguracaoAd();
    if (!config) return;

    const inicio = performance.now();
    const resultado = await testarConexaoAd(config);
    const duracaoMs = performance.now() - inicio;

    const sucesso = resultado.conectou && resultado.grupoAdminExiste;

    await registrarChamadaExternaSemFalhar({
      servico: "active_directory",
      origem: "health_check",
      sucesso,
      duracaoMs,
      mensagemErro: sucesso ? null : resultado.mensagemErro,
    });
  } catch (error) {
    console.error("Erro na checagem periódica de saúde do Active Directory:", error);
  } finally {
    verificandoAgora = false;
  }
}

declare global {
  var monitoramentoApisSchedulerIniciado: boolean | undefined;
}

export function iniciarMonitoramentoAd() {
  if (global.monitoramentoApisSchedulerIniciado) return;
  global.monitoramentoApisSchedulerIniciado = true;

  setInterval(() => {
    verificarSaudeAd().catch((error) => {
      console.error("Erro inesperado na checagem periódica de saúde do Active Directory:", error);
    });
  }, INTERVALO_VERIFICACAO_MS);
}
