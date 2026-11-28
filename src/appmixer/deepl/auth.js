'use strict';

const lib = require('./lib');

// DeepL authenticates every request with "Authorization: DeepL-Auth-Key <key>". A DeepL API
// Free key ends in ":fx" and is served by api-free.deepl.com, a Pro key by api.deepl.com;
// lib.apiBaseUrl() picks the host from the key, so the user enters the key only.
module.exports = {

    type: 'apiKey',

    definition: {

        auth: {
            apiKey: {
                type: 'password',
                name: 'API Key',
                tooltip: 'Copy your key from the <a href="https://www.deepl.com/your-account/keys" target="_blank">API Keys</a> tab of your DeepL account. Both DeepL API Free keys (ending in <code>:fx</code>) and Pro keys work.'
            }
        },

        accountNameFromProfileInfo: 'name',

        requestProfileInfo: async context => {

            // DeepL has no profile endpoint: label the account with the plan and the masked key.
            const apiKey = (context.apiKey || '').trim();
            const plan = lib.apiBaseUrl(apiKey) === lib.API_FREE_URL ? 'DeepL API Free' : 'DeepL API Pro';
            const masked = apiKey.length > 12 ? apiKey.slice(0, 4) + '...' + apiKey.slice(-6) : 'API key';
            return { name: plan + ' (' + masked + ')', plan };
        },

        validate: async context => {

            // GET /v2/usage is free of charge and answers 403 for a wrong key (or a key sent to
            // the host of the other plan).
            try {
                await context.httpRequest({
                    method: 'GET',
                    url: lib.apiBaseUrl(context.apiKey) + '/v2/usage',
                    headers: lib.keyHeaders(context.apiKey)
                });
            } catch (err) {
                const status = err && err.response && err.response.status;
                if (status === 401 || status === 403) {
                    throw new Error('Invalid DeepL API key. Copy the key from the API Keys tab of your DeepL account.');
                }
                throw err;
            }
            return true;
        }
    }
};
