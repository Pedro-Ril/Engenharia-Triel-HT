import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  /*
   * O mssql/tedious quebra quando o Turbopack tenta
   * empacotá-lo (erro "parameter.type.validate is not a
   * function" ao usar sql.NVarChar/sql.UniqueIdentifier etc.
   * em runtime). Isso instrui o Next a carregar o pacote via
   * require() nativo do Node em vez de empacotar.
   */
  serverExternalPackages: ["mssql", "tedious"],

  experimental: {
    /*
     * Por padrão o Next trunca em 10 MB qualquer corpo de
     * requisição que passe pelo `proxy.ts` (todo request não
     * estático passa por ele — ver comentário lá) — descoberto
     * ao testar o upload de Transferência de Arquivos, que
     * precisa aceitar arquivos bem maiores que isso. Isto NÃO é
     * o limite real de tamanho (esse é só o espaço em disco da
     * pasta configurada); é só o teto que o próprio Next impõe
     * antes de deixar o corpo passar pro Route Handler.
     */
    proxyClientMaxBodySize: "20gb",
  },
};

export default nextConfig;
