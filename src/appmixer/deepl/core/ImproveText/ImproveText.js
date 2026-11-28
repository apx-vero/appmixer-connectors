'use strict';

const lib = require('../../lib');

module.exports = {

    async receive(context) {

        const { text, targetLang, writingStyle, tone } = context.messages.in.content;

        if (!text) {
            throw new context.CancelError('Text is required!');
        }
        if (writingStyle && tone) {
            throw new context.CancelError('Set either a Writing Style or a Tone, not both.');
        }

        const body = { text: [String(text)] };
        if (targetLang) {
            body.target_lang = targetLang;
        }
        if (writingStyle) {
            body.writing_style = writingStyle;
        }
        if (tone) {
            body.tone = tone;
        }

        const { data } = await lib.apiRequest(context, { method: 'POST', path: '/v2/write/rephrase', data: body });
        const improvement = (data && Array.isArray(data.improvements) && data.improvements[0]) || null;
        if (!improvement) {
            throw new context.CancelError('DeepL returned no improved text.');
        }

        return context.sendJson(improvement, 'out');
    }
};
