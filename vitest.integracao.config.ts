import path from "node:path";

import { defineConfig } from "vitest/config";

/*
 * Testes de integração (npm run test:integracao): usam o SQL Server de
 * verdade, com as credenciais do .env. Cada teste roda dentro de uma
 * transação desfeita no fim -- nada fica gravado.
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
    include: ["src/**/*.integracao.test.ts"],
    setupFiles: ["tests/carregar-env.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    /* Um arquivo por vez: cada um abre a própria transação no mesmo banco. */
    fileParallelism: false,
  },
});
