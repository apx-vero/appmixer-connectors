'use strict';

const lib = require('../../lib');

// The output contract of ONE language (GET /v3/languages).
const ITEM_SCHEMA = {
    type: 'object',
    required: ['lang', 'name', 'usable_as_source', 'usable_as_target', 'status'],
    properties: {
        lang: { type: 'string', title: 'Language Code', example: 'de' },
        name: { type: 'string', title: 'Name', example: 'German' },
        usable_as_source: { type: 'boolean', title: 'Usable As Source', example: true },
        usable_as_target: { type: 'boolean', title: 'Usable As Target', example: true },
        status: { type: 'string', title: 'Status', example: 'stable' }
    }
};

/**
 * Languages of a DeepL feature, filtered by the side they can be used on.
 * @param {object} context
 * @param {object} options { resource, usableAs, cached }
 * @returns {Promise<object[]>}
 */
const fetchLanguages = async (context, { resource, usableAs, cached = false }) => {

    const params = { resource };
    const data = cached
        ? await lib.getCached(context, '/v3/languages', params)
        : (await lib.apiRequest(context, { path: '/v3/languages', params })).data;
    const languages = Array.isArray(data) ? data : [];
    if (usableAs === 'source') {
        return languages.filter(language => language.usable_as_source);
    }
    if (usableAs === 'target') {
        return languages.filter(language => language.usable_as_target);
    }
    return languages;
};

module.exports = {

    ITEM_SCHEMA,
    fetchLanguages,

    async receive(context) {

        const { resource, usableAs, outputType } = context.messages.in.content;

        if (context.properties.generateOutputPortOptions) {
            return lib.getOutputPortOptions(context, outputType, ITEM_SCHEMA.properties, { label: 'Languages', value: 'result' });
        }

        if (!resource) {
            throw new context.CancelError('Feature is required!');
        }

        const languages = await fetchLanguages(context, { resource, usableAs });
        if (!languages.length) {
            return context.sendJson({}, 'notFound');
        }

        return lib.sendArrayOutput({ context, outputType, records: languages });
    }
};
