import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /*
     * Pastas com o código ORIGINAL de ferramentas standalone trazidas
     * pra dentro do portal (Lantek, Semáforo, Conversor TXT RH) —
     * ficam só como referência durante a migração, nunca fazem parte
     * do app em si. Já excluídas do tsconfig.json; faltava aqui.
     */
    "Integra-o-FoccoERP-x-Lantek-via-XLS/**",
    "Semaforo_Balaca/**",
    "Conversor_TXT_RH/**",
  ]),
]);

export default eslintConfig;
