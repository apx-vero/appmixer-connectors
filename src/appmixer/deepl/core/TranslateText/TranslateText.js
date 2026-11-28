'use strict';

const lib = require('../../lib');

module.exports = {

    async receive(context) {

        const {
            text, targetLang, sourceLang, formality, glossaryId, context: textContext,
            modelType, tagHandling, preserveFormatting
        } = context.messages.in.content;

        if (!text) {
            throw new context.CancelError('Text is required!');
        }
        if (!targetLang) {
            throw new context.CancelError('Target Language is required!');
        }
        if (glossaryId && !sourceLang) {
            throw new context.CancelError('Source Language is required when you use a glossary.');
        }

        // JSON body: DeepL limits request headers to 16 KiB, and a JSON body keeps the text out of them.
        const body = {
            text: [String(text)],
            // /v2/translate takes upper-case codes (EN-US, ZH-HANS); the language fields offer
            // the codes of /v3/languages (en-US, zh-Hans).
            target_lang: String(targetLang).toUpperCase(),
            show_billed_characters: true
        };
        if (sourceLang) {
            body.source_lang = String(sourceLang).toUpperCase();
        }
        if (formality) {
            body.formality = formality;
        }
        if (glossaryId) {
            body.glossary_id = glossaryId;
        }
        if (textContext) {
            body.context = textContext;
        }
        if (modelType) {
            body.model_type = modelType;
        }
        if (tagHandling) {
            body.tag_handling = tagHandling;
        }
        if (preserveFormatting) {
            body.preserve_formatting = true;
        }

        const { data } = await lib.apiRequest(context, { method: 'POST', path: '/v2/translate', data: body });
        const translation = (data && Array.isArray(data.translations) && data.translations[0]) || null;
        if (!translation) {
            throw new context.CancelError('DeepL returned no translation.');
        }

        return context.sendJson(translation, 'out');
    }
};
