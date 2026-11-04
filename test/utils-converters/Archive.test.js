'use strict';

const assert = require('assert');
const path = require('path');
const { Readable } = require('stream');

const CONVERTERS = path.join(__dirname, '../../src/appmixer/utils/converters');
const archiver = require(path.join(CONVERTERS, 'node_modules/archiver'));
const { Open } = require(path.join(CONVERTERS, 'node_modules/unzipper'));
const Archive = require(path.join(CONVERTERS, 'Archive/Archive.js'));

async function streamToBuffer(stream) {

    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function createZip(entries) {

    const archive = archiver('zip');
    const result = streamToBuffer(archive);
    entries.forEach(({ name, content, type }) => {
        archive.append(type === 'directory' ? null : content, { name, type });
    });
    archive.finalize();
    return result;
}

async function readZip(buffer) {

    const directory = await Open.buffer(buffer);
    const result = {};
    for (const entry of directory.files) {
        result[entry.path] = entry.type === 'Directory' ? null : (await entry.buffer()).toString();
    }
    return result;
}

function createContext(files, input) {

    const saved = {};
    const context = {
        config: {},
        messages: { in: { content: input } },
        getFileReadStream: async (fileId) => Readable.from([files[fileId].content]),
        getFileInfo: async (fileId) => ({ filename: files[fileId].filename }),
        lock: async () => ({ unlock() {} }),
        replaceFileStream: async (fileId, stream) => {
            saved[fileId] = await streamToBuffer(stream);
            return { metadata: { fileId } };
        },
        saveFileStream: async (filename, stream) => {
            saved.new = await streamToBuffer(stream);
            return { metadata: { fileId: 'new' } };
        },
        sendJson: (data, port) => {
            context.output = { data, port };
        }
    };
    context.saved = saved;
    return context;
}

describe('utils.converters.Archive', function() {

    this.timeout(10000);

    it('appends files to an existing zip', async function() {

        const big = 'x'.repeat(2 * 1024 * 1024);
        const existing = await createZip([
            { name: 'a.txt', content: 'hello a' },
            { name: 'sub/', type: 'directory' },
            { name: 'sub/b.txt', content: 'hello b' },
            { name: 'big.txt', content: big }
        ]);
        const files = {
            archive: { filename: 'archive.zip', content: existing },
            file1: { filename: 'new.txt', content: Buffer.from('new file') }
        };
        const context = createContext(files, {
            outputFormat: 'zip',
            fileName: 'archive.zip',
            archiveFileID: 'archive',
            files: { AND: [{ fileId: 'file1' }] }
        });

        await Archive.receive(context);

        assert.deepStrictEqual(context.output, { data: { fileId: 'archive', fileName: 'archive.zip' }, port: 'out' });
        const entries = await readZip(context.saved.archive);
        assert.deepStrictEqual(Object.keys(entries).sort(), ['a.txt', 'big.txt', 'new.txt', 'sub/', 'sub/b.txt']);
        assert.strictEqual(entries['a.txt'], 'hello a');
        assert.strictEqual(entries['sub/b.txt'], 'hello b');
        assert.strictEqual(entries['big.txt'], big);
        assert.strictEqual(entries['new.txt'], 'new file');
    });

    it('creates a new zip', async function() {

        const files = { file1: { filename: 'new.txt', content: Buffer.from('new file') } };
        const context = createContext(files, {
            outputFormat: 'zip',
            fileName: 'out.zip',
            files: { AND: [{ fileId: 'file1' }] }
        });

        await Archive.receive(context);

        assert.deepStrictEqual(context.output, { data: { fileId: 'new', fileName: 'out.zip' }, port: 'out' });
        assert.deepStrictEqual(await readZip(context.saved.new), { 'new.txt': 'new file' });
    });
});
