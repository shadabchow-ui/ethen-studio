import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@ethen\/studio-core$/, replacement: `${root}/packages/studio/src/index.ts` },
      { find: /^@ethen\/studio-core\/(.*)$/, replacement: `${root}/packages/studio/src/$1` },
      { find: /^@ethen\/([^/]+)(\/.*)?$/, replacement: `${root}/packages/$1/src$2` },
      { find: "@", replacement: root },
      { find: "server-only", replacement: path.join(root, "scripts/test-shims/server-only.ts") },
    ],
  },
  test: {
    include: ["lib/**/*.test.ts", "__tests__/**/*.test.ts"],
    exclude: ["__tests__/studio-scroll-regression.test.ts"],
  },
});
