import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so the build works from any subfolder
  // (it is served at /copilot/ on the combined site).
  base: "./",
  test: {
    globals: true
  }
});
