/*
 * Agendadores do Portal (gravam no banco, mandam e-mail, liberam desenhos
 * no 3DX) rodam só no Portal de produção -- ver src/instrumentation.ts.
 *
 * O `next dev` usa o MESMO banco: com eles ligados lá, as duas instâncias
 * disputavam os mesmos fluxos. Em 17 e 19/11/2026 a do PC de
 * desenvolvimento pegou liberações agendadas sem a senha (que só a
 * produção tinha) e mandou "nada foi liberado" enquanto a produção
 * liberava. AGENDADORES_ATIVOS=1 liga no dev (teste consciente);
 * AGENDADORES_ATIVOS=0 desliga num `next start` que não seja a produção.
 */
export function agendadoresLigados(env: Record<string, string | undefined> = process.env): boolean {
  if (env.AGENDADORES_ATIVOS === "1") return true;
  if (env.AGENDADORES_ATIVOS === "0") return false;
  return env.NODE_ENV === "production";
}
