'use strict';
const axios = require('axios');

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

module.exports = {

    type: 'oauth2',

    definition: () => {

        return {

            accountNameFromProfileInfo: 'displayName',

            authUrl: context => {

                const params = new URLSearchParams({
                    client_id: context.clientId,
                    response_type: 'code',
                    redirect_uri: context.callbackUrl,
                    response_mode: 'query',
                    scope: [
                        'offline_access',
                        'https://analysis.windows.net/powerbi/api/Dataset.Read.All',
                        'https://analysis.windows.net/powerbi/api/Dataset.ReadWrite.All',
                        'https://analysis.windows.net/powerbi/api/Dashboard.Read.All',
                        'https://analysis.windows.net/powerbi/api/Report.Read.All',
                        'https://analysis.windows.net/powerbi/api/Group.Read.All'
                    ].join(' '),
                    state: context.ticket
                });
                return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
            },

            requestAccessToken: async context => {

                const params = new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: context.authorizationCode,
                    redirect_uri: context.callbackUrl,
                    client_id: context.clientId,
                    client_secret: context.clientSecret
                });

                const response = await axios.post(TOKEN_URL, params.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });

                if (!response.data || !response.data.access_token) {
                    throw new Error('Failed to obtain access token from Microsoft.');
                }

                return {
                    accessToken: response.data.access_token,
                    refreshToken: response.data.refresh_token || null
                };
            },

            refreshAccessToken: async context => {

                const params = new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: context.refreshToken,
                    client_id: context.clientId,
                    client_secret: context.clientSecret
                });

                const response = await axios.post(TOKEN_URL, params.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });

                if (!response.data || !response.data.access_token) {
                    throw new Error('Failed to refresh access token.');
                }

                return {
                    accessToken: response.data.access_token,
                    refreshToken: response.data.refresh_token || context.refreshToken
                };
            },

            requestProfileInfo: async context => {

                // First try Microsoft Graph to get user display name
                try {
                    const graphResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
                        headers: { 'Authorization': `Bearer ${context.accessToken}` }
                    });
                    return {
                        displayName: graphResponse.data.displayName
                            || graphResponse.data.userPrincipalName
                            || 'Power BI User'
                    };
                } catch (e) {
                    // Fallback: use Power BI API to confirm auth is working
                    return { displayName: 'Power BI User' };
                }
            },

            validateAccessToken: async context => {

                try {
                    await axios.get('https://api.powerbi.com/v1.0/myorg/datasets', {
                        headers: { 'Authorization': `Bearer ${context.accessToken}` }
                    });
                } catch (err) {
                    if (err.response && err.response.status === 401) {
                        throw new context.InvalidTokenError(err.message);
                    }
                    throw err;
                }
            }
        };
    }
};
