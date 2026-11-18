import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import type {
  DivergenciaPerfil,
  ResultadoColetaNvidia,
} from "@/modules/workstations-nvidia/types/workstationsNvidia.types";

import { enviarAlertasNvidia, TIPOS_QUE_ALERTAM } from "./alertas";
import { buscarConfiguracaoNvidia, separarEmails } from "./config";
import { lerEstadoWorkstation, type ResultadoLeituraEstado } from "./estado";
import { registrarEventoSemFalhar, type NovoEventoNvidia } from "./eventos";
import {
  buscarMaquina,
  gravarColetaComFalha,
  gravarColetaComSucesso,
  listarMaquinas,
  type MaquinaParaColeta,
} from "./maquinas";

/*
 * Coleta: lê o estado.json de cada máquina ativa, compara com a coleta
 * anterior para gerar o histórico (e os alertas por e-mail) e grava a
 * nova foto. Uma coleta por vez no processo todo — a agendada e a do
 * botão "Coletar agora" compartilham a mesma trava.
 */

const LEITURAS_EM_PARALELO = 6;

declare global {
  var wsNvidiaColetaEmAndamento: boolean | undefined;
  var wsNvidiaUltimaColetaGeralEm: string | undefined;
}

export function coletaEmAndamento(): boolean {
  return Boolean(global.wsNvidiaColetaEmAndamento);
}

export function ultimaColetaGeralEm(): string | null {
  return global.wsNvidiaUltimaColetaGeralEm ?? null;
}

function formatarDataScript(iso: string | null): string {
  if (!iso) return "data desconhecida";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `${horas}h`;
  return `${Math.floor(horas / 24)} dias`;
}

export function descreverDivergencia(divergencia: DivergenciaPerfil): string {
  const nome = divergencia.configuracao || `configuração ${divergencia.configuracaoId}`;
  const encontrado = divergencia.encontrado ?? "ausente";
  return `${divergencia.perfil} · ${nome}: esperado ${divergencia.esperado}, encontrado ${encontrado}`;
}

/*
 * Decide quais eventos uma coleta gera, comparando com a foto anterior
 * da máquina. Função pura — a gravação fica com quem chama.
 */
export function analisarColeta(
  anterior: MaquinaParaColeta,
  resultado: ResultadoLeituraEstado,
  horasSemContato: number
): { eventos: NovoEventoNvidia[]; alertaSemContatoEnviado: boolean } {
  const base = { maquinaId: anterior.id, computador: anterior.computador };
  const eventos: NovoEventoNvidia[] = [];

  if (!resultado.ok) {
    const passouDoLimite = anterior.minutosDesdeContato >= horasSemContato * 60;

    if (passouDoLimite && !anterior.alertaSemContatoEnviado) {
      const desde = anterior.contatoEm
        ? `há ${formatarDuracao(anterior.minutosDesdeContato)}`
        : `desde o cadastro (${formatarDuracao(anterior.minutosDesdeContato)})`;
      eventos.push({
        ...base,
        tipo: "sem_contato",
        descricao: `Sem conseguir ler o estado.json ${desde}. Último erro: ${resultado.erro}`,
      });
      return { eventos, alertaSemContatoEnviado: true };
    }

    return { eventos, alertaSemContatoEnviado: anterior.alertaSemContatoEnviado };
  }

  const estado = resultado.estado;

  if (anterior.alertaSemContatoEnviado) {
    eventos.push({
      ...base,
      tipo: "contato_restabelecido",
      descricao: "O portal voltou a conseguir ler o estado.json desta máquina.",
    });
  }

  const driverNovo = estado.gpu?.driverNvidia ?? null;
  if (anterior.driverNvidia && driverNovo && anterior.driverNvidia !== driverNovo) {
    eventos.push({
      ...base,
      tipo: "driver_alterado",
      descricao: `Driver NVIDIA mudou de ${anterior.driverNvidia} para ${driverNovo}.`,
    });
  }

  const reaplicacao = estado.ultimaReaplicacao;
  if (reaplicacao?.em && reaplicacao.em !== anterior.ultimaReaplicacaoEm) {
    const quando = formatarDataScript(reaplicacao.em);
    const encontradas = estado.divergenciasEncontradas.map(descreverDivergencia).join("; ");

    if (reaplicacao.sucesso) {
      eventos.push({
        ...base,
        tipo: "reaplicado",
        descricao:
          `Perfil reaplicado pelo script em ${quando}` +
          (encontradas ? `. Estava divergente: ${encontradas}.` : "."),
      });
    } else {
      const restantes = estado.divergenciasAposReaplicar.map(descreverDivergencia).join("; ");
      eventos.push({
        ...base,
        tipo: "falha_reaplicacao",
        descricao:
          `O script tentou reaplicar o perfil em ${quando} e não conseguiu` +
          (estado.erro ? `: ${estado.erro}` : "") +
          (restantes ? `. Continua divergente: ${restantes}.` : "."),
      });
    }
  }

  if (
    estado.acao === "erro" &&
    (anterior.acao !== "erro" || anterior.erroScript !== estado.erro)
  ) {
    eventos.push({
      ...base,
      tipo: "erro_script",
      descricao: `O script relatou um erro em ${formatarDataScript(estado.verificadoEm)}: ${estado.erro ?? "sem mensagem"}`,
    });
  }

  return { eventos, alertaSemContatoEnviado: false };
}

