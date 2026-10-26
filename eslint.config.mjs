import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**", "public/vendor/foliate-js/**", "**/*.d.ts", "**/*.d.mts", "next-env.d.ts"]),
]);
