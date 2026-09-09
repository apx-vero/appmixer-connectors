'use strict';

const lib = require('../../lib');

/** GraphQL page size. GitHub caps `first` at 100 on connections. */
const PAGE_SIZE = 100;

/**
 * Safety cap on pagination, so a pathological pull request cannot spin forever.
 * 20 pages is 2000 threads.
 */
const MAX_PAGES = 20;

const ITEM_SCHEMA = {
    type: 'object',
    required: ['id', 'isResolved'],
    properties: {
        'id': { 'type': 'string', 'title': 'Thread ID', 'example': 'PRRT_kwDOK5R0o86gk_Y1' },
        'isResolved': { 'type': 'boolean', 'title': 'Is Resolved', 'example': false },
        'isOutdated': { 'type': 'boolean', 'title': 'Is Outdated', 'example': true },
        'isCollapsed': { 'type': 'boolean', 'title': 'Is Collapsed', 'example': true },
        'path': { 'type': 'string', 'title': 'Path', 'example': 'src/appmixer/github/list/NewMention/NewMention.js' },
        'line': { 'type': 'integer', 'title': 'Line', 'example': 88 },
        'commentCount': { 'type': 'integer', 'title': 'Comment Count', 'example': 2 },
        'firstCommentId': { 'type': 'integer', 'title': 'First Comment ID', 'example': 3966546621 },
        'firstCommentAuthor': { 'type': 'string', 'title': 'First Comment Author', 'example': 'copilot-pull-request-reviewer' },
        'firstCommentBody': { 'type': 'string', 'title': 'First Comment Body', 'example': '`since` is advanced after the API call.' }
    }
};

const QUERY = `
query($owner: String!, $name: String!, $number: Int!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          isCollapsed
          path
          line
          comments(first: 1) {
            totalCount
            nodes { databaseId body author { login } }
          }
        }
      }
    }
  }
}`;

/**
 * @param {Object} thread GraphQL reviewThread node
 * @returns {Object}
 */
function toRecord(thread) {

    const comments = thread.comments || {};
    const first = (comments.nodes || [])[0] || {};

    return {
        id: thread.id,
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        isCollapsed: thread.isCollapsed,
        path: thread.path,
        line: thread.line,
        commentCount: comments.totalCount,
        firstCommentId: first.databaseId,
        // GraphQL reports Copilot's reviewer as `copilot-pull-request-reviewer`, where
        // REST reports the same account as `Copilot` — see lib.normalizeLogin().
        firstCommentAuthor: first.author && first.author.login,
        firstCommentBody: first.body
    };
}

/**
 * Component for listing the review threads of a pull request, with their resolution
 * state. Thread resolution has no REST representation at all, so this is GraphQL only.
 * @extends {Component}
 */
module.exports = {

    ITEM_SCHEMA,

    async receive(context) {

        const {
            repositoryId,
            pullRequestNumber,
            resolvedState = 'any',
            outputType = 'array'
        } = context.messages.in.content;

        if (context.properties.generateOutputPortOptions) {
            return lib.getOutputPortOptions(context, outputType, ITEM_SCHEMA.properties, { label: 'Review Threads' });
        }

        if (!repositoryId) {
            throw new context.CancelError('Repository is required!');
        }
        if (!pullRequestNumber) {
            throw new context.CancelError('Pull Request Number is required!');
        }

        const [owner, name] = repositoryId.split('/');
        if (!owner || !name) {
            throw new context.CancelError(`Repository must be in the 'owner/repo' form, got '${repositoryId}'.`);
        }

        const number = parseInt(pullRequestNumber, 10);
        if (!Number.isFinite(number)) {
            throw new context.CancelError(`Pull Request Number must be a number, got '${pullRequestNumber}'.`);
        }

        let after = null;
        let pages = 0;
        const threads = [];

        do {
            const data = await lib.graphqlRequest(context, QUERY, {
                owner, name, number, first: PAGE_SIZE, after
            });

            const pullRequest = data.repository && data.repository.pullRequest;
            if (!pullRequest) {
                throw new context.CancelError(`Pull request #${number} was not found in ${repositoryId}.`);
            }

            const connection = pullRequest.reviewThreads;
            threads.push(...(connection.nodes || []));

            after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
            pages += 1;
        } while (after && pages < MAX_PAGES);

        const records = threads
            .filter(thread => {
                if (resolvedState === 'resolved') return thread.isResolved === true;
                if (resolvedState === 'unresolved') return thread.isResolved === false;
                return true;
            })
            .map(toRecord);

        return lib.sendArrayOutput({ context, outputType, records });
    }
};
