'use strict';

const lib = require('../../lib');

module.exports = {

    async receive(context) {

        const { name, sourceLang, targetLang, entries, entriesFormat } = context.messages.in.content;

        if (!name) {
            throw new context.CancelError('Name is required!');
        }
        if (!sourceLang) {
            throw new context.CancelError('Source Language is required!');
        }
        if (!targetLang) {
            throw new context.CancelError('Target Language is required!');
        }
        if (!entries) {
            throw new context.CancelError('Entries is required!');
        }

        const { data } = await lib.apiRequest(context, {
            method: 'POST',
            path: '/v3/glossaries',
            data: {
                name,
                dictionaries: [{
                    source_lang: sourceLang,
                    target_lang: targetLang,
                    entries: lib.normalizeEntries(entries),
                    entries_format: entriesFormat || 'tsv'
                }]
            }
        });

        return context.sendJson(data, 'out');
    }
};
