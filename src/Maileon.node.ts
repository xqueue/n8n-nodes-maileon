import {
    IExecuteFunctions, IHttpRequestOptions,
    ILoadOptionsFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription, JsonObject, NodeApiError,
} from 'n8n-workflow';
import {parseStringPromise} from 'xml2js';

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
            // Prevent common mistake: [object Object],[object Object]
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
                throw new Error(`Invalid JSON string: ${value}`);
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
        icon: 'file:maileon-logo.png',
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
                    {name: 'Unsubscribe Contact', value: 'unsubscribeContact'}
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

                const xmlResponse = await this.helpers.request({
                    method: 'GET',
                    url: 'https://api.maileon.com/1.0/transactions/types',
                    headers: {
                        Authorization: `Basic ${credentials.apiKey}`,
                    },
                });

                const parsed = await parseStringPromise(xmlResponse, {
                    explicitArray: false,
                });

                const types = parsed?.transaction_types?.transaction_type;

                if (!types) return [];

                const list = Array.isArray(types) ? types : [types];

                return list.map((t: any) => ({name: t.name, value: t.name}));
            },

            async getEventFields(this: ILoadOptionsFunctions) {
                const credentials = await this.getCredentials('MaileonApi');
                const eventTypeKey = this.getNodeParameter('eventType', 0) as string;
                if (!eventTypeKey) throw new Error('Please select an Event Type before mapping fields.');

                const xmlResponse = await this.helpers.request({
                    method: 'GET',
                    url: `https://api.maileon.com/1.0/transactions/types/${eventTypeKey}`,
                    headers: {
                        Authorization: `Basic ${credentials.apiKey}`,
                    },
                });

                const parsed = await parseStringPromise(xmlResponse, {explicitArray: false});
                const attributes = parsed?.transaction_type?.attributes?.attribute;

                if (!attributes) return [];
                const list = Array.isArray(attributes) ? attributes : [attributes];

                return list.map((attr: any) => ({
                    name: `${attr.name} (${attr.type})${attr.mandatory === 'true' ? ' *' : ''}`,
                    value: attr.name,
                    description: attr.mandatory === 'true' ? 'Required' : undefined,
                }));
            },

            async getContactFields(this: ILoadOptionsFunctions) {
                const credentials = await this.getCredentials('MaileonApi');
                const xmlResponse = await this.helpers.request({
                    method: 'GET',
                    url: 'https://api.maileon.com/1.0/contacts/fields/custom',
                    headers: {
                        Authorization: `Basic ${credentials.apiKey}`,
                    },
                });

                const parsed = await parseStringPromise(xmlResponse);
                const customFields = parsed.custom_fields?.custom_field ?? [];

                const standardOptions = Object.entries(defaultContactFields).map(([key, type]) => ({
                    name: `${key} (standard - ${type})`,
                    value: key,
                }));

                const customOptions = customFields.map((f: any) => ({
                    name: `${f.name?.[0]} (custom - ${f.type?.[0]})`,
                    value: f.name?.[0],
                }));

                return [...standardOptions, ...customOptions];
            },
        },
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        // console.log("running");
        try {

            const credentials = await this.getCredentials('MaileonApi');

            try {
                await this.helpers.request({
                    method: 'GET',
                    url: 'https://integrations.maileon.com/xsic/ext/n8n/heartbeat.php',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': 'Basic ' + credentials.apiKey,
                    },
                    json: true,
                });
            } catch ($e) {
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

                return this.helpers.request({
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
                    value: string
                }>;

                const customResponse = await this.helpers.request({
                    method: 'GET',
                    url: 'https://api.maileon.com/1.0/contacts/fields/custom',
                    headers: {Authorization: `Basic ${apiKey}`},
                });

                const parsed = await parseStringPromise(customResponse);
                const customFields = parsed.custom_fields?.custom_field ?? [];
                const customMap: Record<string, string> = {};

                customFields.forEach((f: any) => {
                    customMap[f.name?.[0]] = f.type?.[0];
                });

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
                    sync_mode: sync_mode,
                });

                if (doi) queryParams.set('doi', 'true');
                if (doi) queryParams.set('doiplus', 'true');
                if (doiKey) queryParams.set('doimailing', doiKey);

                const externalId = this.getNodeParameter('external_id', i) as string;

                const url = externalId ? `https://api.maileon.com/1.0/contacts/externalid/${encodeURIComponent(externalId)}?${queryParams}` : `https://api.maileon.com/1.0/contacts/email/${encodeURIComponent(email)}?${queryParams}`
                // console.log({'url': url, 'body': {standard_fields, custom_fields}});
                return this.helpers.request({
                    method: 'POST',
                    url: url,
                    headers: {Authorization: `Basic ${apiKey}`, 'Content-Type': 'application/vnd.maileon.api+json'},
                    body: {'email': email, standard_fields, custom_fields},
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
                        value: any
                    }>;

                    const xmlResponse = await this.helpers.request({
                        method: 'GET',
                        url: `https://api.maileon.com/1.0/transactions/types/${eventTypeKey}`,
                        headers: {Authorization: `Basic ${apiKey}`},
                    });

                    const parsed = await parseStringPromise(xmlResponse);


                    const rawAttributes = parsed.transaction_type?.attributes?.[0]?.attribute;
                    const schemaFields = Array.isArray(rawAttributes)
                        ? rawAttributes
                        : rawAttributes
                            ? [rawAttributes]
                            : [];


                    const fieldTypeMap: Record<string, string> = {};
                    schemaFields.forEach((attr: any) => {
                        const key = attr.name?.[0];
                        const type = attr.type?.[0];
                        if (key && type) fieldTypeMap[key] = type;
                    });

                    const payload: Record<string, any> = {};
                    for (const {field, value} of fieldMappings) {
                        if (!value) continue;
                        payload[field] = typeof value === 'string' ? this.evaluateExpression(value, i) : value;
                    }

                    const attributes = Object.fromEntries(
                        Object.entries(payload).map(([key, value]) => [key, value])
                    );

                    const res = await this.helpers.request({
                        method: 'POST',
                        url: 'https://api.maileon.com/1.0/transactions',
                        headers: {Authorization: `Basic ${apiKey}`},
                        body: [{
                            typeName: eventTypeKey,
                            contact: {email},
                            content: attributes
                        }],
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
        } catch
            (error) {
            throw new NodeApiError(this.getNode(), error as JsonObject, {
                message: (error as Error)?.message || 'Unknown error occurred',
            });
        }
    }
}







