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
  },
});
