/**
 * Copies `static/` into the Worker's asset directory after the esbuild client bundle.
 *
 * `dist/client` is entirely generated, so a file that is not emitted by esbuild has to be placed
 * there explicitly. Currently one file: the Apple touch icon a guest's iPhone reads when the
 * invitation is saved to the Home Screen. It cannot be a `data:` URI — iOS ignores those for
 * `apple-touch-icon` — so it has to exist as a real asset on this origin.
 */
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const viewerRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(viewerRoot, "dist", "client");

await mkdir(destination, { recursive: true });
await cp(join(viewerRoot, "static"), destination, { recursive: true });
