import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Mirror tsconfig's "@/*" -> "src/*" so modules using the alias load under vitest.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
});
