import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Engenharia - Triel HT",
  description: "Portal interno da Engenharia Triel-HT",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}