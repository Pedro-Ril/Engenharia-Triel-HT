import "./globals.css";
import AppShell from "@/components/AppShell";
import {
  getSetoresComModulosPermitidos,
  getUsuarioAutenticado,
} from "@/lib/auth/autorizacao";
import { buscarTemaUsuario } from "@/lib/preferencias/preferencias";

export const metadata = {
  title: "Portal Triel-HT",
  description: "Portal interno Triel-HT",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const usuario = await getUsuarioAutenticado();
  const [setores, tema] = await Promise.all([
    getSetoresComModulosPermitidos(usuario),
    usuario ? buscarTemaUsuario(usuario.id) : Promise.resolve("sistema" as const),
  ]);

  /*
   * "sistema" (ou visitante sem login) não define o atributo — o
   * CSS decide via prefers-color-scheme. Só "claro"/"escuro"
   * forçam um lado explicitamente, vencendo a preferência do SO.
   */
  const dataTheme = tema === "claro" ? "light" : tema === "escuro" ? "dark" : undefined;

  return (
    <html lang="pt-BR" data-theme={dataTheme}>
      <body>
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
