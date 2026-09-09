'use strict';

const lib = require('../../lib');

/**
 * Maximum number of review IDs to retain in context.state.known. Reviews are far
 * rarer than comments, but the cap keeps state bounded on a busy repository.
 */
const MAX_KNOWN = 500;

/** Fallback when the user leaves "Pull Requests To Scan" empty. */
const DEFAULT_MAX_PULL_REQUESTS = 20;

/** Hard ceiling, mirroring the maximum in component.json. */
const MAX_PULL_REQUESTS = 100;

const ITEM_SCHEMA = {
    type: 'object',
    required: ['id', 'state'],
    properties: {
        'id': { 'type': 'integer', 'title': 'ID', 'example': 5152089066 },
        'nodeId': { 'type': 'string', 'title': 'Node ID', 'example': 'PRR_kwDOK5R0o86gk_Y1' },
        'state': { 'type': 'string', 'title': 'State', 'example': 'CHANGES_REQUESTED' },
        'body': { 'type': 'string', 'title': 'Body', 'example': 'A few issues worth fixing before merge.' },
        'htmlUrl': { 'type': 'string', 'title': 'HTML URL', 'example': 'https://github.com/octocat/Hello-World/pull/1259#pullrequestreview-5152089066' },
        'submittedAt': { 'type': 'string', 'title': 'Submitted At', 'example': '2026-09-09T09:01:23Z' },
        'commitId': { 'type': 'string', 'title': 'Commit ID', 'example': 'e80efb98eb3b79d523a0bbf51a062c85bda2840a' },
        'pullRequestNumber': { 'type': 'integer', 'title': 'Pull Request Number', 'example': 1259 },
        'userLogin': { 'type': 'string', 'title': 'User Login', 'example': 'Copilot' },
        'userId': { 'type': 'integer', 'title': 'User ID', 'example': 175728472 },
        'userType': { 'type': 'string', 'title': 'User Type', 'example': 'Bot' },
        'authorAssociation': { 'type': 'string', 'title': 'Author Association', 'example': 'MEMBER' }
    }
};

/**
 * @param {Object} review
 * @param {Number} pullRequestNumber
 * @returns {Object}
 */
function toRecord(review, pullRequestNumber) {

    return {
        id: review.id,
        nodeId: review.node_id,
        state: review.state,
        body: review.body,
        htmlUrl: review.html_url,
        submittedAt: review.submitted_at,
        commitId: review.commit_id,
        pullRequestNumber,
        userLogin: review.user && review.user.login,
        userId: review.user && review.user.id,
        userType: review.user && review.user.type,
        authorAssociation: review.author_association
    };
}

/**
 * Read the reviews of the most recently updated open pull requests.
 *
 * GitHub has no repository-wide reviews endpoint — `/repos/{owner}/{repo}/pulls/reviews`
 * answers 404 — so the only way to watch a repository is to walk its open pull requests.
 * Scanning is capped because this costs one API call per pull request.
 *
 * @param {Object} context
 * @param {String} repositoryId
 * @param {Number} limit
 * @returns {Promise<Array<Object>>} flattened review records
 */
async function collectReviews(context, repositoryId, limit) {

    const prs = await lib.apiRequest(context, `repos/${repositoryId}/pulls`, {
        params: { state: 'open', sort: 'updated', direction: 'desc' }
    });

    const recent = (prs.data || []).slice(0, limit);
    const records = [];

    for (const pr of recent) {
        const res = await lib.apiRequest(context, `repos/${repositoryId}/pulls/${pr.number}/reviews`);
        for (const review of res.data || []) {
            records.push({ review, pullRequestNumber: pr.number });
        }
    }

    return records;
}

/**
 * @param {Array<Object>} records `{ review, pullRequestNumber }` pairs
 * @param {Object} properties
 * @returns {Array<Object>}
 */
function filterReviews(records, { author, authorType, state = 'any' }) {

    return records.filter(({ review }) => {
        if (!lib.matchesAuthor(review.user, { author, authorType })) return false;
        if (state !== 'any' && review.state !== state) return false;
        return true;
    });
}

/**
 * How many pull requests to scan per tick, clamped to the documented range so a
 * mistyped value cannot turn one tick into hundreds of API calls.
 * @param {*} value
 * @returns {Number}
 */
function scanLimit(value) {

    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_MAX_PULL_REQUESTS;
    }
    return Math.min(parsed, MAX_PULL_REQUESTS);
}

/**
 * Component which triggers whenever a review is submitted on an open pull request.
 * @extends {Component}
 */
module.exports = {

    ITEM_SCHEMA,

    async start(context) {

        // Seed `known` with the reviews that already exist, so starting the flow does
        // not replay the entire review history of every open pull request.
        const { repositoryId, maxPullRequests } = context.properties;
        const records = await collectReviews(context, repositoryId, scanLimit(maxPullRequests));

        await context.saveState({ known: records.map(({ review }) => review.id) });
    },

    async tick(context) {

        const { repositoryId, maxPullRequests } = context.properties;

        const records = filterReviews(
            await collectReviews(context, repositoryId, scanLimit(maxPullRequests)),
            context.properties
        );

        // getNewItems() keys on a flat property, so compare on the review id.
        const flat = records.map(({ review, pullRequestNumber }) => ({
            id: review.id,
            review,
            pullRequestNumber
        }));

        const known = Array.isArray(context.state.known) ? new Set(context.state.known) : null;
        const { diff, actual } = lib.getNewItems(known, flat, 'id');

        if (diff.length) {
            await Promise.all(diff.map(item => {
                return context.sendJson(toRecord(item.review, item.pullRequestNumber), 'out');
            }));
        }

        const trimmedKnown = actual.length > MAX_KNOWN ? actual.slice(actual.length - MAX_KNOWN) : actual;
        await context.saveState({ known: trimmedKnown });
    },

    async test(context) {

        const { repositoryId, maxPullRequests } = context.properties;

        const records = filterReviews(
            await collectReviews(context, repositoryId, scanLimit(maxPullRequests)),
            context.properties
        );

        // Collection order is not submission order — pull requests come newest-first but
        // each one's reviews come oldest-first, so the last record collected belongs to
        // the OLDEST pull request scanned. Sort to get a sample the user recognises.
        const [latest] = records.slice().sort((a, b) => {
            return String(b.review.submitted_at || '').localeCompare(String(a.review.submitted_at || ''));
        });

        if (!latest) {
            throw new Error('No reviews on the open pull requests to use as test data.');
        }
        return context.sendJson(toRecord(latest.review, latest.pullRequestNumber), 'out');
    }
};
