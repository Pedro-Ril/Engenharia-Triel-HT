import "./globals.css";
import AppShell from "@/components/AppShell";
import {
  getSetoresComModulosPermitidos,
  getUsuarioAutenticado,
} from "@/lib/auth/autorizacao";
import { resolverEmpresaDoUsuario } from "@/lib/empresas/empresas";
import { buscarTemaUsuario } from "@/lib/preferencias/preferencias";
import { montarCssEmpresa, montarCssTemaPadrao } from "@/lib/tema/paleta-empresa";
import { buscarTemaPadrao } from "@/lib/tema/tema-padrao";

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
  const [setores, tema, empresa, temaPadrao] = await Promise.all([
    getSetoresComModulosPermitidos(usuario),
    usuario ? buscarTemaUsuario(usuario.id) : Promise.resolve("sistema" as const),
    usuario ? resolverEmpresaDoUsuario(usuario) : Promise.resolve(null),
    buscarTemaPadrao(),
  ]);

  /*
   * "sistema" (ou visitante sem login) não define o atributo — o
   * CSS decide via prefers-color-scheme. Só "claro"/"escuro"
   * forçam um lado explicitamente, vencendo a preferência do SO.
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
