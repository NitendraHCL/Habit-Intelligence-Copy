import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Recharts/ECharts prop spreading requires `as any` at component
      // boundaries — unavoidable in a data-viz codebase. Downgrade to warn
      // so the build isn't blocked but devs still see the hint.
      "@typescript-eslint/no-explicit-any": "warn",
      // Unused vars: prefix with _ to acknowledge intentional ignoring.
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // setState-in-effect: many legitimate patterns (sync from prop, etc.)
      "react-hooks/set-state-in-effect": "warn",
      // @ts-nocheck used on a few legacy files during migration — allow
      // as warning until those files are properly typed.
      "@typescript-eslint/ban-ts-comment": "warn",
      // React compiler memoization hints — downgrade; not all patterns
      // are optimizable and that's OK.
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;
