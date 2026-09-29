import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Two projects so the environment is chosen by file extension rather than by a
 * per-file docblock:
 *
 * - `node` runs the `.test.ts` suites (data layer, providers, Server Actions)
 *   in a real Node environment, unchanged.
 * - `dom` runs `.test.tsx` React component suites in jsdom with the Testing
 *   Library matchers and automatic unmounting wired up in `src/test/setup.ts`.
 *
 * Both inherit the `@` path alias from this file via `extends: true`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["src/test/setup.ts"],
        },
      },
    ],
  },
});
