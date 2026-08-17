import type { LoginResponse, UsuarioSessao } from "../types/auth.types";

export async function login(
  usuario: string,
  senha: string
): Promise<LoginResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, senha }),
  });

  return response.json();
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function buscarUsuarioAtual(): Promise<UsuarioSessao | null> {
  const response = await fetch("/api/auth/me");
  const body: { ok: boolean; data: UsuarioSessao | null } =
    await response.json();

  return body.ok ? body.data : null;
}
