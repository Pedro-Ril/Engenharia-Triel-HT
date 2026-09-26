import "server-only";

import { ValidationError } from "@/lib/auth/errors";
import { registrarChamadaExternaSemFalhar } from "@/lib/monitoramento/chamadas-externas";

/*
 * Mesma API de estrutura que o Roteiro de Fabricação já consome
 * (src/modules/cadastro-roteiro/services/cadastroRoteiro.service.ts) --
 * a diferença é que lá a árvore é enriquecida com roteiros do ERP e
 * aqui só interessa o campo "ultimaRevisao" de cada item.
 *
 * URL fixa igual à do módulo irmão, de propósito: são o mesmo serviço, e
 * deixar uma configurável e a outra não só criaria dois lugares pra
 * mudar quando o endereço mudar.
 *
 * Já a empresa (empr_id) NÃO é fixa: vem do cadastro de quem está
 * consultando (portal_usuarios.codigo_empresa).
 */
const API_ESTRUTURA_3DX = "http://proserver.trielht.com.br:1001/api/search/structure";

export interface NoEstrutura3DX {
  physicalId: string;
  codigo: string;
  descricao: string;
  revisao: string;
  tipoint: string;
  status: string;
  responsavel: string;
  nivel: number;
  /* O que este módulo existe pra olhar. Ausente na resposta = desconhecido, tratado como fora da última revisão não é seguro, então vira null. */
  ultimaRevisao: boolean | null;
  instanciaNome: string | null;
  filhos: NoEstrutura3DX[];
}

export interface EstruturaUltimaRevisao {
  codigo: string;
  descricao: string;
  revisao: string;
  totalItens: number;
  totalInstancias: number;
  raiz: NoEstrutura3DX;
}

interface NoBruto {
  physicalId?: string;
  codigo?: string;
  descricao?: string;
  revisao?: string;
  tipoint?: string;
  status?: string;
  responsavel?: string;
  nivel?: number;
  ultimaRevisao?: boolean;
  instancia?: { nome?: string } | null;
  children?: NoBruto[];
}

interface RespostaEstrutura3DX {
  success?: boolean;
  message?: string;
  error?: string;
  item?: { codigo?: string; descricao?: string; revisao?: string };
  data?: {
    totalItens?: number;
    totalInstancias?: number;
    tree?: NoBruto;
  };
}

function texto(valor: unknown): string {
  return String(valor ?? "").trim();
}

function mapearNo(bruto: NoBruto): NoEstrutura3DX {
  return {
    physicalId: texto(bruto.physicalId),
    codigo: texto(bruto.codigo),
    descricao: texto(bruto.descricao),
    revisao: texto(bruto.revisao),
    tipoint: texto(bruto.tipoint),
    status: texto(bruto.status),
    responsavel: texto(bruto.responsavel),
    nivel: typeof bruto.nivel === "number" ? bruto.nivel : 0,
    ultimaRevisao: typeof bruto.ultimaRevisao === "boolean" ? bruto.ultimaRevisao : null,
    instanciaNome: bruto.instancia?.nome ? texto(bruto.instancia.nome) : null,
    filhos: (bruto.children ?? []).map(mapearNo),
  };
}

export async function buscarEstruturaUltimaRevisao(
  codigo: string,
  codigoEmpresa: string
): Promise<EstruturaUltimaRevisao | null> {
  const codigoLimpo = codigo.trim();
  if (!codigoLimpo) {
    throw new ValidationError("Informe o código do item.");
  }

  const empresa = codigoEmpresa.trim();
  if (!empresa) {
    throw new ValidationError("Informe a empresa da consulta.");
  }

  const inicio = performance.now();
  let sucesso = false;
  let mensagemErro: string | null = null;

  try {
    const url = new URL(`${API_ESTRUTURA_3DX}/${encodeURIComponent(codigoLimpo)}`);
    url.searchParams.set("empr_id", empresa);

    const resposta = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const json: RespostaEstrutura3DX | null = await resposta.json().catch(() => null);

    if (!resposta.ok || !json?.success) {
      /* Código inexistente não é falha de integração -- é resposta válida "não achei". */
      if (resposta.status === 404) {
        sucesso = true;
        return null;
      }
      throw new Error(
        json?.message || json?.error || `O serviço de estrutura respondeu com erro (${resposta.status}).`
      );
    }

    sucesso = true;

    const raiz = json.data?.tree;
    if (!raiz) return null;

    return {
      codigo: texto(json.item?.codigo) || codigoLimpo,
      descricao: texto(json.item?.descricao),
      revisao: texto(json.item?.revisao),
      totalItens: json.data?.totalItens ?? 0,
      totalInstancias: json.data?.totalInstancias ?? 0,
      raiz: mapearNo(raiz),
    };
  } catch (error) {
    mensagemErro = error instanceof Error ? error.message : "Erro desconhecido.";
    throw error;
  } finally {
    await registrarChamadaExternaSemFalhar({
      servico: "erp_3dx_estrutura",
      origem: "uso_real",
      sucesso,
      duracaoMs: performance.now() - inicio,
      mensagemErro,
    });
  }
}
