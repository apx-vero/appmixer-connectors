# Appmixer flows that drive this repo's CI

Flows here are **operational**, not connector test flows. They live outside
`src/appmixer/**/artifacts/test-flows`, so the connector e2e tooling never picks
them up and they never show in an e2e report.

## copilot-review-dispatch.json

Fires a `repository_dispatch` event of type `copilot-review` whenever GitHub
Copilot leaves a new review comment in this repo, which starts
`.github/workflows/claude-copilot-responder.yml`.

### Why it exists

The responder's original entry point is a `pull_request_review` event. That run
is raised by the **Copilot bot**, which is not a repo collaborator, on a PR whose
head lives in the **apx-vero fork** — so it falls under *Fork pull request
workflows from outside collaborators* and sits on "Approve and run" until a
maintainer clicks it. The `workflow_run` child inherits `actor=Copilot` and is
gated too. Every blocked run this repo has ever had was raised by `Copilot`;
nothing else is ever gated.

`repository_dispatch` runs are raised by the **dispatching token's owner**, always
run on the default branch and always receive secrets, so they are never gated.

### Shape

- `Timer` (interval 5 min) — the poll clock. Its `lastTick` is the exact
  watermark for the next step, so the window can never drift or overlap.
- `GitHub / Make API Call` — `GET /repos/Appmixer-ai/appmixer-connectors/pulls/comments?sort=created&direction=desc&per_page=100`.
  One call covers the whole repo. Unlike the `NewEvent` trigger this is
  immediate; the events API it polls is documented as 30 s to **6 h** behind.
- `Code Block` — keeps comments authored by `Copilot` that are newer than
  `lastTick`, collapses the many inline comments of one review into a single
  entry keyed by `pull_request_review_id`, and pulls the PR number out of
  `pull_request_url`. Emits an array of ready-made payload strings.
- `Each` — one iteration per new review.
- `GitHub / Repository Dispatch` — event type `copilot-review`, client payload
  `{"pr_number": "...", "review_id": "..."}`.

Every empty path (no new comments, empty API response, failed call) yields an
empty array, so `Each` emits only `done` and nothing is dispatched.

### Setup

- The connected GitHub account needs **push access** to
  `Appmixer-ai/appmixer-connectors` — `POST /repos/{owner}/{repo}/dispatches`
  requires it. `apx-vero` only has `triage`, so connect a writer's account.
- The connector must be published at **github 3.2.0 or newer**;
  `list/RepositoryDispatch` landed in that version (PR #1259).
- Import with an account bound, e.g.
  `appmixer flow import .github/appmixer-flows/copilot-review-dispatch.json -a <accountId>`,
  then start it.
- The responder skips anything that is not an open apx-vero PR, so the flow
  deliberately does not filter by PR author — that gate is cheap and already
  server-side.

### Duplicates

A poll window can hand the same review over twice (a retry, a manual dispatch on
top of an automatic one). The responder's Resolve step is idempotent: it skips a
review for which its own summary comment already exists with a timestamp after
the review's `submitted_at`. Worst case is one extra ~15 s no-op run.
