'use strict';

const lib = require('../../lib');

// The output contract of ONE glossary (POST/GET /v3/glossaries).
const ITEM_SCHEMA = {
    type: 'object',
    required: ['glossary_id', 'name', 'dictionaries'],
    properties: {
        glossary_id: { type: 'string', title: 'Glossary ID', example: 'def3a26b-3e84-45b3-84ae-0c0aaf3525f7' },
        name: { type: 'string', title: 'Name', example: 'Product terms' },
        creation_time: { type: 'string', format: 'date-time', title: 'Created At', example: '2026-11-28T14:16:18.329Z' },
        dictionaries: {
            type: 'array',
            title: 'Dictionaries',
            items: {
                type: 'object',
                properties: {
                    source_lang: { type: 'string', title: 'Source Language', example: 'en' },
                    target_lang: { type: 'string', title: 'Target Language', example: 'de' },
                    entry_count: { type: 'integer', title: 'Entry Count', example: 2 }
                }
            },
            example: [{ source_lang: 'en', target_lang: 'de', entry_count: 2 }]
        }
    }
};

/**
 * All glossaries of the account. GET /v3/glossaries has no paging: one request returns them all.
 * @param {object} context
 * @param {object} [options] { cached }
 * @returns {Promise<object[]>}
 */
const fetchGlossaries = async (context, { cached = false } = {}) => {

    const data = cached
        ? await lib.getCached(context, '/v3/glossaries')
        : (await lib.apiRequest(context, { path: '/v3/glossaries' })).data;
    return (data && Array.isArray(data.glossaries)) ? data.glossaries : [];
};

module.exports = {

    ITEM_SCHEMA,
    fetchGlossaries,

    async receive(context) {

        const { name, outputType } = context.messages.in.content;

        if (context.properties.generateOutputPortOptions) {
            return lib.getOutputPortOptions(context, outputType, ITEM_SCHEMA.properties, { label: 'Glossaries', value: 'result' });
        }

        const needle = name ? String(name).toLowerCase() : '';
        const glossaries = (await fetchGlossaries(context))
            .filter(glossary => !needle || String(glossary.name || '').toLowerCase().includes(needle));
        if (!glossaries.length) {
            return context.sendJson({}, 'notFound');
        }

        return lib.sendArrayOutput({ context, outputType, records: glossaries });
    }
};
