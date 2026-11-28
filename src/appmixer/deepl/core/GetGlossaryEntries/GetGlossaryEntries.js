'use strict';

const lib = require('../../lib');

module.exports = {

    async receive(context) {

        const { glossaryId, sourceLang, targetLang } = context.messages.in.content;

        if (!glossaryId) {
            throw new context.CancelError('Glossary is required!');
        }
        if (!sourceLang) {
            throw new context.CancelError('Source Language is required!');
        }
        if (!targetLang) {
            throw new context.CancelError('Target Language is required!');
        }

        const { data } = await lib.apiRequest(context, {
            path: '/v3/glossaries/' + encodeURIComponent(glossaryId) + '/entries',
            params: { source_lang: sourceLang, target_lang: targetLang }
        });
        const dictionary = (data && Array.isArray(data.dictionaries) && data.dictionaries[0]) || null;
        if (!dictionary) {
            throw new context.CancelError('The glossary has no dictionary for ' + sourceLang + ' → ' + targetLang + '.');
        }

        return context.sendJson(dictionary, 'out');
    }
};
