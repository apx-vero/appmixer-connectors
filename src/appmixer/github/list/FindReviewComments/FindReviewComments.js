'use strict';

const lib = require('../../lib');

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
 * Component for finding review comments in a repository or on a single pull request.
 * @extends {Component}
 */
module.exports = {

    ITEM_SCHEMA,

    async receive(context) {

        const {
            repositoryId,
            pullRequestNumber,
            author,
            since,
            outputType = 'array'
        } = context.messages.in.content;

        if (context.properties.generateOutputPortOptions) {
            return lib.getOutputPortOptions(context, outputType, ITEM_SCHEMA.properties, { label: 'Review Comments' });
        }

        if (!repositoryId) {
            throw new context.CancelError('Repository is required!');
        }

        // The per-pull-request endpoint takes no `since`, so the filter only applies to
        // the repository-wide search.
        const action = pullRequestNumber
            ? `repos/${repositoryId}/pulls/${pullRequestNumber}/comments`
            : `repos/${repositoryId}/pulls/comments`;

        const params = { sort: 'created', direction: 'desc' };
        if (!pullRequestNumber && since) {
            params.since = since;
        }

        const res = await lib.apiRequest(context, action, { params });

        const records = (res.data || [])
            .filter(comment => lib.matchesAuthor(comment.user, { author }))
            .map(comment => lib.toReviewCommentRecord(comment));

        if (records.length === 0) {
            return context.sendJson({}, 'notFound');
        }

        return lib.sendArrayOutput({ context, outputType, records });
    }
};
