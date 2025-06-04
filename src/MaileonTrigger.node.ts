import {
    IHookFunctions,
    IWebhookFunctions,
    INodeType,
    INodeTypeDescription,
    INodeExecutionData,
    IWebhookResponseData,
    IHttpRequestOptions,
} from 'n8n-workflow';

export class MaileonTrigger implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Maileon',
        name: 'maileon',
        icon: 'file:maileon-logo.png',
        group: ['trigger'],
        version: 1,
        description: 'Triggers workflow on Maileon (Maileon) webhook events',
        defaults: {
            name: 'Maileon',
        },
        inputs: [],
        outputs: ['main'],
        credentials: [
            {
                name: 'MaileonApi',
                required: true,
            },
        ],
        webhooks: [
            {
                name: 'default',
                httpMethod: 'POST',
                responseMode: 'onReceived',
                path: 'maileon',
            },
        ],
        properties: [
            {
                displayName: 'Event Type',
                name: 'eventType',
                type: 'options',
                options: [
                    {
                        name: 'Double Opt-In Confirmation',
                        value: 'doi',
                    },
                    {
                        name: 'Unsubscribe',
                        value: 'unsubscription',
                    },
                    {
                        name: 'Bounce',
                        value: 'bounce',
                    },
                ],
                default: 'doi',
                description: 'The type of event to listen for',
            },
        ],
    };

    webhookMethods = {
        default: {
            async checkExists(this: IHookFunctions): Promise<boolean> {
                const credentials = await this.getCredentials('MaileonApi');
                const webhookUrl = this.getNodeWebhookUrl('default');

                const eventType = this.getNodeParameter('eventType') as string;

                const options: IHttpRequestOptions = {
                    method: 'GET',
                    url: 'https://api.maileon.com/1.0/webhooks',
                    headers: {
                        Authorization: `Basic ${credentials.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    json: true,
                };

                const webhooks = await this.helpers.httpRequest(options);

                for (const webhook of webhooks) {
                    if (
                        webhook.url === webhookUrl &&
                        webhook.event === eventType
                    ) {
                        const staticData = this.getWorkflowStaticData('node');
                        staticData.webhookId = webhook.id;
                        return true;
                    }
                }

                return false;
            },

            async create(this: IHookFunctions): Promise<boolean> {
                const credentials = await this.getCredentials('MaileonApi');
                const webhookUrl = this.getNodeWebhookUrl('default');
                const eventType = this.getNodeParameter('eventType') as string;
                const options: IHttpRequestOptions = {
                    method: 'POST',
                    url: 'https://api.maileon.com/1.0/webhooks',
                    headers: {
                        Authorization: `Basic ${credentials.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: {
                        event: eventType,
                        url: webhookUrl,
                        standardFields: [
                            "email",
                            "external_id"
                        ],
                    },
                    json: true,
                };

                const response = await this.helpers.httpRequest(options);
                const staticData = this.getWorkflowStaticData('node');
                staticData.webhookId = response.id;

                return true;
            },

            async delete(this: IHookFunctions): Promise<boolean> {
                const credentials = await this.getCredentials('MaileonApi');
                const staticData = this.getWorkflowStaticData('node');
                const webhookId = staticData.webhookId;

                if (!webhookId) return true;

                const options: IHttpRequestOptions = {
                    method: 'DELETE',
                    url: `https://api.maileon.com/1.0/webhooks/${webhookId}`,
                    headers: {
                        Authorization: `Basic ${credentials.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    json: true,
                };

                await this.helpers.httpRequest(options);
                delete staticData.webhookId;
                return true;
            },
        },
    };

    async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
        const req = this.getRequestObject();
        const body = req.body as Record<string, any>;
        const eventType = this.getNodeParameter('eventType') as string;

        return {
            workflowData: [
                [
                    {
                        json: {
                            eventType,
                            receivedAt: new Date().toISOString(),
                            ...body,
                        },
                    },
                ],
            ],
        };
    }
}
