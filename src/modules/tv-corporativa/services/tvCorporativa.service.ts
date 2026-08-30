import type {
  ConfigTv,
  GradeComSlots,
  GradeTv,
  MidiaTv,
  PastaMidia,
  SlotTv,
  TerminalTv,
} from "../types/tvCorporativa.types";

export interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function parseResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json();
}

/* Terminais */

export async function listarTerminais(): Promise<TerminalTv[]> {
  try {
    const response = await fetch("/api/admin/tv/terminais");
    const body = await parseResponse<TerminalTv[]>(response);
    return body.ok && body.data ? body.data : [];
  } catch {
    return [];
  }
}

export async function parearTerminal(
  codigo: string,
  nome: string
): Promise<ApiEnvelope<{ terminal: TerminalTv; tokenParaExibir: string }>> {
  const response = await fetch("/api/admin/tv/terminais/parear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo, nome }),
  });
  return parseResponse(response);
}

export async function atualizarTerminal(
  id: string,
  dados: {
    nome?: string;
    intervaloAtualizacaoSegundos?: number;
    gradeId?: string | null;
    caminhoInicial?: string | null;
  }
): Promise<ApiEnvelope<TerminalTv>> {
  const response = await fetch(`/api/admin/tv/terminais/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function revogarTerminal(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/tv/terminais/${id}/revogar`, {
    method: "POST",
  });
  return parseResponse(response);
}

export async function enviarComandoAgente(
  id: string,
  comando: "reiniciar_maquina" | "atualizar_agente"
): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/tv/terminais/${id}/comando`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comando }),
  });
  return parseResponse(response);
}

export async function excluirTerminal(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/admin/tv/terminais/${id}`, { method: "DELETE" });
  return parseResponse(response);
}

export async function visualizarTerminal(
  id: string
): Promise<ApiEnvelope<{ signalingUrl: string; token: string }>> {
  const response = await fetch(`/api/admin/tv/terminais/${id}/visualizar`, { method: "POST" });
  return parseResponse(response);
}

/* Grades */

export async function listarGrades(): Promise<GradeTv[]> {
  try {
    const response = await fetch("/api/tv-corporativa/grades");
    const body = await parseResponse<GradeTv[]>(response);
    return body.ok && body.data ? body.data : [];
  } catch {
    return [];
  }
}

export async function buscarGrade(id: string): Promise<GradeComSlots | null> {
  try {
    const response = await fetch(`/api/tv-corporativa/grades/${id}`);
    const body = await parseResponse<GradeComSlots>(response);
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

export async function criarGrade(nome: string): Promise<ApiEnvelope<GradeTv>> {
  const response = await fetch("/api/tv-corporativa/grades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome }),
  });
  return parseResponse(response);
}

export async function atualizarGrade(
  id: string,
  dados: { nome: string; ativa: boolean }
): Promise<ApiEnvelope<GradeTv>> {
  const response = await fetch(`/api/tv-corporativa/grades/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  return parseResponse(response);
}

export async function excluirGrade(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/tv-corporativa/grades/${id}`, { method: "DELETE" });
  return parseResponse(response);
}

export async function salvarSlotsDaGrade(
  gradeId: string,
  slots: SlotTv[]
): Promise<ApiEnvelope<GradeComSlots>> {
  const response = await fetch(`/api/tv-corporativa/grades/${gradeId}/slots`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slots }),
  });
  return parseResponse(response);
}

/* Mídias */

export async function listarMidias(): Promise<MidiaTv[]> {
  try {
    const response = await fetch("/api/tv-corporativa/midias");
    const body = await parseResponse<MidiaTv[]>(response);
    return body.ok && body.data ? body.data : [];
  } catch {
    return [];
  }
}

export async function enviarMidia(
  arquivo: File,
  tipo: MidiaTv["tipo"],
  pastaId: string | null
): Promise<ApiEnvelope<MidiaTv>> {
  const formData = new FormData();
  formData.append("arquivo", arquivo);
  formData.append("tipo", tipo);
  if (pastaId) formData.append("pastaId", pastaId);

  const response = await fetch("/api/tv-corporativa/midias", {
    method: "POST",
    body: formData,
  });
  return parseResponse(response);
}

export async function moverMidiaParaPasta(
  id: string,
  pastaId: string | null
): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/tv-corporativa/midias/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pastaId }),
  });
  return parseResponse(response);
}

export async function excluirMidia(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/tv-corporativa/midias/${id}`, { method: "DELETE" });
  return parseResponse(response);
}

/* Pastas de mídia */

export async function listarPastasMidia(): Promise<PastaMidia[]> {
  try {
    const response = await fetch("/api/tv-corporativa/midias/pastas");
    const body = await parseResponse<PastaMidia[]>(response);
    return body.ok && body.data ? body.data : [];
  } catch {
    return [];
  }
}

export async function criarPastaMidia(nome: string): Promise<ApiEnvelope<PastaMidia>> {
  const response = await fetch("/api/tv-corporativa/midias/pastas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome }),
  });
  return parseResponse(response);
}

export async function excluirPastaMidia(id: string): Promise<ApiEnvelope<null>> {
  const response = await fetch(`/api/tv-corporativa/midias/pastas/${id}`, { method: "DELETE" });
  return parseResponse(response);
}

/* Configurações */

export async function buscarConfigTv(): Promise<ConfigTv | null> {
  try {
    const response = await fetch("/api/admin/tv/config");
    const body = await parseResponse<ConfigTv>(response);
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

export async function salvarConfigTv(
  diretorioMidias: string,
  signalingUrl: string | null,
  urlAgente: string | null
): Promise<ApiEnvelope<ConfigTv>> {
  const response = await fetch("/api/admin/tv/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ diretorioMidias, signalingUrl, urlAgente }),
  });
  return parseResponse(response);
}

export async function statusSignaling(): Promise<ApiEnvelope<{ online: boolean }>> {
  const response = await fetch("/api/admin/tv/signaling/status");
  return parseResponse(response);
}

export async function iniciarSignaling(): Promise<ApiEnvelope<{ online: boolean }>> {
  const response = await fetch("/api/admin/tv/signaling/iniciar", { method: "POST" });
  return parseResponse(response);
}
