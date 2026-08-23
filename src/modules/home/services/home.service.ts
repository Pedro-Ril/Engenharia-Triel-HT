import type { SetorComStatusAcesso } from "@/lib/auth/autorizacao";

/* null = falha ao buscar (rede/servidor) — diferente de "catálogo vazio de verdade" ([]). */
export async function buscarCatalogoModulos(): Promise<SetorComStatusAcesso[] | null> {
  try {
    const response = await fetch("/api/catalogo-modulos");
    const body: { ok: boolean; data?: SetorComStatusAcesso[] } =
      await response.json();

    return body.ok && body.data ? body.data : [];
  } catch {
    return null;
  }
}
