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
    // Server de pruebas de los humos (mismo distDir alternativo, ver next.config.ts):
    // si no, ESLint lintea el bundle compilado y tira cientos de errores ajenos.
    ".next-smoke/**",
  ]),
]);

export default eslintConfig;
