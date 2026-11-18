import "server-only";

import type {
  MaquinaNvidia,
  ResumoMaquinasNvidia,
} from "@/modules/workstations-nvidia/types/workstationsNvidia.types";

import { coletaEmAndamento, ultimaColetaGeralEm } from "./coleta";
import { buscarConfiguracaoNvidia } from "./config";
import { listarMaquinas, type MaquinaParaColeta } from "./maquinas";
import { lerPerfilOficial } from "./perfil";
import { calcularStatusMaquina } from "./status";

/* Tira os campos internos do coletor antes de mandar para o navegador. */
function paraTela(
  maquina: MaquinaParaColeta,
  contexto: { hashPerfilOficial: string | null; horasSemContato: number }
): MaquinaNvidia {
  const { alertaSemContatoEnviado, minutosDesdeContato, ...publica } = maquina;
  void alertaSemContatoEnviado;
  void minutosDesdeContato;
  return { ...publica, status: calcularStatusMaquina(publica, contexto) };
}

export async function montarResumoMaquinas(): Promise<ResumoMaquinasNvidia> {
  const [config, maquinas, perfil] = await Promise.all([
    buscarConfiguracaoNvidia(),
    listarMaquinas(),
    lerPerfilOficial(),
  ]);

  const contexto = { hashPerfilOficial: perfil.hash, horasSemContato: config.horasSemContato };

  return {
    maquinas: maquinas.map((maquina) => paraTela(maquina, contexto)),
    perfil,
    coletaEmAndamento: coletaEmAndamento(),
    ultimaColetaGeralEm: ultimaColetaGeralEm(),
  };
}

export async function montarMaquinaParaTela(maquina: MaquinaParaColeta): Promise<MaquinaNvidia> {
  const [config, perfil] = await Promise.all([buscarConfiguracaoNvidia(), lerPerfilOficial()]);
  return paraTela(maquina, { hashPerfilOficial: perfil.hash, horasSemContato: config.horasSemContato });
}
