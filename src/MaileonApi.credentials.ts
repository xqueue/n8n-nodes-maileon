import {
    IAuthenticateGeneric,
    ICredentialTestRequest,
    ICredentialType,
    INodeProperties,
    Icon,
} from 'n8n-workflow';

export class MaileonApi implements ICredentialType {
    name = 'maileonApi';
    displayName = 'Maileon API';
    documentationUrl = 'https://xqueue.atlassian.net/wiki/spaces/MSI/pages/450822148/n8n.io';

    icon: Icon = {
        light: 'file:maileon-logo.svg',
        dark: 'file:maileon-logo-dark.svg',
    };

    properties: INodeProperties[] = [
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            typeOptions: { password: true },
            default: '',
            required: true,
        },
    ];

    authenticate: IAuthenticateGeneric = {
        type: 'generic',
        properties: {
            headers: {
                Authorization: '=Basic {{$credentials.apiKey}}',
            },
        },
    };

    test: ICredentialTestRequest = {
        request: {
            baseURL: 'https://api.maileon.com/1.0',
            url: '/ping',
        },
    };
}
