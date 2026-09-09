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
        'id': { 'type': 'integer', 'title': 'ID', 'example': 5601725019 },
        'nodeId': { 'type': 'string', 'title': 'Node ID', 'example': 'IC_kwDOK5R0o87OaBcb' },
        'body': { 'type': 'string', 'title': 'Body', 'example': 'Copilot review addressed.' },
        'htmlUrl': { 'type': 'string', 'title': 'HTML URL', 'example': 'https://github.com/octocat/Hello-World/pull/1259#issuecomment-5601725019' },
        'createdAt': { 'type': 'string', 'title': 'Created At', 'example': '2026-09-09T12:20:12Z' },
        'updatedAt': { 'type': 'string', 'title': 'Updated At', 'example': '2026-09-09T12:20:12Z' },
        'issueNumber': { 'type': 'integer', 'title': 'Issue Number', 'example': 1259 },
        'isPullRequest': { 'type': 'boolean', 'title': 'Is Pull Request', 'example': true },
        'userLogin': { 'type': 'string', 'title': 'User Login', 'example': 'octocat' },
        'userId': { 'type': 'integer', 'title': 'User ID', 'example': 583231 },
        'userType': { 'type': 'string', 'title': 'User Type', 'example': 'User' },
        'authorAssociation': { 'type': 'string', 'title': 'Author Association', 'example': 'MEMBER' }
    }
};

/**
 * Is this comment on a pull request rather than on a plain issue?
 *
 * The repository-wide endpoint returns both and the payload says nothing about which
 * is which — `issue_url` uses `/issues/` for a pull request too. Only `html_url`
 * distinguishes them, by containing `/pull/`.
 *
 * @param {Object} comment
 * @returns {Boolean}
 */
function isPullRequestComment(comment) {

    return String(comment.html_url || '').includes('/pull/');
}

/**
 * @param {Object} comment
 * @returns {Object}
 */
function toRecord(comment) {

    return {
        id: comment.id,
        nodeId: comment.node_id,
        body: comment.body,
        htmlUrl: comment.html_url,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        issueNumber: lib.numberFromUrl(comment.issue_url),
        isPullRequest: isPullRequestComment(comment),
        userLogin: comment.user && comment.user.login,
        userId: comment.user && comment.user.id,
        userType: comment.user && comment.user.type,
        authorAssociation: comment.author_association
    };
}

/**
 * @param {Array<Object>} comments
 * @param {Object} properties
 * @returns {Array<Object>}
 */
function filterComments(comments, { author, authorType, commentOn = 'both' }) {

    return comments.filter(comment => {
        if (!lib.matchesAuthor(comment.user, { author, authorType })) return false;
        if (commentOn === 'pullRequest' && !isPullRequestComment(comment)) return false;
        if (commentOn === 'issue' && isPullRequestComment(comment)) return false;
        return true;
    });
}

/**
 * Component which triggers whenever a new comment is added to an issue or to a pull
 * request conversation.
 * @extends {Component}
 */
module.exports = {

    ITEM_SCHEMA,

    async start(context) {

        if (!context.state.since) {
            await context.saveState({ since: nowIso(), known: [] });
        }
    },

    async tick(context) {

        const { repositoryId } = context.properties;

        // Snapshot before the request — see NewPullRequestReviewComment for why.
        const nextSince = nowIso();

        const res = await lib.apiRequest(context, `repos/${repositoryId}/issues/comments`, {
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
            await Promise.all(diff.map(comment => context.sendJson(toRecord(comment), 'out')));
        }

        const trimmedKnown = actual.length > MAX_KNOWN ? actual.slice(actual.length - MAX_KNOWN) : actual;
        await context.saveState({ known: trimmedKnown, since: nextSince });
    },

    async test(context) {

        const { repositoryId } = context.properties;

        const res = await lib.apiRequest(context, `repos/${repositoryId}/issues/comments`, {
            params: { sort: 'created', direction: 'desc' }
        });

        const [comment] = filterComments(res.data || [], context.properties);
        if (!comment) {
            throw new Error('No recent issue or pull request comments to use as test data.');
        }
        return context.sendJson(toRecord(comment), 'out');
    }
};
