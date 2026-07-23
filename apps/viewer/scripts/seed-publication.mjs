import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parsePublicationAlias,
  parsePublicationArtifact,
  publicationAliasKey,
  publicationArtifactKey,
  publicationSha256Hex,
} from "@invitica/invitation-schema";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bucketName = "invitica-storage";
const persistenceDirectory = resolve(appRoot, ".wrangler/state");
const require = createRequire(import.meta.url);
const wranglerBinary = resolve(
  dirname(require.resolve("wrangler/package.json")),
  "bin/wrangler.js",
);
const wranglerConfig = resolve(appRoot, "wrangler.jsonc");
const publicIdentifierPattern = /^[0-9a-f]{32}$/;
const invitationPathPattern = /-([0-9a-f]{32})$/;

function parsePublicIdentifier(input) {
  if (publicIdentifierPattern.test(input)) return input;

  try {
    const match = new URL(input).pathname.match(invitationPathPattern);
    if (match) return match[1];
  } catch {
    // The shared validation error below is intentionally free of the supplied link.
  }

  throw new Error("Provide a 32-character invitation identifier or a valid invitation URL.");
}

function runWrangler(args, input) {
  const result = spawnSync(
    process.execPath,
    [wranglerBinary, ...args, "--config", wranglerConfig],
    {
      cwd: appRoot,
      encoding: "utf8",
      env: { ...process.env, WRANGLER_LOG: "error" },
      input,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Wrangler could not copy the publication.");
  }

  return result.stdout;
}

function getRemoteObject(key) {
  return runWrangler(["r2", "object", "get", `${bucketName}/${key}`, "--remote", "--pipe"]);
}

function putLocalObject(key, body) {
  runWrangler(
    [
      "r2",
      "object",
      "put",
      `${bucketName}/${key}`,
      "--local",
      "--persist-to",
      persistenceDirectory,
      "--pipe",
    ],
    body,
  );
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    throw new Error("Usage: pnpm --filter @invitica/viewer seed -- <invitation URL>");
  }

  const publicIdentifier = parsePublicIdentifier(input);
  const aliasKey = publicationAliasKey(publicIdentifier);
  const aliasBody = getRemoteObject(aliasKey);
  const alias = parsePublicationAlias(JSON.parse(aliasBody));
  const expectedArtifactKey = publicationArtifactKey(alias.publicationId);

  if (alias.artifactKey !== expectedArtifactKey) {
    throw new Error("The remote publication alias does not reference its expected artifact.");
  }

  const artifactBody = getRemoteObject(alias.artifactKey);
  const artifact = parsePublicationArtifact(JSON.parse(artifactBody));
  const artifactSha256 = await publicationSha256Hex(artifactBody);

  if (artifact.publicationId !== alias.publicationId || artifactSha256 !== alias.artifactSha256) {
    throw new Error("The remote publication artifact failed integrity verification.");
  }

  putLocalObject(alias.artifactKey, artifactBody);
  putLocalObject(aliasKey, aliasBody);
  console.log("Seeded one verified publication into the local Viewer store.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "The publication could not be seeded.");
  process.exitCode = 1;
});
