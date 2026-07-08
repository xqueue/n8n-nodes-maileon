import {
    IExecuteFunctions,
    ILoadOptionsFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    JsonObject,
    NodeApiError,
} from 'n8n-workflow';

function decodeXml(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function getTagValue(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return decodeXml(match?.[1]?.trim() ?? '');
}

function getTagBlocks(xml: string, tag: string): string[] {
    return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map((match) => match[1]);
}

function getCustomFieldMap(xml: string): Record<string, string> {
    const customMap: Record<string, string> = {};

    for (const fieldXml of getTagBlocks(xml, 'custom_field')) {
        const name = getTagValue(fieldXml, 'name');
        const type = getTagValue(fieldXml, 'type');

        if (name && type) {
            customMap[name] = type;
        }
    }

    return customMap;
}

function castToType(type: string, value: any): any {
    if (type === 'date') {
        const date = new Date(value);
        if (isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
        return date.toISOString().split('T')[0];
    }

    if (type === 'boolean') {
        return value === 'true' || value === true || value === '1' || value === 1;
    }

    if (type === 'number' || type === 'float') {
        const num = parseFloat(value);
        if (isNaN(num)) throw new Error(`Invalid float: ${value}`);
        return num;
    }

    if (type === 'integer') {
        const num = parseInt(value, 10);
        if (isNaN(num)) throw new Error(`Invalid integer: ${value}`);
        return num;
    }

    if (type === 'json') {
        if (typeof value === 'object' || Array.isArray(value)) {
            return value;
        }

        if (typeof value === 'string') {
            if (value.includes('[object Object]')) {
                throw new Error(`Corrupted JSON-like string: ${value}`);
            }

            try {
                const parsed = JSON.parse(value);
                if (typeof parsed !== 'object') {
                    throw new Error('Parsed JSON is not an object or array');
                }
                return parsed;
            } catch (err) {
                throw new Error(`Invalid JSON string: ${err}`);
            }
        }

        throw new Error(`Unsupported type for JSON casting: ${typeof value}`);
    }

    return value;
}

const defaultContactFields: { [key: string]: string } = {
    ADDRESS: 'string',
    BIRTHDAY: 'date',
    CITY: 'string',
    COUNTRY: 'string',
    FIRSTNAME: 'string',
    GENDER: 'string',
    HNR: 'string',
    LASTNAME: 'string',
    FULLNAME: 'string',
    LOCALE: 'string',
    NAMEDAY: 'date',
    ORGANIZATION: 'string',
    REGION: 'string',
    STATE: 'string',
    SALUTATION: 'string',
    TITLE: 'string',
    ZIP: 'string',
};

export class Maileon implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Maileon',
        name: 'Maileon',
        icon: {
            light:'file:maileon-logo.svg',
            dark:'file:maileon-logo-dark.svg',
        },
        group: ['transform'],
        version: 1,
        description: 'Interact with Maileon API',
        defaults: {
            name: 'Maileon',
        },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [
            {
                name: 'MaileonApi',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                options: [
                    {name: 'Send Contact', value: 'sendContact'},
                    {name: 'Send Contact Event', value: 'sendContactEvent'},
                    {name: 'Unsubscribe Contact', value: 'unsubscribeContact'},
                ],
                default: 'sendContact',
            },
            {
                displayName: 'Email',
                name: 'email',
                type: 'string',
                required: true,
                default: '',
                description: 'The email address of the contact',
                displayOptions: {
                    show: {
                        operation: ['sendContact', 'sendContactEvent', 'unsubscribeContact'],
                    },
                },
            },
            {
                displayName: 'External id',
                name: 'external_id',
                type: 'string',
                default: '',
                description: 'The external id of the contact',
                displayOptions: {
                    show: {
                        operation: ['sendContact', 'sendContactEvent', 'unsubscribeContact'],
                    },
                },
            },
            {
                displayName: 'Mailing ID',
                name: 'mailingId',
                type: 'string',
                default: '',
                description: 'Optional ID of the mailing to associate with the unsubscription',
                displayOptions: {
                    show: {
                        operation: ['unsubscribeContact'],
                    },
                },
            },
            {
                displayName: 'Source',
                name: 'src',
                type: 'string',
                default: '',
                description: 'The source of the contact',
                displayOptions: {
                    show: {
                        operation: ['sendContact', 'sendContactEvent'],
                    },
                },
            },
            {
                displayName: 'Permission',
                name: 'permission',
                type: 'options',
                options: [
                    {name: 'None', value: 1},
                    {name: 'Single Opt-In', value: 2},
                    {name: 'Confirmed Opt-In', value: 3},
                    {name: 'Double Opt-In', value: 4},
                    {name: 'Double Opt-In Plus', value: 5},
                ],
                default: 1,
                displayOptions: {
                    show: {
                        operation: ['sendContact', 'sendContactEvent'],
                    },
                },
            },
            {
                displayName: 'Sync mode',
                name: 'sync_mode',
                type: 'options',
                description: 'Specifies the synchronization option in case a contact with the provided email address already exists',
                options: [
                    {name: 'Update', value: 1},
                    {name: 'Ignore', value: 2},
                ],
                default: 1,
                displayOptions: {
                    show: {
                        operation: ['sendContact', 'sendContactEvent'],
                    },
                },
            },
            {
                displayName: 'Send Double Opt-In',
                name: 'doi',
                type: 'boolean',
                default: false,
                description: 'Only required when permission is set to none',
                displayOptions: {
                    show: {
                        operation: ['sendContact', 'sendContactEvent'],
                        permission: [1],
                    },
                },
            },
            {
                displayName: 'DOI Key',
                name: 'doiKey',
                type: 'string',
                default: '',
                placeholder: 'abc123',
                description: 'Only required when Double Opt-In is enabled and permission is set to none',
                displayOptions: {
                    show: {
                        operation: ['sendContact', 'sendContactEvent'],
                        permission: [1],
                        doi: [true],
                    },
                },
            },
            {
                displayName: 'Contact Field Mapping',
                name: 'contactFieldMapping',
                type: 'fixedCollection',
                typeOptions: {multipleValues: true},
                displayOptions: {
                    show: {
                        operation: ['sendContact', 'sendContactEvent'],
                    },
                },
                options: [
                    {
                        name: 'fields',
                        displayName: 'Fields',
                        values: [
                            {
                                displayName: 'Field Name',
                                name: 'field',
                                type: 'options',
                                typeOptions: {
                                    loadOptionsMethod: 'getContactFields',
                                },
                                default: '',
                            },
                            {
                                displayName: 'Value',
                                name: 'value',
                                type: 'string',
                                default: '',
                            },
                        ],
                    },
                ],
                default: {},
            },
            {
                displayName: 'Event Type',
                name: 'eventType',
                type: 'options',
                typeOptions: {
                    loadOptionsMethod: 'getEventTypes',
                },
                default: '',
                required: true,
                displayOptions: {
                    show: {
                        operation: ['sendContactEvent'],
                    },
                },
            },
            {
                displayName: 'Event Field Mapping',
                name: 'eventFieldMapping',
                type: 'fixedCollection',
                typeOptions: {multipleValues: true},
                displayOptions: {
                    show: {
                        operation: ['sendContactEvent'],
                    },
                },
                options: [
                    {
                        name: 'fields',
                        displayName: 'Fields',
                        values: [
                            {
                                displayName: 'Field Name',
                                name: 'field',
                                type: 'options',
                                typeOptions: {
                                    loadOptionsMethod: 'getEventFields',
                                },
                                default: '',
                            },
                            {
                                displayName: 'Value',
                                name: 'value',
                                type: 'string',
                                default: '',
                            },
                        ],
                    },
                ],
                default: {},
            },
        ],
    };

    methods = {
        loadOptions: {
            async getEventTypes(this: ILoadOptionsFunctions) {
                const credentials = await this.getCredentials('MaileonApi');

                const xmlResponse = await this.helpers.httpRequest({
                    method: 'GET',
                    url: 'https://api.maileon.com/1.0/transactions/types',
                    headers: {
                        Authorization: `Basic ${credentials.apiKey}`,
                    },
                });

                const types = getTagBlocks(xmlResponse, 'transaction_type');

                if (!types.length) return [];

                return types
                    .map((typeXml) => {
                        const name = getTagValue(typeXml, 'name');
                        return {name, value: name};
                    })
                    .filter((type) => type.name);
            },

            async getEventFields(this: ILoadOptionsFunctions) {
                const credentials = await this.getCredentials('MaileonApi');
                const eventTypeKey = this.getNodeParameter('eventType', 0) as string;
                if (!eventTypeKey) throw new Error('Please select an Event Type before mapping fields.');

                const xmlResponse = await this.helpers.httpRequest({
                    method: 'GET',
                    url: `https://api.maileon.com/1.0/transactions/types/${eventTypeKey}`,
                    headers: {
                        Authorization: `Basic ${credentials.apiKey}`,
                    },
                });

                const attributes = getTagBlocks(xmlResponse, 'attribute');

                if (!attributes.length) return [];

                return attributes
                    .map((attrXml) => {
                        const name = getTagValue(attrXml, 'name');
                        const type = getTagValue(attrXml, 'type');
                        const mandatory = getTagValue(attrXml, 'mandatory') || getTagValue(attrXml, 'required');

                        return {
                            name: `${name} (${type})${mandatory === 'true' ? ' *' : ''}`,
                            value: name,
                            description: mandatory === 'true' ? 'Required' : undefined,
                        };
                    })
                    .filter((field) => field.value);
            },

            async getContactFields(this: ILoadOptionsFunctions) {
                const credentials = await this.getCredentials('MaileonApi');
                const xmlResponse = await this.helpers.httpRequest({
                    method: 'GET',
                    url: 'https://api.maileon.com/1.0/contacts/fields/custom',
                    headers: {
                        Authorization: `Basic ${credentials.apiKey}`,
                    },
                });

                const standardOptions = Object.entries(defaultContactFields).map(([key, type]) => ({
                    name: `${key} (standard - ${type})`,
                    value: key,
                }));

                const customOptions = getTagBlocks(xmlResponse, 'custom_field')
                    .map((fieldXml) => {
                        const name = getTagValue(fieldXml, 'name');
                        const type = getTagValue(fieldXml, 'type');

                        return {
                            name: `${name} (custom - ${type})`,
                            value: name,
                        };
                    })
                    .filter((field) => field.value);

                return [...standardOptions, ...customOptions];
            },
        },
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        try {
            const credentials = await this.getCredentials('MaileonApi');

            try {
                await this.helpers.httpRequest({
                    method: 'GET',
                    url: 'https://integrations.maileon.com/xsic/ext/n8n/heartbeat.php',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        Authorization: 'Basic ' + credentials.apiKey,
                    },
                    json: true,
                });
            } catch ($e:string|any) {
							this.logger.error($e);
            }

            const items = this.getInputData();
            const returnData: INodeExecutionData[] = [];
            const apiKey = credentials.apiKey;

            const unsubscribeContact = async (i: number, email: string) => {
                const externalId = this.getNodeParameter('external_id', i, '') as string;
                const mailingId = this.getNodeParameter('mailingId', i, '') as string;

                const queryParams = new URLSearchParams();
                if (mailingId) queryParams.set('mailingId', mailingId);

                const endpointBase = externalId
                    ? `https://api.maileon.com/1.0/contacts/externalid/${encodeURIComponent(externalId)}/unsubscribe`
                    : `https://api.maileon.com/1.0/contacts/email/${encodeURIComponent(email)}/unsubscribe`;

                const url = queryParams.toString() ? `${endpointBase}?${queryParams}` : endpointBase;

                return this.helpers.httpRequest({
                    method: 'DELETE',
                    url,
                    headers: {
                        Authorization: `Basic ${apiKey}`,
                    },
                });
            };

            const upsertContact = async (i: number, email: string) => {
                const fieldMappings = this.getNodeParameter('contactFieldMapping.fields', i, []) as Array<{
                    field: string;
                    value: string;
                }>;

                const customResponse = await this.helpers.httpRequest({
                    method: 'GET',
                    url: 'https://api.maileon.com/1.0/contacts/fields/custom',
                    headers: {Authorization: `Basic ${apiKey}`},
                });

                const customMap = getCustomFieldMap(customResponse);

                const standard_fields: Record<string, any> = {};
                const custom_fields: Record<string, any> = {};

                for (const {field, value} of fieldMappings) {
                    const input = this.evaluateExpression(value, i);
                    if (defaultContactFields[field]) standard_fields[field] = castToType(defaultContactFields[field], input);
                    else if (customMap[field]) custom_fields[field] = castToType(customMap[field], input);
                }

                const permission = this.getNodeParameter('permission', i) as number;
                const sync_mode = this.getNodeParameter('sync_mode', i) as string;

                const doi = permission === 1 ? this.getNodeParameter('doi', i, false) as boolean : false;
                const doiKey = permission === 1 ? this.getNodeParameter('doiKey', i, '') as string : '';

                const queryParams = new URLSearchParams({
                    permission: String(permission),
                    sync_mode,
                });

                if (doi) queryParams.set('doi', 'true');
                if (doi) queryParams.set('doiplus', 'true');
                if (doiKey) queryParams.set('doimailing', doiKey);

                const externalId = this.getNodeParameter('external_id', i) as string;

                const url = externalId
                    ? `https://api.maileon.com/1.0/contacts/externalid/${encodeURIComponent(externalId)}?${queryParams}`
                    : `https://api.maileon.com/1.0/contacts/email/${encodeURIComponent(email)}?${queryParams}`;

                return this.helpers.httpRequest({
                    method: 'POST',
                    url,
                    headers: {Authorization: `Basic ${apiKey}`, 'Content-Type': 'application/vnd.maileon.api+json'},
                    body: {email, standard_fields, custom_fields},
                    json: true,
                });
            };

            for (let i = 0; i < items.length; i++) {
                const operation = this.getNodeParameter('operation', i) as string;
                const email = this.getNodeParameter('email', i) as string;

                if (operation === 'sendContact') {
                    const res = await upsertContact(i, email);
                    returnData.push({json: res});
                }

                if (operation === 'sendContactEvent') {
                    await upsertContact(i, email);

                    const eventTypeKey = this.getNodeParameter('eventType', i) as string;
                    const fieldMappings = this.getNodeParameter('eventFieldMapping.fields', i, []) as Array<{
                        field: string;
                        value: any;
                    }>;

                    await this.helpers.httpRequest({
                        method: 'GET',
                        url: `https://api.maileon.com/1.0/transactions/types/${eventTypeKey}`,
                        headers: {Authorization: `Basic ${apiKey}`},
                    });

                    const payload: Record<string, any> = {};
                    for (const {field, value} of fieldMappings) {
                        if (!value) continue;
                        payload[field] = typeof value === 'string' ? this.evaluateExpression(value, i) : value;
                    }

                    const attributes = Object.fromEntries(
                        Object.entries(payload).map(([key, value]) => [key, value]),
                    );

                    const res = await this.helpers.httpRequest({
                        method: 'POST',
                        url: 'https://api.maileon.com/1.0/transactions',
                        headers: {Authorization: `Basic ${apiKey}`},
                        body: [
                            {
                                typeName: eventTypeKey,
                                contact: {email},
                                content: attributes,
                            },
                        ],
                        json: true,
                    });

                    const report = res?.reports?.[0];

                    if (!report?.queued) {
                        throw new NodeApiError(this.getNode(), report, {
                            message: report?.message || 'Failed to queue Maileon transaction.',
                        });
                    }
                    returnData.push({json: res});
                }

                if (operation === 'unsubscribeContact') {
                    const res = await unsubscribeContact(i, email);
                    returnData.push({json: {success: true, message: 'Unsubscribed successfully', response: res}});
                }
            }

            return [returnData];
        } catch (error) {
            throw new NodeApiError(this.getNode(), error as JsonObject, {
                message: (error as Error)?.message || 'Unknown error occurred',
            });
        }
    }
}