'use strict';

const lib = require('../../lib');

module.exports = {

    async receive(context) {

        const { glossaryId } = context.messages.in.content;

        if (!glossaryId) {
            throw new context.CancelError('Glossary is required!');
        }

        await lib.apiRequest(context, {
            method: 'DELETE',
            path: '/v3/glossaries/' + encodeURIComponent(glossaryId)
        });

        return context.sendJson({}, 'out');
    }
};
