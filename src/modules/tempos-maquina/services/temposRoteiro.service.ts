import type { ResultadoGeometriaDxf } from "@/lib/tempos-maquina/dxf-geometria";
import type { DadosPeca, ResultadoTempo } from "@/lib/tempos-maquina/tipos";

import type { ConfigTemposRoteiro } from "../types/temposMaquina.types";

/* Cálculo automático de tempo dentro do Roteiro de Fabricação (rotas /api/cadastro-roteiro/tempos/**). */

interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function chamar<T>(url: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init });
    return await response.json().catch(() => ({ ok: false, message: `Erro ${response.status} no servidor.` }));
  } catch {
    return { ok: false, message: "Sem conexão com o Portal." };
  }
}

export const buscarConfigTempos = () => chamar<ConfigTemposRoteiro>("/api/cadastro-roteiro/tempos");

export type DxfDoItem = { arquivo: string; caminho: string; leitura: ResultadoGeometriaDxf } | null;

export const buscarDxfDoItem = (codigo: string) => chamar<DxfDoItem>(`/api/cadastro-roteiro/tempos/dxf/${encodeURIComponent(codigo)}`);

export const registrarCalculoTempo = (dados: {
  codItem: string;
  revisao: string | null;
  alternativo: number | null;
  seq: number | null;
  codRecurso: string;
  origemGeometria: "dxf" | "manual";
  arquivoDxf: string | null;
  dados: DadosPeca;
  materiaPrima: string | null;
  material: string | null;
  peso3dx: string | null;
}) =>
  chamar<{ id: string; perfilNome: string; resultado: ResultadoTempo }>("/api/cadastro-roteiro/tempos/calculos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
