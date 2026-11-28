'use strict';

const lib = require('../../lib');

module.exports = {

    async receive(context) {

        const { glossaryId } = context.messages.in.content;

        if (!glossaryId) {
            throw new context.CancelError('Glossary is required!');
        }

        const { data } = await lib.apiRequest(context, {
            path: '/v3/glossaries/' + encodeURIComponent(glossaryId)
        });

        return context.sendJson(data, 'out');
    }
};
