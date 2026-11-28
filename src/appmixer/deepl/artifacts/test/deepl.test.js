'use strict';

const assert = require('assert');
const path = require('path');
const sinon = require('sinon');

const ROOT = path.join(__dirname, '../..');
const lib = require(path.join(ROOT, 'lib.js'));
const auth = require(path.join(ROOT, 'auth.js'));
const load = (name) => require(path.join(ROOT, 'core', name, name + '.js'));

class CancelError extends Error {}

const FREE_KEY = '279a2e9d-83b3-c416-7e2d-f721593e42a0:fx';
const PRO_KEY = '279a2e9d-83b3-c416-7e2d-f721593e42a0';

const httpError = (status, data) => Object.assign(new Error('Request failed with status code ' + status), {
    response: { status, data }
});

const createContext = (overrides = {}) => {

    const sent = [];
    const context = {
        auth: { apiKey: FREE_KEY },
        config: {},
        properties: {},
        messages: { in: { content: {} } },
        CancelError,
        httpRequest: sinon.stub(),
        sendJson: sinon.stub().callsFake(async (data, port) => sent.push({ data, port })),
        setTimeout: sinon.stub().resolves(),
        saveFileStream: sinon.stub().resolves({ fileId: 'file-out' }),
        getFileInfo: sinon.stub().resolves({ filename: 'report.txt', length: 11 }),
        loadFile: sinon.stub().resolves(Buffer.from('Hello world')),
        lock: async () => ({ unlock: async () => {} }),
        staticCache: { get: async () => null, set: async () => {} },
        log: async () => {},
        ...overrides
    };
    context.sent = sent;
    return context;
};

