'use strict';

const crypto = require('crypto');
const pathModule = require('path');

// DeepL serves the Free and the Pro plan from different hosts. A Free key ends in ":fx" and
// works only on api-free.deepl.com; a Pro key only on api.deepl.com (the other host answers 403).
// developers.deepl.com/docs/getting-started/auth
const API_PRO_URL = 'https://api.deepl.com';
const API_FREE_URL = 'https://api-free.deepl.com';
const FREE_KEY_SUFFIX = ':fx';

// Appmixer does not schedule a continuation sooner than one minute (06-component-behavior.md).
const POLL_INTERVAL_MS = 60 * 1000;

const DEFAULT_PREFIX = 'deepl-objects-export';

/**
 * The API origin a key belongs to.
 * @param {string} apiKey
 * @returns {string}
 */
const apiBaseUrl = (apiKey) => {

    return typeof apiKey === 'string' && apiKey.trim().endsWith(FREE_KEY_SUFFIX) ? API_FREE_URL : API_PRO_URL;
};

/**
 * The one place that turns an API key into request headers.
 * @param {string} apiKey
 * @returns {object}
 */
const keyHeaders = (apiKey) => {

    return { 'Authorization': 'DeepL-Auth-Key ' + (typeof apiKey === 'string' ? apiKey.trim() : '') };
};

const cancelError = (context, message) => {

    return context && context.CancelError ? new context.CancelError(message) : new Error(message);
};

/**
 * DeepL answers errors with a JSON body { message, detail? }.
 * @param {object} err
 * @returns {string|null}
 */
const errorDetail = (err) => {

    const body = err && err.response && err.response.data;
    if (Buffer.isBuffer(body) || body instanceof ArrayBuffer) {
        try {
            return errorDetail({ response: { data: JSON.parse(Buffer.from(body).toString('utf8')) } });
        } catch (e) {
            return null;
        }
    }
    if (typeof body === 'string' && body.trim()) {
        return body.trim().slice(0, 500);
    }
    if (!body || typeof body !== 'object') {
        return null;
    }
    return [body.message, body.detail].filter(Boolean).join(': ') || null;
};

// Status codes a retry cannot fix. 429 (too many requests) and 5xx stay retryable.
const PERMANENT_STATUS_MESSAGES = {
    400: 'DeepL rejected the request',
    403: 'DeepL refused the API key. Check the key; a DeepL API Free key ends in ":fx"',
    404: 'Not found in DeepL',
    413: 'The request or the document is too large for DeepL',
    415: 'DeepL does not support this content type or file format',
    456: 'The DeepL character or document quota of the account is used up'
};

