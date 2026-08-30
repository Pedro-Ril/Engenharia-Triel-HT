import { TvPlayer } from "@/modules/tv-corporativa/components/TvPlayer";

/*
 * Página pública (ver src/lib/auth/rotas-publicas.ts) — o terminal
 * nunca faz login, se autentica só com o token de dispositivo (ver
 * src/lib/tv/terminal-token.ts). Sem Server Component fazendo
 * consulta nenhuma aqui: todo o ciclo de pareamento/programação é
 * client-side, autenticado por token, não por sessão de usuário.
 */
export default function TvPage() {
  return <TvPlayer />;
}
