# GitHub connector: tracking comments on pull requests

Written after building `.github/appmixer-flows/copilot-review-dispatch.json`, a
flow that has to react to GitHub Copilot's review comments. That flow needed
`Timer` + `Make API Call` + `Code Block` + `Each` to do something the connector
should express in one trigger — which is the finding.

Everything below marked *verified* was checked against the live API on
`Appmixer-ai/appmixer-connectors` on 2026-09-09.

## What the connector has today (github 3.2.0)

All of it is the **issue-comment** flavour, plus one outlier:

- `CreateComment` — `POST /repos/{o}/{r}/issues/{n}/comments`
- `ListComments` — comments of one issue/PR, `outputType`
- `UpdateComment` — `PATCH /repos/{o}/{r}/issues/comments/{id}`
- `SubmitReview` — `POST /repos/{o}/{r}/pulls/{n}/reviews`
- `NewCommitComment` — `GET /repos/{o}/{r}/comments`, a *third* kind of comment
  (commit comments), not what people mean by "PR comment". This repo has zero of
  them (*verified*).

There is **no trigger for a new comment on a PR at all**, of either kind, and
nothing that touches inline review comments or review threads.

## The three things called "comment"

Worth encoding in labels and descriptions, because the API names collide:

- **Issue comments** — the PR conversation timeline. Per item
  `/repos/{o}/{r}/issues/{n}/comments`, repo-wide `/repos/{o}/{r}/issues/comments`.
- **Review comments** — anchored to a line of the diff. Per PR
  `/repos/{o}/{r}/pulls/{n}/comments`, repo-wide `/repos/{o}/{r}/pulls/comments`.
- **Commit comments** — on a commit, outside any PR. `/repos/{o}/{r}/comments`.

A review is the container above review comments; its `state` is `APPROVED`,
`CHANGES_REQUESTED` or `COMMENTED`, and it can carry a body with no inline
comments at all.

## Proposed triggers

### NewPullRequestReviewComment

`GET /repos/{o}/{r}/pulls/comments?sort=created&direction=desc&since=<watermark>`

One call covers the whole repo (*verified*, `since` supported). Each item
carries `pull_request_review_id`, `pull_request_url`, `path`, `line`, `side`,
`diff_hunk`, `in_reply_to_id` and `subject_type` (*verified*) — enough to group
comments into reviews and into threads without a second call.

Inputs worth having: repository, optional author login, optional PR number,
and an "only bots / only humans" switch. This single component replaces four
components in the flow mentioned above.

### NewIssueComment

`GET /repos/{o}/{r}/issues/comments?since=<watermark>`

Covers conversation comments on **both** issues and PRs — in the last 20 items
here, 19 were on PRs and 1 on an issue (*verified*).

The gotcha that makes this worth a component: the payload has **no field saying
whether it is a PR or an issue** (*verified* — keys are `author_association,
body, created_at, html_url, id, issue_url, minimized, node_id,
performed_via_github_app, reactions, updated_at, url, user`). `issue_url` uses
`/issues/` for both. Only `html_url` distinguishes them, by containing `/pull/`.
A hand-rolled `Make API Call` will get this wrong; the component should expose a
"Comment on: pull requests / issues / both" input and do the check itself.

### NewReview

Fires on a submitted review, with its `state`.

There is **no repo-wide reviews endpoint** — `/repos/{o}/{r}/pulls/reviews`
returns 404 (*verified*). So this has to be built over open PRs: list
`/pulls?state=open&sort=updated&direction=desc`, then read `/pulls/{n}/reviews`
for the recently touched ones, capped; or one GraphQL query.

It is the only way to catch a review that has a body but no inline comments — an
"Approve" with a note. A trigger built on review comments structurally cannot
see those.

## Proposed actions

- **ReplyToReviewComment** — `POST /repos/{o}/{r}/pulls/{n}/comments/{id}/replies`.
  Replying inside a review thread is impossible in the connector today;
  `claude-copilot-responder.yml` shells out to `gh` for exactly this.
- **CreateReviewComment** — `POST /repos/{o}/{r}/pulls/{n}/comments`, the inline
  counterpart to the existing `SubmitReview`.
- **FindReviewComments / ListReviews** — `outputType`, per PR or repo-wide.
- **ResolveReviewThread / UnresolveReviewThread** — GraphQL `resolveReviewThread`
  / `unresolveReviewThread`. REST has **no concept of resolution at all**
  (*verified* — a review comment has no `isResolved` or `resolved` key). The
  `project` module already speaks GraphQL, so the plumbing exists.
- **ListReviewThreads** — GraphQL `pullRequest.reviewThreads`, giving thread
  `id`, `isResolved`, `isOutdated` and `path` (*verified*), none of which REST
  can produce.

Concrete motivation for the last two: PR #1259 currently has 4 Copilot threads
that are `isOutdated: true` but still `isResolved: false` (*verified*) — the
responder pushed fixes and replied, but nothing can close the threads.

## Implementation gotchas

- **Copilot's login differs per API surface.** REST reports
  `user.login = "Copilot"`; GraphQL reports
  `author.login = "copilot-pull-request-reviewer"` (*verified*, same threads).
  An author filter that only knows one of them silently matches nothing. Match
  case-insensitively on the substring `copilot`, and also accept
  `copilot-pull-request-reviewer[bot]`, which is the form the webhook payload
  uses.
- **`since` is documented as last-updated, not created** (docs; could not be
  confirmed here — this repo has no genuinely edited comments, the largest
  `created_at`→`updated_at` gap on a full page is 2 s). So an edited old comment
  can re-enter the window. Dedupe by id in state rather than trusting the
  window: the `{ initialized, lastTimestamp, known }` shape the other polling
  triggers use.
- **`--paginate` over `/pulls/comments` 502s on this repo** (*verified*). A
  trigger should take one page sorted by `updated` descending and dedupe, not
  walk every page.
- Neither comment endpoint can filter by author server-side. The search API can
  (`commenter:`), but its index is eventually consistent, so it is the wrong
  tool for a trigger.
- `NewCommitComment` is likely to be picked by users looking for PR comments.
  Its label and description should say "commit", not just "comment".

## Payoff

With `NewPullRequestReviewComment` the CI flow becomes two components —
that trigger filtered to `Copilot`, wired straight into `RepositoryDispatch` —
instead of five. With `ResolveReviewThread` the responder could close the
threads it has addressed instead of leaving them open.
