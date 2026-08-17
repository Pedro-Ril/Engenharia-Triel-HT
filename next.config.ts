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
};

export default nextConfig;
