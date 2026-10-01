import { defineConfig } from "vitest/config";
import path from "node:path";

// Los tests usan el mismo alias que la app (`@/lib/...`), para que un test y el código que
// exercise importen literalmente lo mismo.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