async function processarEmLotes<T>(itens: T[], limite: number, tarefa: (item: T) => Promise<void>) {
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (proximo < itens.length) {
      const item = itens[proximo++];
      await tarefa(item);
    }
  });
  await Promise.all(trabalhadores);
}

export async function coletarMaquinas(opcoes: { maquinaId?: string } = {}): Promise<ResultadoColetaNvidia> {
  if (global.wsNvidiaColetaEmAndamento) {
    throw new ValidationError("Já existe uma coleta em andamento. Aguarde alguns instantes e atualize a tela.");
  }

  global.wsNvidiaColetaEmAndamento = true;

  try {
    const config = await buscarConfiguracaoNvidia();

    let maquinas: MaquinaParaColeta[];
    if (opcoes.maquinaId) {
      const maquina = await buscarMaquina(opcoes.maquinaId);
      if (!maquina) throw new ValidationError("Máquina não encontrada.");
      maquinas = [maquina];
    } else {
      maquinas = await listarMaquinas({ somenteAtivas: true });
    }

    const resultado: ResultadoColetaNvidia = {
      maquinasColetadas: maquinas.length,
      comSucesso: 0,
      semContato: 0,
      eventosGerados: 0,
    };
    const eventosParaAlerta: NovoEventoNvidia[] = [];

    await processarEmLotes(maquinas, LEITURAS_EM_PARALELO, async (maquina) => {
      try {
        const leitura = await lerEstadoWorkstation(maquina.computador, config.caminhoEstado);
        const { eventos, alertaSemContatoEnviado } = analisarColeta(
          maquina,
          leitura,
          config.horasSemContato
        );

        if (leitura.ok) {
          await gravarColetaComSucesso(maquina.id, leitura.estado, alertaSemContatoEnviado);
          resultado.comSucesso++;
        } else {
          await gravarColetaComFalha(maquina.id, leitura.erro, alertaSemContatoEnviado);
          resultado.semContato++;
        }

        for (const evento of eventos) {
          if (await registrarEventoSemFalhar(evento)) resultado.eventosGerados++;
          if (TIPOS_QUE_ALERTAM.has(evento.tipo)) eventosParaAlerta.push(evento);
        }
      } catch (error) {
        console.error(`Erro ao coletar a workstation ${maquina.computador}:`, error);
      }
    });

    if (!opcoes.maquinaId) {
      global.wsNvidiaUltimaColetaGeralEm = new Date().toISOString();
    }

    const destinatarios = separarEmails(config.emailsAlerta);
    if (destinatarios.length > 0 && eventosParaAlerta.length > 0) {
      try {
        await enviarAlertasNvidia(destinatarios, eventosParaAlerta);
      } catch (error) {
        console.error("Erro ao enviar alertas de Workstations NVIDIA:", error);
      }
    }

    return resultado;
  } finally {
    global.wsNvidiaColetaEmAndamento = false;
  }
}
