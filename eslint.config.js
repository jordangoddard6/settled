// ESLint 10 flat config. Type-aware TypeScript rules + React Hooks rules; Prettier owns formatting.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "docs", "playwright-report", "test-results"]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Allow intentionally unused values when prefixed with "_" (e.g. stripping fields).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // React event handlers may be async (they handle their own errors); still check everything else.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
    },
  },

  // React client
  {
    files: ["src/client/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat["recommended-latest"], reactRefresh.configs.vite],
  },

  // Node: server, tests, tooling
  {
    files: ["src/server/**/*.ts", "test/**/*.ts", "e2e/**/*.ts", "*.config.{ts,js}"],
    languageOptions: { globals: globals.node },
  },

  // Tests: asymmetric matchers like expect.stringMatching() are typed `any`.
  {
    files: ["test/**/*.ts", "e2e/**/*.ts"],
    rules: { "@typescript-eslint/no-unsafe-assignment": "off" },
  },

  // Plain JS files (this config) aren't part of the TypeScript project.
  { files: ["**/*.{js,mjs}"], extends: [tseslint.configs.disableTypeChecked] },

  // Must be last: turns off rules that would fight Prettier.
  prettier,
]);