module.exports = {

    API_PRO_URL,
    API_FREE_URL,
    POLL_INTERVAL_MS,
    apiBaseUrl,
    keyHeaders,
    errorDetail,

    /**
     * The API origin of the connected account.
     * @param {object} context
     * @returns {string}
     */
    baseUrl(context) {

        return apiBaseUrl(context.auth.apiKey);
    },

    /**
     * Headers carrying the credential of the connected account.
     * @param {object} context
     * @returns {object}
     */
    authHeaders(context) {

        return keyHeaders(context.auth.apiKey);
    },

    /**
     * Call the DeepL API of the connected account.
     * Errors a retry cannot fix (400, 403, 404, 413, 415, 456 quota exceeded) become a
     * CancelError with DeepL's own message; 429 and 5xx stay retryable.
     * @param {object} context
     * @param {object} options { method, path, url, params, data, headers, responseType, maxBodyLength }
     * @returns {Promise<object>} the response
     */
    async apiRequest(context, {
        method = 'GET', path, url, params, data, headers = {}, responseType, maxBodyLength
    } = {}) {

        const options = {
            method,
            url: url || (module.exports.baseUrl(context) + path),
            headers: { ...headers, ...module.exports.authHeaders(context) }
        };
        if (params && Object.keys(params).length) {
            options.params = params;
        }
        if (data !== undefined) {
            options.data = data;
        }
        if (responseType) {
            options.responseType = responseType;
        }
        if (maxBodyLength) {
            options.maxBodyLength = maxBodyLength;
            options.maxContentLength = maxBodyLength;
        }
        try {
            return await context.httpRequest(options);
        } catch (err) {
            const status = err && err.response && err.response.status;
            const prefix = PERMANENT_STATUS_MESSAGES[status];
            if (prefix) {
                const detail = errorDetail(err);
                const error = cancelError(context, prefix + ' (' + status + ')' + (detail ? ': ' + detail : '.'));
                error.status = status;
                throw error;
            }
            throw err;
        }
    },

    /**
     * Resolve a user supplied endpoint (relative path or absolute URL) against the account's
     * API origin and refuse anything that would send the API key somewhere else.
     * @param {object} context
     * @param {string} url relative path (e.g. '/v2/usage') or absolute URL on the API host
     * @returns {string}
     */
    resolveApiUrl(context, url) {

        const base = module.exports.baseUrl(context);
        const value = String(url).trim();
        const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')
            ? value
            : (value.startsWith('/') ? '' : '/') + value;

        let parsed;
        try {
            parsed = new URL(candidate, base);
        } catch (error) {
            throw new context.CancelError('API Endpoint Path is not a valid URL: ' + url);
        }
        if (parsed.username || parsed.password) {
            throw new context.CancelError('API Endpoint Path must not contain credentials.');
        }
        if (parsed.origin !== base) {
            throw new context.CancelError('API Endpoint Path must target ' + base + ', got ' + parsed.origin + '.');
        }
        return parsed.toString();
    },

    /**
     * Parse a textarea JSON input. Empty input means "no body"; an object is passed through.
     * @param {object} context
     * @param {string|object} value
     * @param {string} label
     * @returns {object|undefined}
     */
    parseJsonInput(context, value, label) {

        if (value === null || value === undefined || value === '') {
            return undefined;
        }
        if (typeof value === 'object') {
            return value;
        }
        try {
            return JSON.parse(value);
        } catch (error) {
            throw new context.CancelError(label + ' must be valid JSON.');
        }
    },

    /**
     * Convert a key-value inspector input into a plain object. The Designer stores the rows as
     * the JSON string of an object; a plain object and an array of {key, value} rows are
     * accepted too, for values mapped from a variable.
     * @param {string|object|Array<{key: string, value: *}>} value
     * @returns {object}
     */
    kvToObject(value) {

        let input = value;
        if (typeof input === 'string') {
            if (!input.trim()) {
                return {};
            }
            try {
                input = JSON.parse(input);
            } catch (error) {
                throw new Error('Request Headers and Query Parameters must be a JSON object of key-value pairs.');
            }
        }
        if (!input || typeof input !== 'object') {
            return {};
        }
        const entries = Array.isArray(input)
            ? input.filter(row => row && typeof row === 'object').map(row => [row.key, row.value])
            : Object.entries(input);
        const result = {};
        for (const [key, val] of entries) {
            if (typeof key !== 'string' || !key) {
                continue;
            }
            result[key] = val;
        }
        return result;
    },

    /**
     * A GET for a dynamic inspector source, cached per key and URL: the designer fires these
     * calls in bursts whenever an inspector opens.
     * @param {object} context
     * @param {string} path
     * @param {object} [params]
     * @returns {Promise<*>} the response body
     */
    async getCached(context, path, params) {

        const key = 'deepl-' + crypto.createHash('sha256')
            .update(JSON.stringify({ path, params, key: context.auth.apiKey }))
            .digest('hex');
        let lock;
        try {
            lock = await context.lock(key);
            const cached = await context.staticCache.get(key);
            if (cached) {
                return cached;
            }
            const { data } = await module.exports.apiRequest(context, { path, params });
            await context.staticCache.set(key, data, context.config.listCacheTTL || (2 * 60 * 1000));
            return data;
        } finally {
            if (lock) {
                await lock.unlock();
            }
        }
    },

    /**
     * Glossary entries as DeepL expects them: one entry per line, source and target separated by
     * a tab (TSV) or a comma (CSV). The Designer can turn a typed tab into spaces, so the
     * two-character sequence \t is accepted for a tab as well.
     * @param {string} entries
     * @returns {string}
     */
    normalizeEntries(entries) {

        return String(entries).replace(/\\t/g, '\t').replace(/\r\n/g, '\n').trim();
    },

    async sendArrayOutput({
        context,
        outputPortName = 'out',
        outputType = 'array',
        records = []
    }) {
        if (outputType === 'first') {
            if (records.length === 0) {
                throw new context.CancelError('No records available for first output type');
            }
            await context.sendJson(
                { ...records[0], index: 0, count: records.length },
                outputPortName
            );
        } else if (outputType === 'object') {
            for (let index = 0; index < records.length; index++) {
                await context.sendJson(
                    { ...records[index], index, count: records.length },
                    outputPortName
                );
            }
        } else if (outputType === 'array') {
            await context.sendJson({ result: records, count: records.length }, outputPortName);
        } else if (outputType === 'file') {
            const csvString = toCsv(records);
            let buffer = Buffer.from(csvString, 'utf8');
            const componentName = context.flowDescriptor[context.componentId].label || context.componentId;
            const fileName = `${context.config.outputFilePrefix || DEFAULT_PREFIX}-${componentName}.csv`;
            const savedFile = await context.saveFileStream(pathModule.normalize(fileName), buffer);
            await context.log({ step: 'File was saved', fileName, fileId: savedFile.fileId });
            await context.sendJson({ fileId: savedFile.fileId }, outputPortName);
        } else {
            throw new context.CancelError('Unsupported outputType ' + outputType);
        }
    },

    getOutputPortOptions(context, outputType, itemSchema, { label, value }) {
        if (outputType === 'object' || outputType === 'first') {
            const options = Object.keys(itemSchema)
                .reduce((res, field) => {
                    const schema = itemSchema[field];
                    const { title: label, ...schemaWithoutTitle } = schema;
                    res.push({ label, value: field, schema: schemaWithoutTitle });
                    return res;
                }, [{
                    label: 'Current Item Index',
                    value: 'index',
                    schema: { type: 'integer' }
                }, {
                    label: 'Items Count',
                    value: 'count',
                    schema: { type: 'integer' }
                }]);
            return context.sendJson(options, 'out');
        }

        if (outputType === 'array') {
            return context.sendJson([{
                label,
                value,
                schema: {
                    type: 'array',
                    items: { type: 'object', properties: itemSchema }
                }
            }], 'out');
        }

        if (outputType === 'file') {
            return context.sendJson([{ label: 'File ID', value: 'fileId' }], 'out');
        }
    }
};

// One CSV cell per RFC 4180: null/undefined → empty, objects → JSON, and a value
// holding a comma, a double quote or a line break is quoted with inner quotes doubled.
const csvCell = (value) => {
    if (value == null) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};

const toCsv = (records) => {
    // An empty result set is ordinary (new account, filter matches nothing): an empty file, not a crash.
    if (!records.length) return '';
    // Cells are taken by header column, not Object.values(record), so a record with
    // a different key order or a missing key stays under the right header.
    const columns = Object.keys(records[0]);
    const rows = records.map(record => columns.map(column => csvCell(record[column])).join(','));
    return [columns.map(csvCell).join(','), ...rows].join('\n');
};
