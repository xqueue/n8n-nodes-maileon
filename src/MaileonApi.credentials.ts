import {
    ICredentialType,
    ICredentialTestFunctions,
    INodeProperties,
    IDataObject,
    IHttpRequestOptions,
} from 'n8n-workflow';

export class MaileonApi implements ICredentialType {
    name = 'MaileonApi';
    displayName = 'Maileon API';
    documentationUrl = 'https://xqueue.atlassian.net/wiki/spaces/MSI/pages/450822148/n8n.io';

    properties: INodeProperties[] = [
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            default: '',
            required: true,
        },
    ];

    async authenticate(this: ICredentialTestFunctions, credentials: IDataObject): Promise<IHttpRequestOptions> {
        return {
            url: 'https://api.maileon.com/1.0/ping',
            method: 'GET',
            headers: {
                Authorization: `Basic ${credentials.apiKey as string}`,
            },
        };
    }



}
