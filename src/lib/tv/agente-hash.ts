import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

/*
 * Hash SHA-256 do script do agente nativo servido hoje
 * (GET /api/tv/agente/download) — usado tanto pra decidir se um
 * agente já pareado precisa se auto-atualizar (GET /api/tv/agente/config)
 * quanto pra mostrar "atualizado"/"desatualizado" na tela de
 * Dispositivos, comparando contra o que cada agente reportou da
 * última vez que consultou.
 */
export async function calcularHashAgente(): Promise<string> {
  const caminho = path.join(process.cwd(), "tv-agente", "agente.mjs");
  const conteudo = await readFile(caminho, "utf8");
  return createHash("sha256").update(conteudo).digest("hex");
}
