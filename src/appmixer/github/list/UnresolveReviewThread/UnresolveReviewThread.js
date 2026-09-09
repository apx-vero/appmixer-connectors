'use strict';

const lib = require('../../lib');

const ITEM_SCHEMA = {
    type: 'object',
    required: ['id', 'isResolved'],
    properties: {
        'id': { 'type': 'string', 'title': 'Thread ID', 'example': 'PRRT_kwDOK5R0o86gk_Y1' },
        'isResolved': { 'type': 'boolean', 'title': 'Is Resolved', 'example': false }
    }
};

const MUTATION = `
mutation($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}`;

/**
 * Component for reopening a resolved pull request review thread.
 * @extends {Component}
 */
module.exports = {

    ITEM_SCHEMA,

    async receive(context) {

        const { threadId } = context.messages.in.content;

        if (!threadId) {
            throw new context.CancelError('Thread ID is required!');
        }

        // A review comment id is not a thread id; passing one produces an opaque GraphQL
        // error, so name the likely mistake up front.
        if (!String(threadId).startsWith('PRRT_')) {
            throw new context.CancelError(
                `Thread ID must be a review thread node ID starting with 'PRRT_', got '${threadId}'. ` +
                'Use List Review Threads to obtain it — a comment ID will not work.'
            );
        }

        const data = await lib.graphqlRequest(context, MUTATION, { threadId });

        const thread = data.unresolveReviewThread && data.unresolveReviewThread.thread;
        if (!thread) {
            throw new context.CancelError(`Review thread '${threadId}' was not reopened.`);
        }

        return context.sendJson({ id: thread.id, isResolved: thread.isResolved }, 'out');
    }
};
