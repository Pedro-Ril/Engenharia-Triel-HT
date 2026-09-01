import { cookies } from "next/headers";

import "./globals.css";
import AppShell from "@/components/AppShell";
import {
  getSetoresComModulosPermitidos,
  getUsuarioAutenticado,
} from "@/lib/auth/autorizacao";
import { resolverEmpresaDoUsuario } from "@/lib/empresas/empresas";
import { buscarTemaUsuario } from "@/lib/preferencias/preferencias";
import { COOKIE_TEMA } from "@/lib/tema/aplicar-tema";
import { montarCssEmpresa, montarCssTemaPadrao } from "@/lib/tema/paleta-empresa";
import { buscarTemaPadrao } from "@/lib/tema/tema-padrao";
import type { TemaPreferencia } from "@/modules/minha-conta/types/minhaConta.types";

const TEMAS_VALIDOS: TemaPreferencia[] = ["claro", "escuro", "sistema"];

export const metadata = {
  title: "Portal Grupo Triel-HT",
  description: "Portal interno Grupo Triel-HT",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const usuario = await getUsuarioAutenticado();

  /*
   * Sem sessão válida (visitante nunca logado, OU alguém cujo login
   * expirou), a preferência de tema não vem mais do banco — cai pro
   * cookie gravado pelo cliente a cada troca de tema (ver
   * persistirTemaEmCookie em aplicar-tema.ts), que sobrevive
   * independente de login. Só quando esse cookie também não existe
   * (primeira visita de verdade) o padrão vira "claro" — sem seguir o
   * sistema operacional, que é o pedido explícito pra quem ainda não
   * escolheu nada.
   */
  const cookieStore = await cookies();
  const temaCookie = cookieStore.get(COOKIE_TEMA)?.value;
  const temaAnonimo: TemaPreferencia =
    temaCookie && TEMAS_VALIDOS.includes(temaCookie as TemaPreferencia)
      ? (temaCookie as TemaPreferencia)
      : "claro";

  const [setores, tema, empresa, temaPadrao] = await Promise.all([
    getSetoresComModulosPermitidos(usuario),
    usuario ? buscarTemaUsuario(usuario.id) : Promise.resolve(temaAnonimo),
    usuario ? resolverEmpresaDoUsuario(usuario) : Promise.resolve(null),
    buscarTemaPadrao(),
  ]);

  /*
   * "sistema" não define o atributo — o CSS decide via
   * prefers-color-scheme. Só "claro"/"escuro" forçam um lado
   * explicitamente, vencendo a preferência do SO. Visitante sem
   * sessão só cai em "sistema" se tiver escolhido isso explicitamente
   * antes (cookie) — nunca por padrão.
   */
  const dataTheme = tema === "claro" ? "light" : tema === "escuro" ? "dark" : undefined;

  /*
   * Tema padrão personalizado só se aplica quando ninguém venceu por
   * empresa — a empresa do usuário sempre tem prioridade sobre o
   * padrão do portal.
   */
  const usarTemaPadraoCustom = !empresa && temaPadrao !== null;

  return (
    <html
      lang="pt-BR"
      data-theme={dataTheme}
      data-empresa={empresa?.id}
      data-tema-padrao={usarTemaPadraoCustom ? "custom" : undefined}
    >
      <body>
        {empresa && (
          <style>{montarCssEmpresa(empresa.id, empresa.corPrimariaClara, empresa.corPrimariaEscura)}</style>
        )}
        {usarTemaPadraoCustom && temaPadrao && (
          <style>{montarCssTemaPadrao(temaPadrao.corPrimariaClara, temaPadrao.corPrimariaEscura)}</style>
        )}
        <AppShell
          setores={setores}
          usuario={
            usuario
              ? {
                  nomeExibicao: usuario.nomeExibicao,
                  ehAdministrador: usuario.ehAdministrador,
                }
              : null
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
