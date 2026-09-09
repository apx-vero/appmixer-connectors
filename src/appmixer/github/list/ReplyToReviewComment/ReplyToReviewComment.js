'use strict';

const lib = require('../../lib');

const ITEM_SCHEMA = {
    type: 'object',
    required: ['id', 'body'],
    properties: {
        'id': { 'type': 'integer', 'title': 'ID', 'example': 3966546621 },
        'nodeId': { 'type': 'string', 'title': 'Node ID', 'example': 'PRRC_kwDOK5R0o86ubJc9' },
        'body': { 'type': 'string', 'title': 'Body', 'example': 'Fixed in the latest commit.' },
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
        'userLogin': { 'type': 'string', 'title': 'User Login', 'example': 'octocat' },
        'userId': { 'type': 'integer', 'title': 'User ID', 'example': 583231 },
        'userType': { 'type': 'string', 'title': 'User Type', 'example': 'User' },
        'authorAssociation': { 'type': 'string', 'title': 'Author Association', 'example': 'MEMBER' }
    }
};

/**
 * Component for replying to a pull request review comment inside its thread.
 * @extends {Component}
 */
module.exports = {

    ITEM_SCHEMA,

    async receive(context) {

        const { repositoryId, pullRequestNumber, commentId, body } = context.messages.in.content;

        if (!repositoryId) {
            throw new context.CancelError('Repository is required!');
        }
        if (!pullRequestNumber) {
            throw new context.CancelError('Pull Request Number is required!');
        }
        if (!commentId) {
            throw new context.CancelError('Comment ID is required!');
        }
        if (!body) {
            throw new context.CancelError('Body is required!');
        }

        const { data } = await lib.apiRequest(
            context,
            `repos/${repositoryId}/pulls/${pullRequestNumber}/comments/${commentId}/replies`,
            { method: 'POST', body: { body } }
        );

        return context.sendJson(lib.toReviewCommentRecord(data), 'out');
    }
};
