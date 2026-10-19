#!/usr/bin/env bash
# Compares the OpenClaw scripts in this repo with the host, or deploys them.
#
#   .github/openclaw/host/sync.sh check            # same / DIFFERENT / MISSING per file
#   .github/openclaw/host/sync.sh deploy [file…]   # copy repo → host (all files, or the given repo paths)
#
# Needs `ssh hetzner-appmixer-agents` (root). Config files (openclaw-hooks.json, nginx, systemd) carry
# placeholders instead of tokens and are applied by hand — see README.md.
set -euo pipefail
HOST=hetzner-appmixer-agents
ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # .github/openclaw

# repo path (relative to .github/openclaw) : host path
FILES="
vero-mention/INSTRUCTIONS.md:/root/.openclaw/workspace-vero/mention-responder/INSTRUCTIONS.md
vero-mention/resolve.sh:/root/.openclaw/workspace-vero/mention-responder/resolve.sh
vero-mention/post.sh:/root/.openclaw/workspace-vero/mention-responder/post.sh
vero-mention/push.sh:/root/.openclaw/workspace-vero/mention-responder/push.sh
vero-mention/vero-mention.mjs:/root/.openclaw/hooks/transforms/vero-mention.mjs
vero-mention/build-status.js:/root/openclaw-status/build-status.js
vero-testing/testing.mjs:/root/.openclaw/workspace-vero/pipeline-testing/testing.mjs
vero-testing/start.sh:/root/.openclaw/workspace-vero/pipeline-testing/start.sh
vero-testing/INSTRUCTIONS.md:/root/.openclaw/workspace-vero/pipeline-testing/INSTRUCTIONS.md
vero-testing/vero-testing.mjs:/root/.openclaw/hooks/transforms/vero-testing.mjs
vero-fix/resolve.mjs:/root/.openclaw/workspace-vero/pipeline-fix/resolve.mjs
vero-fix/finish.mjs:/root/.openclaw/workspace-vero/pipeline-fix/finish.mjs
vero-fix/INSTRUCTIONS.md:/root/.openclaw/workspace-vero/pipeline-fix/INSTRUCTIONS.md
vero-fix/amx:/root/.openclaw/workspace-vero/pipeline-fix/amx
vero-fix/vero-fix.mjs:/root/.openclaw/hooks/transforms/vero-fix.mjs
maya-docs/resolve.mjs:/root/.openclaw/workspace-maya/docs-pipeline/resolve.mjs
maya-docs/finish.mjs:/root/.openclaw/workspace-maya/docs-pipeline/finish.mjs
maya-docs/INSTRUCTIONS.md:/root/.openclaw/workspace-maya/docs-pipeline/INSTRUCTIONS.md
maya-docs/maya-docs.mjs:/root/.openclaw/hooks/transforms/maya-docs.mjs
pipeline-cost.mjs:/root/.openclaw/pipeline/cost.mjs
"

mode="${1:-check}"; shift || true
case "$mode" in
  check)
    remote=$(ssh -o BatchMode=yes "$HOST" "sha256sum $(echo "$FILES" | cut -d: -f2 | tr '\n' ' ') 2>/dev/null || true")
    for pair in $FILES; do
      repo="${pair%%:*}"; host="${pair#*:}"
      l=$(shasum -a 256 "$ROOT/$repo" | cut -d' ' -f1)
      h=$(echo "$remote" | awk -v f="$host" '$2 == f { print $1 }')
      if [ -z "$h" ]; then s=MISSING; elif [ "$l" = "$h" ]; then s=same; else s=DIFFERENT; fi
      printf '%-9s %s\n' "$s" "$repo"
    done
    ;;
  deploy)
    for pair in $FILES; do
      repo="${pair%%:*}"; host="${pair#*:}"
      if [ $# -gt 0 ] && ! printf '%s\n' "$@" | grep -qx "$repo"; then continue; fi
      case "$repo" in *.mjs|*.js) node --check "$ROOT/$repo" ;; *.sh|*/amx) bash -n "$ROOT/$repo" ;; esac
      scp -q -o BatchMode=yes "$ROOT/$repo" "$HOST:$host"
      case "$repo" in *.sh|*/amx) ssh -o BatchMode=yes "$HOST" "chmod +x '$host'" ;; esac
      echo "deployed $repo → $host"
    done
    ;;
  *) echo "usage: $0 check | deploy [repo-path…]"; exit 1 ;;
esac
