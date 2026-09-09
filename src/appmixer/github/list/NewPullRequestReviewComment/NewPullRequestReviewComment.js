'use strict';

const lib = require('../../lib');

/**
 * Maximum number of comment IDs to retain in context.state.known. getNewItems()
 * replaces (not accumulates) known on every tick, so this only bites if a single
 * tick returns an unusually large page.
 */
const MAX_KNOWN = 500;

/**
 * The `since` parameter wants YYYY-MM-DDTHH:MM:SSZ, without milliseconds.
 * @returns {String}
 */
function nowIso() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const ITEM_SCHEMA = {
    type: 'object',
    required: ['id', 'body'],
    properties: {
        'id': { 'type': 'integer', 'title': 'ID', 'example': 3966546621 },
        'nodeId': { 'type': 'string', 'title': 'Node ID', 'example': 'PRRC_kwDOK5R0o86ubJc9' },
        'body': { 'type': 'string', 'title': 'Body', 'example': '`since` is advanced after the API call, so a comment can be missed.' },
        'htmlUrl': { 'type': 'string', 'title': 'HTML URL', 'example': 'https://github.com/octocat/Hello-World/pull/1259#discussion_r3966546621' },
        'createdAt': { 'type': 'string', 'title': 'Created At', 'example': '2026-09-09T09:01:23Z' },
        'updatedAt': { 'type': 'string', 'title': 'Updated At', 'example': '2026-09-09T09:01:24Z' },
        'pullRequestNumber': { 'type': 'integer', 'title': 'Pull Request Number', 'example': 1259 },
        'pullRequestReviewId': { 'type': 'integer', 'title': 'Pull Request Review ID', 'example': 5152089066 },
        'inReplyToId': { 'type': 'integer', 'title': 'In Reply To ID', 'example': 3966546487 },
        'path': { 'type': 'string', 'title': 'Path', 'example': 'src/appmixer/github/list/NewMention/NewMention.js' },
        'line': { 'type': 'integer', 'title': 'Line', 'example': 88 },
        'startLine': { 'type': 'integer', 'title': 'Start Line', 'example': 84 },
        'side': { 'type': 'string', 'title': 'Side', 'example': 'RIGHT' },
        'subjectType': { 'type': 'string', 'title': 'Subject Type', 'example': 'line' },
        'diffHunk': { 'type': 'string', 'title': 'Diff Hunk', 'example': '@@ -84,6 +84,8 @@ const nextSince = nowIso();' },
        'commitId': { 'type': 'string', 'title': 'Commit ID', 'example': 'e80efb98eb3b79d523a0bbf51a062c85bda2840a' },
        'userLogin': { 'type': 'string', 'title': 'User Login', 'example': 'Copilot' },
        'userId': { 'type': 'integer', 'title': 'User ID', 'example': 175728472 },
        'userType': { 'type': 'string', 'title': 'User Type', 'example': 'Bot' },
        'authorAssociation': { 'type': 'string', 'title': 'Author Association', 'example': 'MEMBER' }
    }
};

/**
 * Apply the author and pull request filters. GitHub cannot do either server-side on
 * this endpoint — the search API can filter by commenter, but its index is eventually
 * consistent, which makes it the wrong tool for a trigger.
 * @param {Array<Object>} comments
 * @param {Object} properties
 * @returns {Array<Object>}
 */
function filterComments(comments, { author, authorType, pullRequestNumber }) {

    const wantedPr = pullRequestNumber ? parseInt(pullRequestNumber, 10) : null;

    return comments.filter(comment => {
        if (!lib.matchesAuthor(comment.user, { author, authorType })) return false;
        if (wantedPr && lib.numberFromUrl(comment.pull_request_url) !== wantedPr) return false;
        return true;
    });
}

/**
 * Component which triggers whenever a new review comment is left on a pull request.
 * @extends {Component}
 */
module.exports = {

    ITEM_SCHEMA,

    async start(context) {

        // Only comments left after the flow was started are new to us.
        if (!context.state.since) {
            await context.saveState({ since: nowIso(), known: [] });
        }
    },

    async tick(context) {

        const { repositoryId } = context.properties;

        // Snapshot the next window's lower bound BEFORE the request: anything that lands
        // while it is in flight is >= nextSince and is picked up on the following tick
        // instead of being skipped by an already-advanced `since`.
        const nextSince = nowIso();

        // One page only, newest first. `--paginate` over this endpoint answers 502 on
        // busy repositories, and 100 comments is far more than one tick can produce.
        const res = await lib.apiRequest(context, `repos/${repositoryId}/pulls/comments`, {
            params: {
                sort: 'updated',
                direction: 'desc',
                since: context.state.since
            }
        });

        const comments = filterComments(res.data || [], context.properties);

        const known = Array.isArray(context.state.known) ? new Set(context.state.known) : null;
        const { diff, actual } = lib.getNewItems(known, comments, 'id');

        if (diff.length) {
            await Promise.all(diff.map(comment => context.sendJson(lib.toReviewCommentRecord(comment), 'out')));
        }

        // `since` filters on last update, so an edited old comment re-enters the window;
        // the known set, not the window, is what keeps it from being emitted twice.
        const trimmedKnown = actual.length > MAX_KNOWN ? actual.slice(actual.length - MAX_KNOWN) : actual;
        await context.saveState({ known: trimmedKnown, since: nextSince });
    },

    async test(context) {

        const { repositoryId } = context.properties;

        const res = await lib.apiRequest(context, `repos/${repositoryId}/pulls/comments`, {
            params: { sort: 'created', direction: 'desc' }
        });

        const [comment] = filterComments(res.data || [], context.properties);
        if (!comment) {
            throw new Error('No recent pull request review comments to use as test data.');
        }
        return context.sendJson(lib.toReviewCommentRecord(comment), 'out');
    }
};
