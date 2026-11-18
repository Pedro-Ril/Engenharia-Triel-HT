import "server-only";

import { enviarEmail } from "@/lib/smtp/enviar-email";
import { montarEmailHtml } from "@/lib/smtp/template-email";
import type { TipoEventoNvidia } from "@/modules/workstations-nvidia/types/workstationsNvidia.types";

import type { NovoEventoNvidia } from "./eventos";

/*
 * Um único e-mail por coleta com tudo o que precisa de atenção — evita
 * uma enxurrada de mensagens quando, por exemplo, uma atualização de
 * driver chega em várias máquinas no mesmo dia.
 */

export const TIPOS_QUE_ALERTAM = new Set<TipoEventoNvidia>([
  "falha_reaplicacao",
  "erro_script",
  "sem_contato",
  "driver_alterado",
  "contato_restabelecido",
]);

const TITULOS: Partial<Record<TipoEventoNvidia, string>> = {
  falha_reaplicacao: "Falha ao reaplicar o perfil",
  erro_script: "Erro no script da workstation",
  sem_contato: "Sem contato",
  driver_alterado: "Driver NVIDIA alterado",
  contato_restabelecido: "Contato restabelecido",
};

const ORDEM: TipoEventoNvidia[] = [
  "falha_reaplicacao",
  "erro_script",
  "sem_contato",
  "driver_alterado",
  "contato_restabelecido",
];

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function enviarAlertasNvidia(
  destinatarios: string[],
  eventos: NovoEventoNvidia[]
): Promise<void> {
  const alertas = eventos
    .filter((evento) => TIPOS_QUE_ALERTAM.has(evento.tipo))
    .sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo));

  if (destinatarios.length === 0 || alertas.length === 0) return;

  const assunto =
    alertas.length === 1
      ? `Workstations NVIDIA: ${alertas[0].computador ?? "geral"} — ${TITULOS[alertas[0].tipo]}`
      : `Workstations NVIDIA: ${alertas.length} alertas`;

  const linhasHtml = alertas
    .map(
      (alerta) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; vertical-align: top;"><strong>${escaparHtml(alerta.computador ?? "—")}</strong></td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; white-space: nowrap; vertical-align: top;">${escaparHtml(TITULOS[alerta.tipo] ?? alerta.tipo)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">${escaparHtml(alerta.descricao)}</td>
        </tr>`
    )
    .join("");

  const corpoHtml = montarEmailHtml(`
    <p style="margin: 0 0 12px;">A coleta de status das workstations NVIDIA encontrou ${alertas.length === 1 ? "um ponto" : `${alertas.length} pontos`} de atenção:</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 0 0 12px;">
      <thead>
        <tr>
          <th style="text-align: left; padding: 8px 12px; border-bottom: 2px solid #d1d5db;">Máquina</th>
          <th style="text-align: left; padding: 8px 12px; border-bottom: 2px solid #d1d5db;">Evento</th>
          <th style="text-align: left; padding: 8px 12px; border-bottom: 2px solid #d1d5db;">Detalhes</th>
        </tr>
      </thead>
      <tbody>${linhasHtml}</tbody>
    </table>
    <p style="margin: 0;">Detalhes e histórico em Administração → Workstations NVIDIA.</p>
  `);

  const corpoTexto = [
    "A coleta de status das workstations NVIDIA encontrou pontos de atenção:",
    "",
    ...alertas.map(
      (alerta) =>
        `- ${alerta.computador ?? "—"} | ${TITULOS[alerta.tipo] ?? alerta.tipo} | ${alerta.descricao}`
    ),
    "",
    "Detalhes e histórico em Administração → Workstations NVIDIA.",
  ].join("\n");

  await enviarEmail({ destinatario: destinatarios, assunto, corpoHtml, corpoTexto });
}
