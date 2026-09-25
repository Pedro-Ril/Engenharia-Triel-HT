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
   *
   * O onvif quebra pelo mesmo motivo, mas na hora do build:
   * "Module not found: Can't resolve 'onvif/promises'" -- é um
   * subpath sem package.json próprio (resolve por index.js de
   * diretório), e o Turbopack não segue essa resolução clássica
   * do Node ao empacotar para produção.
   *
   * node-firebird (driver do banco de RH, módulo Aprovações) entra
   * preventivamente pelo mesmo motivo do mssql/tedious -- é outro
   * driver que fala o protocolo do banco na mão (parsing de buffer
   * bruto), mesmo perfil de risco sob o Turbopack.
   */
  serverExternalPackages: ["mssql", "tedious", "onvif", "node-firebird"],

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
