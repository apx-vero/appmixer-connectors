'use strict';

const lib = require('../../lib');

const ITEM_SCHEMA = {
    type: 'object',
    required: ['id', 'body'],
    properties: {
        'id': { 'type': 'integer', 'title': 'ID', 'example': 3966546621 },
        'nodeId': { 'type': 'string', 'title': 'Node ID', 'example': 'PRRC_kwDOK5R0o86ubJc9' },
        'body': { 'type': 'string', 'title': 'Body', 'example': 'This guard fails open on an empty result.' },
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
 * Parse a line number input, rejecting anything that is not a positive integer rather
 * than letting GitHub answer with an opaque 422.
 * @param {*} value
 * @param {Object} context
 * @param {String} fieldName
 * @returns {Number}
 */
function toLine(value, context, fieldName) {

    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
        throw new context.CancelError(`${fieldName} must be a positive line number, got '${value}'.`);
    }
    return parsed;
}

/**
 * Component for adding a review comment to a pull request.
 * @extends {Component}
 */
module.exports = {

    ITEM_SCHEMA,

    async receive(context) {

        const {
            repositoryId,
            pullRequestNumber,
            body,
            commitId,
            path,
            subjectType = 'line',
            line,
            side,
            startLine,
            startSide
        } = context.messages.in.content;

        if (!repositoryId) {
            throw new context.CancelError('Repository is required!');
        }
        if (!pullRequestNumber) {
            throw new context.CancelError('Pull Request Number is required!');
        }
        if (!body) {
            throw new context.CancelError('Body is required!');
        }
        if (!commitId) {
            throw new context.CancelError('Commit SHA is required!');
        }
        if (!path) {
            throw new context.CancelError('File Path is required!');
        }

        const payload = { body, commit_id: commitId, path };

        if (subjectType === 'file') {
            payload.subject_type = 'file';
        } else {
            if (!line) {
                throw new context.CancelError('Line is required when commenting on a line of the diff!');
            }
            payload.line = toLine(line, context, 'Line');
            if (side) {
                payload.side = side;
            }
            if (startLine) {
                payload.start_line = toLine(startLine, context, 'Start Line');
                if (startSide) {
                    payload.start_side = startSide;
                }
            }
        }

        const { data } = await lib.apiRequest(
            context,
            `repos/${repositoryId}/pulls/${pullRequestNumber}/comments`,
            { method: 'POST', body: payload }
        );

        return context.sendJson(lib.toReviewCommentRecord(data), 'out');
    }
};
