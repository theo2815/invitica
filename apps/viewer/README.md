# Invitica Viewer

The Viewer is the independently deployable Cloudflare Worker that serves immutable published
invitations, publication media, social-preview cards, and the client bundle. The creator preview and
guest page share the renderer contract, but the Viewer remains a separate edge deployment.

`wrangler.jsonc` binds the private `invitica-storage` R2 bucket and sets the canonical public origin.
The MapTiler key is injected when HTML is served; it is intentionally browser-visible and must be
restricted by allowed origin in MapTiler rather than treated as a secret.

## Local development

From the repository root:

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item apps/viewer/.dev.vars.example apps/viewer/.dev.vars
pnpm dev:all
```

Put the domain-restricted development MapTiler key in the ignored `.dev.vars`. Published test data
can be copied from remote R2 into Wrangler's ignored local store with the root README's `seed`
workflow; that command does not deploy or mutate remote R2.

Focused checks:

```powershell
pnpm --filter @invitica/viewer typecheck
pnpm --filter @invitica/viewer test
pnpm --filter @invitica/viewer build
```

## Manual production deployment

Production currently uses the default Worker declared by `name: "invitica-viewer"`. Deploy the
default target unless Cloudflare routing has first been deliberately moved to another Wrangler
environment. `--env production` creates or updates `invitica-viewer-production`; it does not update
the default Worker that `invitica.app/i/*` is expected to reach.

### 1. Prepare the reviewed release

Deploy only the intended clean `main` revision after its required CI checks pass:

First inspect the working tree and current branch:

```powershell
git status --short
git branch --show-current
```

Stop if the working tree is not clean. Then switch to and fast-forward the production branch before
installing or checking anything:

```powershell
git switch main
git pull --ff-only origin main
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

Stop if `main` cannot fast-forward or the repository gate fails. Do not deploy a local development
branch as an undocumented production release.

### 2. Authenticate Wrangler

```powershell
pnpm --filter @invitica/viewer exec wrangler whoami
```

If authentication is missing:

```powershell
pnpm --filter @invitica/viewer exec wrangler login
```

Confirm that the selected Cloudflare account owns the `invitica-storage` R2 bucket and the live
`invitica-viewer` Worker.

### 3. Supply the production MapTiler key for this shell

```powershell
$env:MAPTILER_KEY = "paste-the-domain-restricted-key-here"
```

The value must allow both the creator and guest production origins. Do not commit it, paste it into
notes, or add it to `wrangler.jsonc`. A dashboard-entered value does not survive this deployment
because checked-in Worker vars are deployed configuration.

### 4. Deploy the default Viewer

```powershell
pnpm --filter @invitica/viewer deploy
```

This guarded script rebuilds `dist/client`, copies static assets, and forwards the MapTiler key to
Wrangler. It refuses a missing key. Do not use bare `wrangler deploy`, which would deploy the empty
checked-in `MAPTILER_KEY` and silently remove venue maps.

`--allow-no-map` is an explicit emergency escape hatch, not the normal production command. Do not
pass `--env production` unless the production route has intentionally been moved to that separately
named Worker.

After the command finishes, remove the key from the shell:

```powershell
Remove-Item Env:MAPTILER_KEY
```

### 5. Verify the deployed target

First confirm the static asset and current generic HTML directly on the default Worker:

```powershell
curl.exe -sS -o NUL -w "HTTP %{http_code} %{content_type}`n" `
  https://invitica-viewer.invitica.workers.dev/apple-touch-icon.png

curl.exe -sS https://invitica-viewer.invitica.workers.dev/__deployment_probe__ |
  Select-String -SimpleMatch 'rel="apple-touch-icon"'
```

The icon must return `HTTP 200 image/png`. The probe invitation is intentionally unavailable, but
its HTML must still contain the Apple touch-icon link. If either check fails, the default Worker was
not updated; check the Wrangler account and whether `--env production` was passed accidentally.

Then verify a fictional general invitation through both the direct Worker and
`https://invitica.app/i/...`:

- the invitation renders and hydrates without a fallback/error state;
- its venue map loads and the directions fallback remains available;
- immutable `/m/*` media and `/s/*` social-preview URLs return their expected content types; and
- the canonical/Open Graph URL uses `https://invitica.app/i/...`.

Use fixture data only. Do not paste personalized fragment tokens, guest PII, or private invitation
links into commands, screenshots, notes, or logs.

## Deployment troubleshooting

- **Icon still returns 404:** the wrong Worker/environment or Cloudflare account was deployed.
- **Invitation works but the venue map is absent:** the deployment omitted or supplied the wrong
  `MAPTILER_KEY`, or its MapTiler origin restriction excludes the current creator/guest origin.
- **Direct Worker works but `invitica.app/i/*` does not:** inspect the web host's Viewer origin/proxy
  configuration; deploying a Worker does not update web-host routing.
- **Old social card remains cached:** confirm the publication job is current, then create a new
  immutable card by explicitly republishing fictional data before checking a crawler debugger.

Deployment state is external to Git. Record the verified Worker target and evidence in the Invitica
Second Brain after every manual production release.
