import { spawnSync } from "node:child_process";

/**
 * Deploys the Viewer with the MapTiler key supplied at deploy time.
 *
 * `wrangler.jsonc` must declare `MAPTILER_KEY` so `wrangler types --check` is reproducible without
 * the git-ignored `.dev.vars`, but that declaration is deployed configuration: its empty value
 * overwrites whatever the Worker had. So a bare `wrangler deploy` silently blanks every guest
 * venue map, and a key entered in the Cloudflare dashboard never survives one.
 *
 * The failure is invisible from the creator's side — published pages still render, just with the
 * directions link and no map — so this refuses to deploy rather than let it happen, the same way
 * `apps/web/next.config.ts` refuses a production build without `INVITICA_VIEWER_ORIGIN`.
 *
 * Usage (PowerShell, which is this project's primary shell):
 *   $env:MAPTILER_KEY = "<key>"; pnpm --filter @invitica/viewer deploy
 *
 * Usage (bash):
 *   MAPTILER_KEY=<key> pnpm --filter @invitica/viewer deploy
 *
 * Add `-- --env production` to target the production environment, or
 * `-- --allow-no-map` to deploy deliberately without a venue map.
 */
const forwarded = process.argv.slice(2);
const allowNoMap = forwarded.includes("--allow-no-map");
const key = process.env.MAPTILER_KEY?.trim();

if (!key && !allowNoMap) {
  console.error(
    [
      "MAPTILER_KEY is not set, so this deploy would blank every guest venue map.",
      "",
      "The key is browser-exposed by design and protected by the origin restriction in the",
      "MapTiler dashboard rather than by secrecy — but it must never be committed. Supply it",
      "for the deploy only.",
      "",
      "  PowerShell:  $env:MAPTILER_KEY = \"<key>\"; pnpm --filter @invitica/viewer deploy",
      "  bash:        MAPTILER_KEY=<key> pnpm --filter @invitica/viewer deploy",
      "",
      "Those allowed origins must cover the creator app as well as the guest lane, because the",
      "creator's venue place-search calls the same key from the browser.",
      "",
      "To deploy deliberately without a map, pass --allow-no-map.",
    ].join("\n"),
  );
  process.exit(1);
}

const passthrough = forwarded.filter((argument) => argument !== "--allow-no-map");
const args = ["wrangler", "deploy", ...passthrough];

// Matches the `build` script: the empty environment is the deployed `invitica-viewer`, and stating
// it keeps wrangler from prompting when `env.production` also exists.
if (!passthrough.some((argument) => argument.startsWith("--env"))) args.push('--env=""');
if (key) args.push("--var", `MAPTILER_KEY:${key}`);
else console.warn("Deploying without MAPTILER_KEY: guest invitations will show no venue map.");

const result = spawnSync("npx", args, { shell: true, stdio: "inherit" });
process.exit(result.status ?? 1);
