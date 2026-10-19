# The OpenClaw host of the pipeline

Everything the OpenClaw automations need on `hetzner-appmixer-agents` (91.99.144.37, reached as
`https://91-99-144-37.nip.io`), except the secrets. The scripts of each stage live next to this folder
(`vero-mention/`, `vero-testing/`, `vero-fix/`, `maya-docs/`, `pipeline-cost.mjs`). The Appmixer side
(dispatcher, stage result, pre-release checklist) lives in `.github/appmixer-flows/`.

## Keeping the host and the repo in sync

```bash
.github/openclaw/host/sync.sh check                          # same / DIFFERENT / MISSING per file
.github/openclaw/host/sync.sh deploy vero-testing/testing.mjs  # copy one file (or all, without arguments)
```

A change goes to the repo first, then `deploy`. `check` after any hand edit on the host.

## Configuration (applied by hand, placeholders instead of tokens)

- `openclaw-hooks.json`: the `hooks` block of `/root/.openclaw/openclaw.json`. It holds one mapping per
  hook (agent and model) and the agents allowed to run from hooks. The gateway reloads the file on its
  own; check with `journalctl --user -u openclaw-gateway` (with `XDG_RUNTIME_DIR=/run/user/0`).
- `nginx-openclaw-webhooks.conf`: `/etc/nginx/sites-enabled/openclaw-webhooks`. It allows only
  `location = /hooks/<hook>` and the status JSON, with a 10 requests/min limit per IP; everything else
  gets 403. After a change, run `nginx -t && systemctl reload nginx`.
- `openclaw-status.service` and `openclaw-status.timer`: `/etc/systemd/system/`. They run
  `build-status.js` every 5 minutes for the `/ops` page of appmixer-sanity.

A new hook needs all three: the transform in `/root/.openclaw/hooks/transforms/`, a mapping in
`openclaw-hooks.json`, and a `location` in nginx.

## Secrets (on the host only, never in the repo)

- `hooks.token` in `/root/.openclaw/openclaw.json` (`<OPENCLAW_HOOK_TOKEN>`). The Appmixer flows send it
  as `Authorization: Bearer` when they start a stage. A copy is in `/root/backups/hook-token.txt`.
- The status token in the nginx site (`<OPENCLAW_STATUS_TOKEN>`). appmixer-sanity reads the status JSON
  with it.
- `/root/.openclaw/.env`: `GITHUB_VERO_PAT` (apx-vero; pushes of the fix stage and the mention
  responder) and the gateway's model keys.
- `/root/.openclaw/pipeline/appmixer.json`: login to dev-automated-00001 for the Testing runner and the
  `amx` wrapper.
- `/root/.openclaw/pipeline/callback.json`: webhook URL and secret of `CI - pipeline stage result`. The
  URL is the credential; it changes when that integration's instance is recreated.

All of them are root-only (`chmod 600`).

## Recreating the Appmixer instances

`.github/appmixer-flows/tools/new-instance.mjs` creates an instance from a published template, binds the
accounts, fills the `<PLACEHOLDER>`s from a local secrets file and replaces the old instance.
`patch-instance.mjs` brings code changes into a running instance without recreating it. Instances in
use on dev-automated-00001, as of 2026-10-19:

- `CI - project status -> pipeline`: `f9aea70f-f3e4-4806-bfa3-39e10fe3cabc`.
- `CI - pipeline stage result`: `7483366f-f2d1-40e4-8487-e6cecb13543a`. After recreating it, write its
  new webhook URL into `callback.json` on the host.
- `CI - pre-release checklist`: `e3e5c56f-4763-42d3-8e84-b3e2402e2067`. After recreating it, put its
  new webhook URL into the dispatcher (`Pre-release flow URL`).
