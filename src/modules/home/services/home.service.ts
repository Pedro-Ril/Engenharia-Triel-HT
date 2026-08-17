import type { SetorComStatusAcesso } from "@/lib/auth/autorizacao";

export async function buscarCatalogoModulos(): Promise<SetorComStatusAcesso[]> {
  const response = await fetch("/api/catalogo-modulos");
  const body: { ok: boolean; data?: SetorComStatusAcesso[] } =
    await response.json();

  return body.ok && body.data ? body.data : [];
}