describe('appmixer.deepl', function() {

    describe('lib.apiBaseUrl', function() {

        it('sends Free keys (":fx") to api-free.deepl.com and Pro keys to api.deepl.com', function() {

            assert.strictEqual(lib.apiBaseUrl(FREE_KEY), 'https://api-free.deepl.com');
            assert.strictEqual(lib.apiBaseUrl(' ' + FREE_KEY + ' '), 'https://api-free.deepl.com');
            assert.strictEqual(lib.apiBaseUrl(PRO_KEY), 'https://api.deepl.com');
            assert.strictEqual(lib.apiBaseUrl(undefined), 'https://api.deepl.com');
        });
    });

    describe('lib.apiRequest', function() {

        it('sends the DeepL-Auth-Key header to the host of the plan', async function() {

            const context = createContext();
            context.httpRequest.resolves({ data: {} });
            await lib.apiRequest(context, { path: '/v2/usage' });
            const options = context.httpRequest.firstCall.args[0];
            assert.strictEqual(options.url, 'https://api-free.deepl.com/v2/usage');
            assert.strictEqual(options.headers.Authorization, 'DeepL-Auth-Key ' + FREE_KEY);
        });

        it('turns a used-up quota (456) into a CancelError with DeepL\'s message', async function() {

            const context = createContext();
            context.httpRequest.rejects(httpError(456, { message: 'Quota exceeded' }));
            await assert.rejects(lib.apiRequest(context, { path: '/v2/translate' }), (err) => {
                assert(err instanceof CancelError);
                assert.match(err.message, /quota.*456.*Quota exceeded/);
                return true;
            });
        });

        it('keeps 429 and 5xx retryable', async function() {

            for (const status of [429, 503]) {
                const context = createContext();
                context.httpRequest.rejects(httpError(status, { message: 'busy' }));
                await assert.rejects(lib.apiRequest(context, { path: '/v2/usage' }), (err) => {
                    assert(!(err instanceof CancelError), String(status));
                    return true;
                });
            }
        });
    });

    describe('lib.resolveApiUrl', function() {

        it('accepts paths and full URLs on the API host of the plan', function() {

            const context = createContext();
            assert.strictEqual(lib.resolveApiUrl(context, '/v2/usage'), 'https://api-free.deepl.com/v2/usage');
            assert.strictEqual(lib.resolveApiUrl(context, 'v3/glossaries'), 'https://api-free.deepl.com/v3/glossaries');
            assert.strictEqual(
                lib.resolveApiUrl(context, 'https://api-free.deepl.com/v2/usage'),
                'https://api-free.deepl.com/v2/usage'
            );
        });

        it('rejects other hosts, the other plan\'s host, credentials and protocol-relative URLs', function() {

            const context = createContext();
            for (const url of [
                'https://evil.example/v2/usage', '//evil.example/v2/usage', 'https://api.deepl.com/v2/usage',
                'https://user:pass@api-free.deepl.com/v2/usage', 'http://api-free.deepl.com/v2/usage',
                'https://api-free.deepl.com.evil.example/v2/usage'
            ]) {
                assert.throws(() => lib.resolveApiUrl(context, url), CancelError, url);
            }
        });
    });

    describe('lib helpers', function() {

        it('kvToObject reads the Designer\'s JSON object string and {key, value} rows', function() {

            assert.deepStrictEqual(lib.kvToObject('{"resource":"glossary"}'), { resource: 'glossary' });
            assert.deepStrictEqual(lib.kvToObject([{ key: 'a', value: '1' }]), { a: '1' });
            assert.deepStrictEqual(lib.kvToObject(''), {});
        });

        it('normalizeEntries accepts a typed \\t for a tab', function() {

            assert.strictEqual(lib.normalizeEntries('Hello\\tHallo\r\nWorld\tWelt\n'), 'Hello\tHallo\nWorld\tWelt');
        });
    });

    describe('auth', function() {

        it('validates the key against /v2/usage of the plan', async function() {

            const context = { apiKey: PRO_KEY, httpRequest: sinon.stub().resolves({ data: {} }) };
            assert.strictEqual(await auth.definition.validate(context), true);
            assert.strictEqual(context.httpRequest.firstCall.args[0].url, 'https://api.deepl.com/v2/usage');
        });

        it('reports a wrong key as invalid', async function() {

            const context = { apiKey: PRO_KEY, httpRequest: sinon.stub().rejects(httpError(403, {})) };
            await assert.rejects(auth.definition.validate(context), /Invalid DeepL API key/);
        });

        it('labels the account with the plan and a masked key', async function() {

            const profile = await auth.definition.requestProfileInfo({ apiKey: FREE_KEY });
            assert.strictEqual(profile.plan, 'DeepL API Free');
            assert(!profile.name.includes(FREE_KEY));
        });
    });

    describe('TranslateText', function() {

        it('posts a JSON body with upper-case language codes and sends the first translation', async function() {

            const context = createContext();
            context.messages.in.content = { text: 'Hello', targetLang: 'de', sourceLang: 'en', glossaryId: 'g-1', formality: 'more' };
            context.httpRequest.resolves({ data: { translations: [{ text: 'Hallo', detected_source_language: 'EN' }] } });
            await load('TranslateText').receive(context);
            const options = context.httpRequest.firstCall.args[0];
            assert.strictEqual(options.method, 'POST');
            assert.strictEqual(options.url, 'https://api-free.deepl.com/v2/translate');
            assert.deepStrictEqual(options.data, {
                text: ['Hello'], target_lang: 'DE', source_lang: 'EN', show_billed_characters: true,
                glossary_id: 'g-1', formality: 'more'
            });
            assert.deepStrictEqual(context.sent, [{ data: { text: 'Hallo', detected_source_language: 'EN' }, port: 'out' }]);
        });

        it('requires a source language with a glossary', async function() {

            const context = createContext();
            context.messages.in.content = { text: 'Hello', targetLang: 'DE', glossaryId: 'g-1' };
            await assert.rejects(load('TranslateText').receive(context), CancelError);
            assert(context.httpRequest.notCalled);
        });
    });

    describe('ImproveText', function() {

        it('refuses a writing style and a tone together', async function() {

            const context = createContext();
            context.messages.in.content = { text: 'x', writingStyle: 'business', tone: 'friendly' };
            await assert.rejects(load('ImproveText').receive(context), CancelError);
            assert(context.httpRequest.notCalled);
        });
    });

    describe('TranslateDocument', function() {

        const component = load('TranslateDocument');

        it('uploads the file as multipart and schedules the first status check', async function() {

            const context = createContext();
            context.messages.in.content = { fileId: 'file-in', targetLang: 'de', timeoutMinutes: 5 };
            context.httpRequest.resolves({ data: { document_id: 'DOC', document_key: 'KEY' } });
            await component.receive(context);

            const options = context.httpRequest.firstCall.args[0];
            assert.strictEqual(options.url, 'https://api-free.deepl.com/v2/document');
            assert.match(options.headers['Content-Type'], /^multipart\/form-data; boundary=/);
            const body = options.data.toString();
            assert.match(body, /name="target_lang"\r\n\r\nDE\r\n/);
            assert.match(body, /name="file"; filename="report.txt"/);
            assert.match(body, /Hello world/);
            assert(!/source_lang/.test(body));

            const [job, delay] = context.setTimeout.firstCall.args;
            assert.strictEqual(delay, 60000);
            assert.strictEqual(job.documentId, 'DOC');
            assert.strictEqual(job.documentKey, 'KEY');
            assert.strictEqual(job.fileName, 'report_DE.txt');
            assert(context.sendJson.notCalled);
        });

        it('checks again while DeepL is translating', async function() {

            const context = createContext({ messages: { timeout: { content: {
                documentId: 'DOC', documentKey: 'KEY', fileName: 'report_DE.txt', targetLang: 'DE',
                timeoutMinutes: 5, deadline: Date.now() + 60000
            } } } });
            context.httpRequest.resolves({ data: { document_id: 'DOC', status: 'translating' } });
            await component.receive(context);
            assert.strictEqual(context.setTimeout.callCount, 1);
            assert.deepStrictEqual(context.httpRequest.firstCall.args[0].data, { document_key: 'KEY' });
        });

        it('downloads and saves the result when done', async function() {

            const context = createContext({ messages: { timeout: { content: {
                documentId: 'DOC', documentKey: 'KEY', fileName: 'report_DE.txt', targetLang: 'DE',
                timeoutMinutes: 5, deadline: Date.now() + 60000
            } } } });
            context.httpRequest.onFirstCall().resolves({ data: { document_id: 'DOC', status: 'done', billed_characters: 11 } });
            context.httpRequest.onSecondCall().resolves({ data: Buffer.from('Hallo Welt') });
            await component.receive(context);

            const download = context.httpRequest.secondCall.args[0];
            assert.strictEqual(download.url, 'https://api-free.deepl.com/v2/document/DOC/result');
            assert.strictEqual(download.responseType, 'arraybuffer');
            assert.strictEqual(context.saveFileStream.firstCall.args[0], 'report_DE.txt');
            assert.deepStrictEqual(context.sent, [{ port: 'out', data: {
                fileId: 'file-out', fileName: 'report_DE.txt', fileSize: 10, documentId: 'DOC',
                billedCharacters: 11, targetLang: 'DE'
            } }]);
        });

        it('fails with DeepL\'s message on error, and after the deadline', async function() {

            const job = { documentId: 'DOC', documentKey: 'KEY', fileName: 'a_DE.txt', targetLang: 'DE', timeoutMinutes: 1 };
            const later = Date.now() + 60000;
            let context = createContext({ messages: { timeout: { content: { ...job, deadline: later } } } });
            context.httpRequest.resolves({ data: { status: 'error', error_message: 'Unsupported file' } });
            await assert.rejects(component.receive(context), /Unsupported file/);

            context = createContext({ messages: { timeout: { content: { ...job, deadline: Date.now() - 1 } } } });
            context.httpRequest.resolves({ data: { status: 'queued' } });
            await assert.rejects(component.receive(context), /within 1 minutes/);
            assert(context.setTimeout.notCalled);
        });

        it('names the translated file after the output format', function() {

            assert.strictEqual(component.translatedFileName('report.pdf', 'DE', 'docx'), 'report_DE.docx');
            assert.strictEqual(component.translatedFileName('report.pdf', 'DE'), 'report_DE.pdf');
        });
    });

    describe('FindGlossaries', function() {

        it('filters by name and reports notFound', async function() {

            const context = createContext();
            context.messages.in.content = { name: 'product', outputType: 'array' };
            context.httpRequest.resolves({ data: { glossaries: [
                { glossary_id: '1', name: 'Product terms' }, { glossary_id: '2', name: 'Legal' }
            ] } });
            await load('FindGlossaries').receive(context);
            assert.deepStrictEqual(context.sent[0], { port: 'out', data: { result: [{ glossary_id: '1', name: 'Product terms' }], count: 1 } });

            const empty = createContext();
            empty.messages.in.content = { name: 'nothing', outputType: 'array' };
            empty.httpRequest.resolves({ data: { glossaries: [] } });
            await load('FindGlossaries').receive(empty);
            assert.strictEqual(empty.sent[0].port, 'notFound');
        });
    });

    describe('UpdateGlossary', function() {

        it('patches the name and one dictionary', async function() {

            const context = createContext();
            context.messages.in.content = {
                glossaryId: 'g 1', name: 'New', sourceLang: 'en', targetLang: 'de', entries: 'a\\tb'
            };
            context.httpRequest.resolves({ data: {} });
            await load('UpdateGlossary').receive(context);
            const options = context.httpRequest.firstCall.args[0];
            assert.strictEqual(options.method, 'PATCH');
            assert.strictEqual(options.url, 'https://api-free.deepl.com/v3/glossaries/g%201');
            assert.deepStrictEqual(options.data, {
                name: 'New',
                dictionaries: [{ source_lang: 'en', target_lang: 'de', entries: 'a\tb', entries_format: 'tsv' }]
            });
            assert.deepStrictEqual(context.sent, [{ port: 'out', data: {} }]);
        });
    });

    describe('MakeApiCall', function() {

        it('never sends the key to another host', async function() {

            const context = createContext();
            context.messages.in.content = { url: 'https://evil.example/x', method: 'GET' };
            await assert.rejects(load('MakeApiCall').receive(context), CancelError);
            assert(context.httpRequest.notCalled);
        });

        it('passes the query parameters the Designer stores', async function() {

            const context = createContext();
            context.messages.in.content = { url: '/v3/languages', method: 'GET', parameters: '{"resource":"glossary"}' };
            context.httpRequest.resolves({ status: 200, headers: {}, data: [] });
            await load('MakeApiCall').receive(context);
            assert.deepStrictEqual(context.httpRequest.firstCall.args[0].params, { resource: 'glossary' });
        });
    });
});
