'use strict';

const { fetchGlossaries } = require('../FindGlossaries/FindGlossaries');

// A private dynamic source for glossary fields: one cached request, errors suppressed in the inspector.
module.exports = {

    async receive(context) {

        try {
            const glossaries = await fetchGlossaries(context, { cached: true });
            return context.sendJson({ glossaries }, 'out');
        } catch (err) {
            if (context.properties.isSource) {
                return context.sendJson({ glossaries: [] }, 'out');
            }
            throw err;
        }
    },

    toSelectArray({ glossaries }) {

        return (glossaries || []).map(glossary => ({
            label: glossary.name,
            value: glossary.glossary_id
        }));
    }
};
