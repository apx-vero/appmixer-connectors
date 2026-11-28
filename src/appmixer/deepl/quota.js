'use strict';

// DeepL does not publish fixed request limits: it answers 429 Too Many Requests when a key
// sends too much and asks clients to retry with backoff (developers.deepl.com, "Access and
// authentication"). Throttle every user to a steady rate and queue the overflow, so bursts
// from a flow do not turn into 429s.
module.exports = {

    rules: [
        {
            limit: 10,
            window: 1000,
            throttling: 'window-sliding',
            queueing: 'fifo',
            resource: 'requests',
            scope: 'userId'
        }
    ]
};
