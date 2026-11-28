'use strict';

const lib = require('../../lib');

module.exports = {

    async receive(context) {

        const { glossaryId, name, sourceLang, targetLang, entries, entriesFormat } = context.messages.in.content;

        if (!glossaryId) {
            throw new context.CancelError('Glossary is required!');
        }
        if (!name && !entries) {
            throw new context.CancelError('Set a new Name, Entries, or both.');
        }
        if (entries && (!sourceLang || !targetLang)) {
            throw new context.CancelError('Source Language and Target Language are required with Entries.');
        }

        const body = {};
        if (name) {
            body.name = name;
        }
        if (entries) {
            // PATCH takes at most one dictionary and merges its entries into the existing ones.
            body.dictionaries = [{
                source_lang: sourceLang,
                target_lang: targetLang,
                entries: lib.normalizeEntries(entries),
                entries_format: entriesFormat || 'tsv'
            }];
        }

        await lib.apiRequest(context, {
            method: 'PATCH',
            path: '/v3/glossaries/' + encodeURIComponent(glossaryId),
            data: body
        });

        return context.sendJson({}, 'out');
    }
};
