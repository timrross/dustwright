// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/test-results/**",
      "packages/core/src/generated/**",
      "packages/cli/assets/**",
      // Copied into the site at build time (apps/site/scripts/sync-public.mjs).
      "apps/site/public/redstone-viewer.js",
      "playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]",
          message: "Design data must never reach HTML sinks. Use textContent or DOM nodes.",
        },
        {
          selector:
            "MemberExpression[computed=true][property.value=/^(innerHTML|outerHTML|insertAdjacentHTML)$/]",
          message: "Design data must never reach HTML sinks. Use textContent or DOM nodes.",
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: "insertAdjacentHTML is banned.",
        },
        {
          selector: "CallExpression[callee.property.name='write'][callee.object.name='document']",
          message: "document.write is banned.",
        },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  prettier,
);
