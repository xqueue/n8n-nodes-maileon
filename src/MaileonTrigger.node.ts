import {
    IHookFunctions,
    IWebhookFunctions,
    INodeType,
    INodeTypeDescription,
    IWebhookResponseData,
    IHttpRequestOptions,
    NodeConnectionTypes,
} from 'n8n-workflow';

export class MaileonTrigger implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Maileon Trigger',
        name: 'maileonTrigger',
        icon: {
            light: 'file:maileon-logo.svg',
            dark: 'file:maileon-logo-dark.svg',
        },
        group: ['trigger'],
        version: 1,
        subtitle: '={{$parameter["eventType"]}}',
        description: 'Triggers workflow on Maileon webhook events',
        defaults: {
            name: 'Maileon Trigger',
        },
        usableAsTool: true,
        inputs: [],
        outputs: [NodeConnectionTypes.Main],
        credentials: [
            {
                name: 'maileonApi',
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
                        name: 'Bounce',
                        value: 'bounce',
                    },
                    {
                        name: 'Double Opt-In Confirmation',
                        value: 'doi',
                    },
                    {
                        name: 'Unsubscribe',
                        value: 'unsubscription',
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
                const webhookUrl = this.getNodeWebhookUrl('default');

                const eventType = this.getNodeParameter('eventType') as string;

                const options: IHttpRequestOptions = {
                    method: 'GET',
                    url: 'https://api.maileon.com/1.0/webhooks',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    json: true,
                };

                const webhooks = await this.helpers.httpRequestWithAuthentication.call(
                    this,
                    'maileonApi',
                    options,
                );

                for (const webhook of webhooks) {
                    if (webhook.url === webhookUrl && webhook.event === eventType) {
                        const staticData = this.getWorkflowStaticData('node');
                        staticData.webhookId = webhook.id;
                        return true;
                    }
                }

                return false;
            },

            async create(this: IHookFunctions): Promise<boolean> {
                const webhookUrl = this.getNodeWebhookUrl('default');
                const eventType = this.getNodeParameter('eventType') as string;
                const options: IHttpRequestOptions = {
                    method: 'POST',
                    url: 'https://api.maileon.com/1.0/webhooks',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: {
                        event: eventType,
                        url: webhookUrl,
                        standardFields: ['email', 'external_id'],
                    },
                    json: true,
                };

                const response = await this.helpers.httpRequestWithAuthentication.call(
                    this,
                    'maileonApi',
                    options,
                );
                const staticData = this.getWorkflowStaticData('node');
                staticData.webhookId = response.id;

                return true;
            },

            async delete(this: IHookFunctions): Promise<boolean> {
                const staticData = this.getWorkflowStaticData('node');
                const webhookId = staticData.webhookId;

                if (!webhookId) return true;

                const options: IHttpRequestOptions = {
                    method: 'DELETE',
                    url: `https://api.maileon.com/1.0/webhooks/${webhookId}`,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    json: true,
                };

                await this.helpers.httpRequestWithAuthentication.call(this, 'maileonApi', options);
                delete staticData.webhookId;
                return true;
            },
        },
    };

    async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
        const req = this.getRequestObject();
        const body = req.body as Record<string, unknown>;
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
