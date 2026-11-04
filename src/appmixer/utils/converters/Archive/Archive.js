'use strict';
const archiver = require('archiver');
const { Open } = require('unzipper');
const tar = require('tar');
const Stream = require('stream');
const Promise = require('bluebird');

/**
 * Read a whole stream into a Buffer.
 * @param {Stream.Readable} stream
 * @returns {Promise<Buffer>}
 */
async function streamToBuffer(stream) {

    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

/**
 * Append all entries of an existing zip (as a Buffer) to the archive.
 * Reads the zip through its central directory (unzipper Open.buffer) instead of
 * async-iterating unzipper's Parse stream, which fails with "Premature close".
 * @param {Object} archive archiver instance
 * @param {Buffer} zipBuffer
 */
async function appendZipEntries(archive, zipBuffer) {

    const directory = await Open.buffer(zipBuffer);
    for (const entry of directory.files) {
        const data = { name: entry.path };
        if (entry.lastModifiedDateTime instanceof Date && !isNaN(entry.lastModifiedDateTime)) {
            data.date = entry.lastModifiedDateTime;
        }
        if (entry.type === 'Directory') {
            archive.append(null, { ...data, type: 'directory' });
        } else {
            archive.append(await entry.buffer(), data);
        }
    }
}

module.exports = {

    async receive(context) {

        const { outputFormat, fileName, archiveFileID, files } = context.messages.in.content;
        if (!outputFormat) {
            throw new context.CancelError('Output Format is required!');
        }
        if (!fileName) {
            throw new context.CancelError('File Name is required!');
        }
        const archive = archiver(outputFormat);
        archive.on('error', (err) => {
            throw err;
        });
        const streamPassThrough = new Stream.PassThrough();
        archive.pipe(streamPassThrough);
        const filesList = files?.AND || [];
        const promises = filesList?.map(async (file) => {
            const readStream = await context.getFileReadStream(file.fileId);
            const fileInfo = await context.getFileInfo(file.fileId);
            archive.append(readStream, {
                'name': fileInfo.filename
            });
        });

        await Promise.all(promises, { concurrency: context.config.archiveConcurrency || 10 });
        let savedFile;

        if (archiveFileID) {
            let lock;
            try {
                lock = await context.lock(archiveFileID, context.config.archiveTTL || 180000);
                const readStream = await context.getFileReadStream(archiveFileID);
                if (outputFormat === 'zip') {
                    const zipBuffer = await streamToBuffer(readStream);
                    await appendZipEntries(archive, zipBuffer);
                    archive.finalize();
                } else if (outputFormat === 'tar') {
                    const tarParser = new tar.Parser();
                    const tarStream = readStream.pipe(tarParser);
                    tarStream.on('entry', async (entry) => {
                        const passThrough = new Stream.PassThrough();
                        entry.pipe(passThrough);
                        archive.append(passThrough, {
                            'name': entry.path
                        });
                    });
                    tarStream.on('end', () => {
                        tarParser.end();
                        archive.finalize();
                    });
                }

                savedFile = await context.replaceFileStream(archiveFileID, streamPassThrough);
            } finally {
                lock?.unlock();
            }
        } else {
            archive.finalize();
            savedFile = await context.saveFileStream(`${fileName}`, streamPassThrough);
        }

        return context.sendJson({
            fileId: savedFile.metadata.fileId,
            fileName
        }, 'out');
    }
};
