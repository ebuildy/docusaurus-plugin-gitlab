// Flat ESLint config, modelled on Docusaurus's own setup
// (https://github.com/facebook/docusaurus/blob/main/eslint.config.ts):
// typescript-eslint + react + react-hooks + jsx-a11y + import + regexp + vitest,
// with eslint-config-prettier last to disable formatting rules.
import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import regexp from "eslint-plugin-regexp";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "examples/**",
      "coverage/**",
      ".agents/**",
      ".claude/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  regexp.configs["flat/recommended"],
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    settings: {
      react: { version: "18" },
      // TypeScript resolves modules (incl. the `.js` ESM extensions that point at
      // `.ts` sources, and `@theme/*` aliases), so disable the import resolver here.
      "import/resolver": { node: { extensions: [".js", ".jsx", ".ts", ".tsx"] } },
    },
    rules: {
      // The remark/AST and gitbeaker layers intentionally use `any` for loosely
      // typed third-party shapes; we normalize into domain types downstream.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // TypeScript already checks module resolution; the import plugin's resolver
      // does not understand `.js`→`.ts` rewrites or theme aliases.
      "import/no-unresolved": "off",
      "import/named": "off",
      "import/order": ["warn", { "newlines-between": "never", alphabetize: { order: "asc" } }],
    },
  },
  // React components (TSX)
  {
    files: ["src/components/**/*.{ts,tsx}"],
    ...react.configs.flat.recommended,
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // The new JSX transform doesn't require React in scope.
      "react/react-in-jsx-scope": "off",
    },
    settings: { react: { version: "18" } },
  },
  // Tests
  {
    files: ["**/*.test.{ts,tsx}", "test/**/*.{ts,tsx}"],
    plugins: { vitest },
    rules: { ...vitest.configs.recommended.rules },
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
