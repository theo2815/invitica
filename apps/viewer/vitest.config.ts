import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const reactCjsDirectory = fileURLToPath(new URL("./node_modules/react/cjs/", import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ["react", "react/jsx-runtime", "react-dom/server.edge"],
        },
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: `${reactCjsDirectory}react-jsx-dev-runtime.development.js`,
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: `${reactCjsDirectory}react-jsx-runtime.production.js`,
      },
      {
        find: /^react$/,
        replacement: `${reactCjsDirectory}react.production.js`,
      },
    ],
  },
  ssr: {
    noExternal: ["react", "react-dom"],
  },
});
