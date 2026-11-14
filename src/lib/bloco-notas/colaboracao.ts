import "server-only";

import { SignJWT } from "jose";

/*
 * Passe para o serviço de edição ao vivo (colaboracao/server.mjs).
 *
 * O portal confere quem pode abrir a página (dono / compartilhada) e emite
 * um JWT curto só para aquela página; o serviço só verifica a assinatura,
 * sem tocar em sessão. Mesma chave da sessão (AUTH_SESSION_SECRET, já no
 * .env do servidor), mas com audience própria: o passe não vale como
 * sessão (o sub é o id, não o login) e a sessão não vale como passe (não
 * tem audience).
 */

export const AUDIENCIA_COLABORACAO = "bloco-notas-colaboracao";
export const PORTA_COLABORACAO_PADRAO = 3012;

export function portaColaboracao(): number {
  return Number(process.env.NOTAS_COLAB_PORT) || PORTA_COLABORACAO_PADRAO;
}

/* Cor estável por pessoa (cursor e etiqueta de quem está editando). */
const CORES_CURSOR = ["#dc2626", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#65a30d"];

export function corDaPessoa(usuarioId: string): string {
  let soma = 0;
  for (const caractere of usuarioId) soma = (soma * 31 + caractere.charCodeAt(0)) >>> 0;
  return CORES_CURSOR[soma % CORES_CURSOR.length];
}

export async function emitirPasseColaboracao(params: {
  usuarioId: string;
  paginaId: string;
  podeEditar: boolean;
}): Promise<string> {
  const segredo = process.env.AUTH_SESSION_SECRET;
  if (!segredo) throw new Error("A variável de ambiente AUTH_SESSION_SECRET não foi configurada.");

  return new SignJWT({ pagina: params.paginaId.toLowerCase(), editar: params.podeEditar })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.usuarioId)
    .setAudience(AUDIENCIA_COLABORACAO)
    .setIssuedAt()
    /* Só para conectar; a cada reconexão o navegador pede um novo. */
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(segredo));
}

const AUDIENCIA_REVALIDAR = "bloco-notas-colaboracao-revalidar";

/*
 * Avisa o serviço de edição ao vivo que o acesso a estas páginas mudou
 * (alguém perdeu o acesso ou passou a só ver; página movida/excluída):
 * ele derruba as conexões delas e os navegadores reconectam com um passe
 * novo, já com a regra nova. Nunca falha a operação de quem chamou -- se
 * o serviço estiver fora, não há conexão ao vivo para derrubar mesmo.
 */
export async function derrubarConexoesAoVivo(paginaIds: string[]): Promise<void> {
  if (paginaIds.length === 0) return;
  const segredo = process.env.AUTH_SESSION_SECRET;
  if (!segredo) return;

  try {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(AUDIENCIA_REVALIDAR)
      .setIssuedAt()
      .setExpirationTime("1m")
      .sign(new TextEncoder().encode(segredo));

    await fetch(`http://127.0.0.1:${portaColaboracao()}/revalidar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paginas: paginaIds }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (error) {
    console.error("Não foi possível avisar o serviço de edição ao vivo do Bloco de Notas:", error);
  }
}
