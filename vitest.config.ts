import path from "node:path";

import { defineConfig } from "vitest/config";

/*
 * Testes unitários (npm test). Só lógica pura e regras com o banco e a
 * rede trocados por mocks -- nada aqui conecta no SQL Server nem no ERP.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /* Os de integração usam o banco real: só com npm run test:integracao. */
    exclude: ["src/**/*.integracao.test.ts", "node_modules/**"],
    /*
     * sanitize-html é CommonJS e faz require() do htmlparser2 12, que é
     * só ESM -- o Node 20 < 20.19 não aceita isso. No Next não importa
     * (o Turbopack empacota os dois); aqui o esbuild pré-empacota igual.
     */
    deps: {
      optimizer: {
        ssr: { enabled: true, include: ["sanitize-html"] },
      },
    },
  },
});
