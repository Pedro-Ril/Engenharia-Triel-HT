import type {
  MaquinaNvidia,
  StatusMaquinaNvidia,
} from "@/modules/workstations-nvidia/types/workstationsNvidia.types";

/*
 * Situação de uma máquina a partir da última coleta — a primeira regra
 * que se aplica vence:
 *
 * 1. nunca_coletada: o portal ainda não tentou ler essa máquina.
 * 2. sem_contato: a última leitura do estado.json falhou.
 * 3. erro / adiado / falha: o que o próprio script relatou.
 * 4. divergente: o script achou divergência e não reaplicou
 *    (rodou com -SomenteVerificar).
 * 5. estado_antigo: o arquivo foi lido, mas o script não roda há mais
 *    de `horasSemContato` horas (tarefa agendada parada?).
 * 6. perfil_desatualizado: conforme, mas com um perfil diferente do
 *    oficial publicado no portal (o GPO ainda não copiou o novo).
 * 7. conforme.
 */
export function calcularStatusMaquina(
  maquina: Omit<MaquinaNvidia, "status">,
  contexto: { hashPerfilOficial: string | null; horasSemContato: number; agora?: number }
): StatusMaquinaNvidia {
  if (!maquina.coletaEm) return "nunca_coletada";
  if (!maquina.coletaOk) return "sem_contato";

  if (maquina.acao === "erro") return "erro";
  if (maquina.acao === "adiado") return "adiado";
  if (maquina.acao === "falha_reaplicacao") return "falha";
  if (!maquina.conforme) return "divergente";

  const agora = contexto.agora ?? Date.now();
  const verificadoEm = maquina.verificadoEm ? Date.parse(maquina.verificadoEm) : NaN;
  if (
    Number.isFinite(verificadoEm) &&
    agora - verificadoEm > contexto.horasSemContato * 60 * 60 * 1000
  ) {
    return "estado_antigo";
  }

  if (
    contexto.hashPerfilOficial &&
    maquina.perfilHash &&
    maquina.perfilHash.toUpperCase() !== contexto.hashPerfilOficial.toUpperCase()
  ) {
    return "perfil_desatualizado";
  }

  return "conforme";
}
