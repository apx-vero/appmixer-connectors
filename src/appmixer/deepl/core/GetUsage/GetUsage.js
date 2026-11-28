'use strict';

const lib = require('../../lib');

module.exports = {

    async receive(context) {

        const { data } = await lib.apiRequest(context, { path: '/v2/usage' });
        return context.sendJson(data, 'out');
    }
};
