'use strict';

const pathModule = require('path');
const lib = require('../../lib');

const DEFAULT_TIMEOUT_MINUTES = 30;
const MAX_TIMEOUT_MINUTES = 240;
// DeepL accepts documents up to 30 MB on Pro plans (smaller limits apply to some formats and
// to the Free plan; DeepL answers 413 then).
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/**
 * A multipart/form-data body for POST /v2/document: the text fields and the file part, which
 * must carry the file name (DeepL detects the format from its extension).
 * @param {object} fields
 * @param {{ name: string, content: Buffer }} file
 * @returns {{ body: Buffer, contentType: string }}
 */
const multipartBody = (fields, file) => {

    const boundary = '----appmixer' + Date.now().toString(16) + Math.random().toString(16).slice(2);
    const parts = [];
    for (const [name, value] of Object.entries(fields)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }
        parts.push(Buffer.from('--' + boundary + '\r\n'
            + 'Content-Disposition: form-data; name="' + name + '"\r\n\r\n'
            + String(value) + '\r\n', 'utf8'));
    }
    const safeName = String(file.name).replace(/["\r\n]/g, '_');
    parts.push(Buffer.from('--' + boundary + '\r\n'
        + 'Content-Disposition: form-data; name="file"; filename="' + safeName + '"\r\n'
        + 'Content-Type: application/octet-stream\r\n\r\n', 'utf8'));
    parts.push(file.content);
    parts.push(Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8'));
    return { body: Buffer.concat(parts), contentType: 'multipart/form-data; boundary=' + boundary };
};

/**
 * The name of the translated file: the original name with the target language appended, and
 * the extension of the output format when one was requested.
 * @param {string} originalName
 * @param {string} targetLang
 * @param {string} [outputFormat]
 * @returns {string}
 */
const translatedFileName = (originalName, targetLang, outputFormat) => {

    const extension = pathModule.extname(originalName);
    const base = pathModule.basename(originalName, extension) || 'document';
    const format = outputFormat ? '.' + String(outputFormat).replace(/^\./, '') : extension;
    return base + '_' + targetLang + format;
};

/**
 * Translate a document: upload it, check its status once a minute through a continuation
 * chain (context.setTimeout; DeepL offers no callback), then download the result. A result can
 * be downloaded only once: DeepL deletes it afterwards.
 */
module.exports = {

    multipartBody,
    translatedFileName,

    async receive(context) {

        if (context.messages.timeout) {
            const job = context.messages.timeout.content;
            const documentPath = '/v2/document/' + encodeURIComponent(job.documentId);
            const { data: status } = await lib.apiRequest(context, {
                method: 'POST',
                path: documentPath,
                data: { document_key: job.documentKey }
            });

            if (status.status === 'error') {
                throw new context.CancelError('DeepL could not translate the document'
                    + (status.error_message ? ': ' + status.error_message : '.'));
            }
            if (status.status === 'done') {
                const response = await lib.apiRequest(context, {
                    method: 'POST',
                    path: documentPath + '/result',
                    data: { document_key: job.documentKey },
                    responseType: 'arraybuffer'
                });
                const buffer = Buffer.from(response.data);
                const file = await context.saveFileStream(job.fileName, buffer);
                return context.sendJson({
                    fileId: file.fileId,
                    fileName: job.fileName,
                    fileSize: buffer.length,
                    documentId: job.documentId,
                    billedCharacters: status.billed_characters,
                    targetLang: job.targetLang
                }, 'out');
            }
            if (Date.now() >= job.deadline) {
                throw new context.CancelError('DeepL did not finish the document ' + job.documentId + ' within '
                    + job.timeoutMinutes + ' minutes (status ' + status.status + ').');
            }
            return context.setTimeout(job, lib.POLL_INTERVAL_MS);
        }

        const {
            fileId, targetLang, sourceLang, formality, glossaryId, outputFormat, timeoutMinutes
        } = context.messages.in.content;

        if (!fileId) {
            throw new context.CancelError('File is required!');
        }
        if (!targetLang) {
            throw new context.CancelError('Target Language is required!');
        }
        if (glossaryId && !sourceLang) {
            throw new context.CancelError('Source Language is required when you use a glossary.');
        }

        const fileInfo = await context.getFileInfo(fileId);
        const originalName = (fileInfo && fileInfo.filename) || 'document';
        if (!pathModule.extname(originalName)) {
            throw new context.CancelError('The file name "' + originalName + '" has no extension; '
                + 'DeepL needs it to recognise the document format.');
        }
        if (fileInfo && fileInfo.length > MAX_UPLOAD_BYTES) {
            throw new context.CancelError('The file is larger than 30 MB, the maximum DeepL accepts.');
        }
        const content = await context.loadFile(fileId);

        const target = String(targetLang).toUpperCase();
        const { body, contentType } = multipartBody({
            target_lang: target,
            source_lang: sourceLang ? String(sourceLang).toUpperCase() : undefined,
            formality,
            glossary_id: glossaryId,
            output_format: outputFormat
        }, { name: originalName, content: Buffer.from(content) });

        const { data } = await lib.apiRequest(context, {
            method: 'POST',
            path: '/v2/document',
            headers: { 'Content-Type': contentType },
            data: body,
            maxBodyLength: body.length + 1024
        });
        if (!data || !data.document_id || !data.document_key) {
            throw new context.CancelError('DeepL accepted the document but returned no document ID.');
        }

        const minutes = Number(timeoutMinutes) > 0
            ? Math.min(Math.floor(Number(timeoutMinutes)), MAX_TIMEOUT_MINUTES)
            : DEFAULT_TIMEOUT_MINUTES;
        return context.setTimeout({
            documentId: data.document_id,
            documentKey: data.document_key,
            fileName: translatedFileName(originalName, target, outputFormat),
            targetLang: target,
            timeoutMinutes: minutes,
            deadline: Date.now() + minutes * 60 * 1000
        }, lib.POLL_INTERVAL_MS);
    }
};
