import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "contract/generated/openapi.json",
  output: {
    path: "frontend/src/api",
    clean: true,
  },
  plugins: ["@hey-api/client-fetch", "@hey-api/typescript", "@hey-api/sdk"],
});
