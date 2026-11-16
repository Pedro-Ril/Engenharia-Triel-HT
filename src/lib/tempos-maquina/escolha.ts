import { calcularTempo, escolherEspessura } from "./calculo";
import type { DadosPeca, PerfilCadastrado, PerfilEscolhaEspessura, PerfilTempo, ResultadoTempo } from "./tipos";

/*
 * Perfil "escolha da tabela pela espessura" (ver PerfilEscolhaEspessura em
 * tipos.ts): resolve qual perfil de corte CNC vale para a espessura e a
 * variante da peça e calcula com ele. Puro: quem chama passa a lista de
 * perfis cadastrados (o servidor, o simulador e o Roteiro).
 */

export type PerfilDisponivel = { id: string; nome: string; parametros: PerfilCadastrado };

function num(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export type EscolhaResolvida =
  | {
      ok: true;
      /* O perfil que calcula de fato (o próprio, quando não é de escolha). */
      perfil: PerfilTempo;
      /* Preenchidos só quando houve escolha. */
      escolhido: { id: string; nome: string; espessuraMm: number; variante: string } | null;
      dados: DadosPeca;
      avisos: string[];
    }
  | { ok: false; erro: string };

export function resolverPerfil(perfil: PerfilCadastrado, dados: DadosPeca, perfis: PerfilDisponivel[]): EscolhaResolvida {
  if (perfil.metodo !== "escolha_espessura") return { ok: true, perfil, escolhido: null, dados, avisos: [] };

  if (!(dados.espessuraMm > 0)) return { ok: false, erro: "Informe a espessura." };

  const variante = dados.variante?.trim() || perfil.variantes[0]?.chave;
  const rotuloVariante = perfil.variantes.find((v) => v.chave === variante)?.rotulo;
  if (!variante || !rotuloVariante) return { ok: false, erro: "Variante inválida para a escolha da tabela." };

  const linha = escolherEspessura(
    perfil.espessuras.map((espessuraMm) => ({ espessuraMm })),
    dados.espessuraMm
  );
  if ("erro" in linha) return { ok: false, erro: linha.erro };
  const espessuraMm = linha.linha.espessuraMm;

  const regra = perfil.regras.find((r) => r.variante === variante && Math.abs(r.espessuraMm - espessuraMm) < 1e-9);
  if (!regra) {
    return { ok: false, erro: `Não há tabela para ${num(espessuraMm)} mm em ${rotuloVariante.toLowerCase()} (a planilha também não calcula essa combinação).` };
  }

  const alvo = perfis.find((p) => p.id === regra.perfilId);
  if (!alvo) return { ok: false, erro: `O perfil escolhido para ${num(espessuraMm)} mm não existe mais.` };
  if (alvo.parametros.metodo !== "corte_cnc") return { ok: false, erro: `O perfil "${alvo.nome}" não é de corte CNC.` };

  /* A variante só segue se o perfil escolhido a tiver; senão, a automática dele. */
  const varianteDoAlvo = alvo.parametros.variantes.some((v) => v.chave === variante) ? variante : null;

  return {
    ok: true,
    perfil: alvo.parametros,
    escolhido: { id: alvo.id, nome: alvo.nome, espessuraMm, variante: rotuloVariante },
    /* A espessura da grade: o perfil escolhido calcula na mesma linha que decidiu a escolha. */
    dados: { ...dados, espessuraMm, variante: varianteDoAlvo },
    avisos: linha.aviso ? [linha.aviso] : [],
  };
}

/* Calcula com qualquer perfil cadastrado; no de escolha, mostra qual tabela foi usada. */
export function calcularTempoCadastrado(perfil: PerfilCadastrado, dados: DadosPeca, perfis: PerfilDisponivel[]): ResultadoTempo & { perfilUsado: { id: string; nome: string } | null } {
  const escolha = resolverPerfil(perfil, dados, perfis);
  if (!escolha.ok) return { ok: false, tempoMin: null, parcelas: [], referencia: [], avisos: [], erros: [escolha.erro], perfilUsado: null };

  const resultado = calcularTempo(escolha.perfil, escolha.dados);
  if (!escolha.escolhido) return { ...resultado, perfilUsado: null };

  return {
    ...resultado,
    avisos: [...escolha.avisos, ...resultado.avisos],
    referencia: [{ rotulo: "Tabela usada", valor: escolha.escolhido.nome }, ...resultado.referencia],
    perfilUsado: { id: escolha.escolhido.id, nome: escolha.escolhido.nome },
  };
}

/* IDs dos perfis que uma escolha usa (para carregar junto e para não deixar excluir). */
export function perfisUsadosPelaEscolha(perfil: PerfilCadastrado): string[] {
  return perfil.metodo === "escolha_espessura" ? [...new Set(perfil.regras.map((r) => r.perfilId))] : [];
}

/* ---------------- Regra da planilha ---------------- */

/* Espessuras da aba "Laser" (botões "Selecione a Espessura da Chapa"). */
export const ESPESSURAS_PLANILHA_LASER = [1.5, 2, 2.65, 3, 3.35, 3.75, 4.25, 4.75, 6.35, 8, 9.5, 11, 12.7, 16, 19];

export type MaquinaPlanilhaLaser = "BYSTAR" | "BYSPRINT" | "BYSPEED" | "TRUMPF";

/*
 * Célula N7 da aba "Laser" (TEMPOS_PLASMA_CNC_CORRIGIDA.xls), por extenso.
 * Espessura que não aparece = a planilha não calcula (N7 fica vazia).
 */
export const REGRA_PLANILHA_LASER: Record<"padrao" | "especial", Partial<Record<number, MaquinaPlanilhaLaser>>> = {
  padrao: {
    1.5: "BYSPRINT",
    2: "BYSPRINT",
    2.65: "BYSPRINT",
    3: "BYSPRINT",
    3.35: "BYSPEED",
    3.75: "TRUMPF",
    4.25: "BYSTAR",
    4.75: "TRUMPF",
    6.35: "TRUMPF",
    8: "BYSPEED",
    9.5: "BYSPEED",
    12.7: "BYSPEED",
  },
  especial: {
    2: "BYSPRINT",
    3: "BYSPEED",
    3.75: "BYSPEED",
    4.25: "BYSPEED",
    4.75: "BYSPEED",
    6.35: "BYSPEED",
    8: "BYSPEED",
    9.5: "TRUMPF",
    11: "BYSPEED",
    12.7: "BYSPEED",
  },
};

/*
 * A escolha da planilha montada com os perfis cadastrados: cada máquina da
 * planilha é o perfil de corte CNC com o nome dela (ex.: "Laser TRUMPF
 * (C005) - planilha"). Máquina sem perfil com esse nome fica de fora e é
 * devolvida em `faltando`.
 */
export function escolhaDaPlanilhaLaser(perfis: { id: string; nome: string; metodo: string }[]): {
  parametros: PerfilEscolhaEspessura;
  faltando: MaquinaPlanilhaLaser[];
} {
  const faltando = new Set<MaquinaPlanilhaLaser>();
  const idDaMaquina = (maquina: MaquinaPlanilhaLaser) => {
    const perfil = perfis.find((p) => p.metodo === "corte_cnc" && new RegExp(`\\b${maquina}\\b`, "i").test(p.nome));
    if (!perfil) faltando.add(maquina);
    return perfil?.id ?? null;
  };

  const regras: PerfilEscolhaEspessura["regras"] = [];
  for (const variante of ["padrao", "especial"] as const) {
    /* Em ordem de espessura (Object.entries põe as chaves inteiras, "2", "3"..., antes de "1.5"). */
    for (const espessuraMm of ESPESSURAS_PLANILHA_LASER) {
      const maquina = REGRA_PLANILHA_LASER[variante][espessuraMm];
      const perfilId = maquina ? idDaMaquina(maquina) : null;
      if (perfilId) regras.push({ variante, espessuraMm, perfilId });
    }
  }

  return {
    parametros: {
      metodo: "escolha_espessura",
      variantes: [
        { chave: "padrao", rotulo: "Material padrão" },
        { chave: "especial", rotulo: "Material especial" },
      ],
      espessuras: [...ESPESSURAS_PLANILHA_LASER],
      regras,
    },
    faltando: [...faltando],
  };
}
