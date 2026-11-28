'use strict';

const { fetchLanguages } = require('../FindLanguages/FindLanguages');

// A private dynamic source for language fields: one cached request, errors suppressed in the inspector.
module.exports = {

    async receive(context) {

        const { resource, usableAs } = context.messages.in.content;

        try {
            const languages = await fetchLanguages(context, {
                resource: resource || 'translate_text',
                usableAs,
                cached: true
            });
            return context.sendJson({ languages }, 'out');
        } catch (err) {
            if (context.properties.isSource) {
                return context.sendJson({ languages: [] }, 'out');
            }
            throw err;
        }
    },

    toSelectArray({ languages }) {

        return (languages || []).map(language => ({
            label: language.name + ' (' + language.lang + ')',
            value: language.lang
        }));
    }
};
