'use strict';

const TENANT = 'common';

module.exports = {

    type: 'oauth2',

    definition: {

        scope: [
            'offline_access',
            'https://analysis.windows.net/powerbi/api/Dataset.Read.All',
            'https://analysis.windows.net/powerbi/api/Dataset.ReadWrite.All',
            'https://analysis.windows.net/powerbi/api/Dashboard.Read.All',
            'https://analysis.windows.net/powerbi/api/Report.Read.All',
            'https://analysis.windows.net/powerbi/api/Group.Read.All'
        ],

        scopeDelimiter: ' ',

        authUrl: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`,

        requestAccessToken: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,

        refreshAccessToken: `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,

        accountNameFromProfileInfo: (context) => {
            const { profileInfo } = context;
            return profileInfo.displayName || profileInfo.userPrincipalName || 'Power BI User';
        },

        emailFromProfileInfo: 'mail',

        requestProfileInfo: 'https://graph.microsoft.com/v1.0/me',

        validateAccessToken: {
            method: 'GET',
            url: 'https://api.powerbi.com/v1.0/myorg/datasets',
            auth: {
                bearer: '{{accessToken}}'
            }
        }
    }
};
