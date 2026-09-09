'use strict';

const lib = require('../../lib');

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
 * Component for listing the reviews submitted on a pull request.
 * @extends {Component}
 */
module.exports = {

    ITEM_SCHEMA,

    async receive(context) {

        const { repositoryId, pullRequestNumber, outputType = 'array' } = context.messages.in.content;

        if (context.properties.generateOutputPortOptions) {
            return lib.getOutputPortOptions(context, outputType, ITEM_SCHEMA.properties, { label: 'Reviews' });
        }

        if (!repositoryId) {
            throw new context.CancelError('Repository is required!');
        }
        if (!pullRequestNumber) {
            throw new context.CancelError('Pull Request Number is required!');
        }

        const reviews = await lib.apiRequestPaginated(
            context,
            `repos/${repositoryId}/pulls/${pullRequestNumber}/reviews`
        );

        const records = reviews.map(review => ({
            id: review.id,
            nodeId: review.node_id,
            state: review.state,
            body: review.body,
            htmlUrl: review.html_url,
            submittedAt: review.submitted_at,
            commitId: review.commit_id,
            pullRequestNumber: parseInt(pullRequestNumber, 10),
            userLogin: review.user && review.user.login,
            userId: review.user && review.user.id,
            userType: review.user && review.user.type,
            authorAssociation: review.author_association
        }));

        return lib.sendArrayOutput({ context, outputType, records });
    }
};
