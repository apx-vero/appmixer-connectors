'use strict';
const { makeRequest } = require('../../commons');

const MINOR_VERSION = 75;
// QuickBooks rejects an update whose SyncToken is no longer current (the invoice changed in between).
const STALE_OBJECT_ERROR = '5010';

const isSet = value => value !== undefined && value !== null && value !== '';

const buildChanges = (context, content) => {

    const changes = {};

    if (isSet(content.dueDate)) changes.DueDate = content.dueDate;
    if (isSet(content.txnDate)) changes.TxnDate = content.txnDate;
    if (isSet(content.docNumber)) changes.DocNumber = content.docNumber;
    if (isSet(content.billEmail)) changes.BillEmail = { Address: content.billEmail };
    if (isSet(content.customerMemo)) changes.CustomerMemo = { value: content.customerMemo };
    if (isSet(content.privateNote)) changes.PrivateNote = content.privateNote;

    if (isSet(content.lineItemsJSON)) {
        let lines;
        try {
            lines = typeof content.lineItemsJSON === 'string' ? JSON.parse(content.lineItemsJSON) : content.lineItemsJSON;
        } catch (e) {
            throw new context.CancelError('Invalid JSON in "Line Items JSON".');
        }
        if (!Array.isArray(lines) || lines.length === 0) {
            throw new context.CancelError('"Line Items JSON" must be a non-empty JSON array of invoice lines.');
        }
        changes.Line = lines;
    }

    return changes;
};

const getSyncToken = async (context, invoiceId) => {

    const { data } = await makeRequest({
        context,
        options: {
            path: `v3/company/${context.profileInfo.companyId}/invoice/${encodeURIComponent(invoiceId)}?minorversion=${MINOR_VERSION}`,
            method: 'GET'
        }
    });
    if (!data?.Invoice) {
        throw new context.CancelError(`Invoice ${invoiceId} not found.`);
    }
    return data.Invoice.SyncToken;
};

const sparseUpdate = async (context, invoiceId, changes) => {

    const syncToken = await getSyncToken(context, invoiceId);
    return makeRequest({
        context,
        options: {
            path: `v3/company/${context.profileInfo.companyId}/invoice?minorversion=${MINOR_VERSION}`,
            method: 'POST',
            data: { ...changes, Id: invoiceId, SyncToken: syncToken, sparse: true }
        }
    });
};

module.exports = {

    async receive(context) {

        const content = context.messages.in.content;
        const invoiceId = isSet(content.invoiceId) ? String(content.invoiceId) : '';

        if (!invoiceId) {
            throw new context.CancelError('Invoice ID is required!');
        }

        const changes = buildChanges(context, content);
        if (Object.keys(changes).length === 0) {
            throw new context.CancelError('Nothing to update. Fill in at least one field to change.');
        }

        try {
            await sparseUpdate(context, invoiceId, changes);
        } catch (err) {
            if (err?.Fault?.Error?.[0]?.code !== STALE_OBJECT_ERROR) {
                throw err;
            }
            // Changed between our read and write: read the new SyncToken and try once more.
            await context.log({ step: 'Stale SyncToken, retrying with a fresh one', invoiceId });
            await sparseUpdate(context, invoiceId, changes);
        }

        return context.sendJson({}, 'out');
    }
};
