import "./globals.css";
import AppShell from "@/components/AppShell";
import {
  getSetoresComModulosPermitidos,
  getUsuarioAutenticado,
} from "@/lib/auth/autorizacao";

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
  const setores = await getSetoresComModulosPermitidos(usuario);

  return (
    <html lang="pt-BR">
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
