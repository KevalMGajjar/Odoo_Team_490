/**
 * OpenAPI 3.0 description of the Urban Furniture API.
 *
 * Written by hand rather than generated, so it stays readable and can carry the
 * accounting context a generated spec would lose — which endpoints post to the
 * ledger, what the sign convention on `transactions` means, and how a read-only
 * companion client should authenticate.
 *
 * Served as Swagger UI at /docs and as raw JSON at /openapi.json.
 */

const ok = (description, schema) => ({
  description,
  content: { 'application/json': { schema } },
})

const errorSchema = {
  type: 'object',
  properties: {
    message: { type: 'string', example: 'Validation failed' },
    errors: {
      type: 'array',
      description: 'Present on 422. One entry per offending field.',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', example: 'gstRate' },
          message: { type: 'string', example: 'GST % cannot exceed 100%' },
        },
      },
    },
  },
}

const errors = (...codes) => {
  const map = {
    400: 'Malformed request',
    401: 'No session, or the token is invalid or expired',
    403: 'Authenticated, but this role may not perform the action',
    404: 'Record does not exist',
    409: 'State conflict — the record exists but the action is illegal right now (e.g. posting an already-posted document, archiving something still in use)',
    422: 'Validation failed — see `errors[]` for per-field messages',
    503: 'A dependency is unavailable',
  }
  return Object.fromEntries(
    codes.map((c) => [c, { description: map[c], content: { 'application/json': { schema: errorSchema } } }]),
  )
}

const listResponse = (itemRef) => ({
  type: 'object',
  properties: {
    rows: { type: 'array', items: { $ref: itemRef } },
    total: { type: 'integer', example: 42 },
    page: { type: 'integer', example: 1 },
    pageSize: { type: 'integer', example: 50 },
  },
})

const listParams = [
  { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free-text search' },
  { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'archived'] } },
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
]

const moneyStr = {
  type: 'string',
  description: 'Decimal as a STRING — never parse into a float and never recompute totals client-side.',
  example: '26550.00',
}

const idParam = {
  name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' },
}

/** Standard list/read/create/update/archive block for a master resource. */
function masterPaths(base, tag, schemaRef, { writeRoles = 'admin' } = {}) {
  return {
    [`/${base}`]: {
      get: {
        tags: [tag], summary: `List ${tag.toLowerCase()}`,
        description: 'Readable by any internal role, including `viewer`.',
        parameters: listParams,
        responses: { 200: ok('Paginated list', listResponse(schemaRef)), ...errors(401) },
      },
      post: {
        tags: [tag], summary: `Create ${tag.toLowerCase()}`,
        description: 'Roles: `admin`, `invoicing_user`.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: schemaRef } } } },
        responses: { 201: ok('Created', { $ref: schemaRef }), ...errors(401, 403, 409, 422) },
      },
    },
    [`/${base}/{id}`]: {
      get: {
        tags: [tag], summary: `Get one`,
        parameters: [idParam],
        responses: { 200: ok('Record', { $ref: schemaRef }), ...errors(401, 404) },
      },
      put: {
        tags: [tag], summary: `Update`,
        description: `Roles: \`${writeRoles}\`. An invoicing user may create but not modify.`,
        parameters: [idParam],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: schemaRef } } } },
        responses: { 200: ok('Updated', { $ref: schemaRef }), ...errors(401, 403, 404, 422) },
      },
    },
    [`/${base}/{id}/archive`]: {
      post: {
        tags: [tag], summary: `Archive`,
        description:
          'Soft lifecycle — records are never deleted, because reports must stay reproducible. ' +
          'Returns 409 naming the blocker when the record is still referenced.',
        parameters: [idParam],
        responses: { 200: ok('Archived', { $ref: schemaRef }), ...errors(401, 403, 404, 409) },
      },
    },
    [`/${base}/{id}/unarchive`]: {
      post: {
        tags: [tag], summary: `Restore`,
        parameters: [idParam],
        responses: { 200: ok('Restored', { $ref: schemaRef }), ...errors(401, 403, 404, 409) },
      },
    },
  }
}

const reportParams = {
  asOf: { name: 'asOf', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Defaults to today' },
  from: { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Defaults to the start of the current financial year' },
  to: { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Defaults to today' },
  format: { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'csv'] }, description: 'csv returns a download' },
}

export function buildOpenApiDocument({ port = 4000 } = {}) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Urban Furniture — Accounting System API',
      version: '1.0.0',
      description: `
REST API for a double-entry accounting system with perpetual inventory and multi-currency support.

## The one rule everything follows

\`journal_items\` is the single source of truth. Every report is derived from it — nothing reads
the invoice or bill tables. An entry cannot be written unless **Σ debit == Σ credit**, and once
posted it is **immutable**: corrections are made by posting a reversal, never by editing.

## Authenticating a companion app

Browsers get an httpOnly cookie automatically. Any other client — a mobile app, a desktop client,
a script — should use the bearer token instead:

1. \`POST /auth/login\` with email and password. The response body includes \`token\`.
2. Send \`Authorization: Bearer <token>\` on every subsequent request.

For a **read-only** client, sign in as a user with the \`viewer\` role. It can read everything an
invoicing user can, but is in no write role, so a leaked token cannot alter the ledger.
The seeded account is \`viewer@urbanfurniture.com\` / \`demo123\`.

Native apps send no \`Origin\` header and are unaffected by CORS. Browser-based companions must be
listed in \`CORS_ORIGINS\`; in development any localhost port is allowed.

## Money

Every monetary value crosses the wire as a **string**, not a number, so no float rounding can occur
in transit. Format for display; never recompute a total the server did not send.

## Status codes

\`409\` means a **state** conflict — the record exists but the action is illegal right now.
\`422\` means the **payload** is invalid and carries \`errors[]\` with one entry per field.
      `.trim(),
    },
    servers: [
      { url: `http://localhost:${port}`, description: 'Local development' },
    ],
    tags: [
      { name: 'Auth', description: 'Sign in, sessions and password reset' },
      { name: 'Reports', description: 'All figures derived live from the ledger. Read-only — available to `viewer`.' },
      { name: 'Contacts' }, { name: 'Products' }, { name: 'Categories' },
      { name: 'Accounts', description: 'Chart of accounts' },
      { name: 'Journals' }, { name: 'Taxes' }, { name: 'Currencies' },
      { name: 'Analytic accounts' }, { name: 'Budgets' },
      { name: 'System' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
          description: 'Token from POST /auth/login. Use this for non-browser clients.',
        },
        cookieAuth: {
          type: 'apiKey', in: 'cookie', name: 'uf_token',
          description: 'Set automatically on login. Used by the web app.',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['admin', 'invoicing_user', 'viewer', 'contact'] },
            contactId: { type: 'string', format: 'uuid', nullable: true },
            status: { type: 'string', enum: ['active', 'archived'] },
          },
        },
        LoginRequest: {
          type: 'object', required: ['email', 'password'],
          properties: {
            email: { type: 'string', example: 'viewer@urbanfurniture.com' },
            password: { type: 'string', example: 'demo123' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/User' },
            token: { type: 'string', description: 'JWT — send as `Authorization: Bearer <token>`' },
            expiresIn: { type: 'string', example: '7d' },
          },
        },
        Contact: {
          type: 'object', required: ['name', 'type'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            name: { type: 'string', example: 'Nimesh Pathak' },
            type: { type: 'string', enum: ['customer', 'vendor', 'both'] },
            email: { type: 'string', nullable: true },
            mobile: { type: 'string', nullable: true },
            city: { type: 'string', nullable: true },
            state: { type: 'string', nullable: true },
            pincode: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['active', 'archived'], readOnly: true },
          },
        },
        Product: {
          type: 'object', required: ['name', 'type', 'salesPrice', 'cost', 'gstRate'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            name: { type: 'string', example: 'Office Chair' },
            type: { type: 'string', enum: ['goods', 'service', 'combo'] },
            categoryId: { type: 'string', format: 'uuid', nullable: true },
            salesPrice: moneyStr,
            cost: moneyStr,
            gstRate: { type: 'string', example: '18.00', description: 'GST %' },
            trackInventory: { type: 'boolean', description: 'Perpetual inventory with moving-average cost' },
            onHandQty: { type: 'string', readOnly: true, example: '46.000' },
            avgCost: { type: 'string', readOnly: true, example: '2814.2857' },
            status: { type: 'string', enum: ['active', 'archived'], readOnly: true },
          },
        },
        Account: {
          type: 'object', required: ['code', 'name', 'type'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            code: { type: 'string', example: '1100', description: 'Drives report ordering' },
            name: { type: 'string', example: 'Debtors (Accounts Receivable)' },
            type: { type: 'string', enum: ['asset', 'liability', 'income', 'expense', 'capital'] },
            isCashBank: { type: 'boolean', description: 'Selectable on the bank/cash side of a receipt or payment voucher' },
            status: { type: 'string', enum: ['active', 'archived'], readOnly: true },
          },
        },
        Journal: {
          type: 'object', required: ['code', 'name', 'type'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            code: { type: 'string', example: 'INV' },
            name: { type: 'string', example: 'Sales Journal' },
            type: { type: 'string', enum: ['sales', 'purchase', 'bank', 'cash', 'miscellaneous'] },
            defaultDebitId: { type: 'string', format: 'uuid', nullable: true },
            defaultCreditId: { type: 'string', format: 'uuid', nullable: true },
          },
        },
        Tax: {
          type: 'object', required: ['name', 'rate'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            name: { type: 'string', example: 'GST 18%' },
            rate: { type: 'string', example: '18.00' },
          },
        },
        Currency: {
          type: 'object', required: ['code', 'name', 'symbol'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            code: { type: 'string', example: 'USD' },
            name: { type: 'string', example: 'US Dollar' },
            symbol: { type: 'string', example: '$' },
            decimalPlaces: { type: 'integer', default: 2 },
            isBase: { type: 'boolean', readOnly: true },
          },
        },
        AnalyticAccount: {
          type: 'object', required: ['name', 'type'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            name: { type: 'string', example: 'Showroom Operations' },
            type: { type: 'string', enum: ['income', 'expense'] },
          },
        },
        Budget: {
          type: 'object', required: ['name', 'analyticAccountId', 'startDate', 'endDate', 'plannedAmount'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            name: { type: 'string' },
            analyticAccountId: { type: 'string', format: 'uuid' },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            plannedAmount: moneyStr,
            responsibleId: { type: 'string', format: 'uuid', nullable: true },
          },
        },
        Category: {
          type: 'object', required: ['name'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            name: { type: 'string', example: 'Seating' },
          },
        },
        ReportLine: {
          type: 'object',
          properties: {
            accountId: { type: 'string', format: 'uuid' },
            code: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string' },
            debit: moneyStr, credit: moneyStr, balance: moneyStr,
          },
        },
        Transaction: {
          type: 'object',
          description:
            'Flat voucher projection over the ledger. SIGN CONVENTION: amount = credit − debit, ' +
            'so a POSITIVE amount is a CREDIT and a NEGATIVE amount is a DEBIT. Every voucher nets to zero.',
          properties: {
            date: { type: 'string', format: 'date' },
            voucher_no: { type: 'integer', example: 1 },
            voucher_type: { type: 'string', enum: ['BReceipt', 'BPayment', 'CReceipt', 'CPayment', 'Journal'] },
            accountid: { type: 'string', format: 'uuid' },
            account_name: { type: 'string' },
            amount: { type: 'string', example: '5000.00' },
            reference: { type: 'string', nullable: true },
            narration: { type: 'string', nullable: true },
            entry_id: { type: 'string', format: 'uuid', description: 'Drill through to the journal entry' },
            entry_number: { type: 'string', example: 'BNK/2026/0004' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    paths: {
      // ─── system ───
      '/health': {
        get: {
          tags: ['System'], summary: 'Dependency status', security: [],
          description: 'Green/amber/red for database, ERP and AI. The app is fully functional on the database alone.',
          responses: {
            200: ok('Healthy', { type: 'object' }),
            503: { description: 'Database unreachable' },
          },
        },
      },

      // ─── auth ───
      '/auth/login': {
        post: {
          tags: ['Auth'], summary: 'Sign in', security: [],
          description: 'Sets an httpOnly cookie AND returns a bearer token for non-browser clients.',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
          responses: { 200: ok('Signed in', { $ref: '#/components/schemas/LoginResponse' }), ...errors(401, 422) },
        },
      },
      '/auth/signup': {
        post: {
          tags: ['Auth'], summary: 'Register an internal user', security: [],
          description: 'Portal contacts are created from the Contact master, never by self-signup.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['name', 'email', 'password'],
                  properties: {
                    name: { type: 'string' }, email: { type: 'string' }, password: { type: 'string', minLength: 6 },
                    role: { type: 'string', enum: ['admin', 'invoicing_user'], default: 'invoicing_user' },
                  },
                },
              },
            },
          },
          responses: { 201: ok('Created', { $ref: '#/components/schemas/LoginResponse' }), ...errors(409, 422) },
        },
      },
      '/auth/logout': {
        post: { tags: ['Auth'], summary: 'Sign out', responses: { 200: { description: 'Signed out' } } },
      },
      '/auth/me': {
        get: {
          tags: ['Auth'], summary: 'Current user',
          responses: { 200: ok('Current user', { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } }), ...errors(401) },
        },
      },
      '/auth/forgot': {
        post: {
          tags: ['Auth'], summary: 'Request a reset code', security: [],
          description:
            'Always answers identically so accounts cannot be enumerated. Email delivery is written to a local ' +
            '`outbox` table so nothing leaves the machine; in development the code is also returned as `devOtp`.',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string' } } } } } },
          responses: { 200: ok('Accepted', { type: 'object' }), ...errors(422) },
        },
      },
      '/auth/reset': {
        post: {
          tags: ['Auth'], summary: 'Reset the password with a code', security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['email', 'otp', 'password'],
                  properties: { email: { type: 'string' }, otp: { type: 'string', example: '123456' }, password: { type: 'string', minLength: 6 } },
                },
              },
            },
          },
          responses: { 200: ok('Password updated', { type: 'object' }), ...errors(422) },
        },
      },

      // ─── reports ───
      '/reports/dashboard': {
        get: {
          tags: ['Reports'], summary: 'Dashboard summary',
          description:
            'One call for everything a home screen needs — cash, receivables, payables, stock value, ' +
            'revenue and profit for the year to date, document counts and the ten most recent entries. ' +
            'Every figure is computed live; nothing is cached or stored.',
          parameters: [reportParams.asOf],
          responses: { 200: ok('Summary', { type: 'object' }), ...errors(401, 403) },
        },
      },
      '/reports/trial-balance': {
        get: {
          tags: ['Reports'], summary: 'Trial balance',
          description: 'Σ debit must equal Σ credit. `balanced` is the system-wide consistency proof.',
          parameters: [reportParams.asOf, reportParams.format],
          responses: {
            200: ok('Trial balance', {
              type: 'object',
              properties: {
                rows: { type: 'array', items: { $ref: '#/components/schemas/ReportLine' } },
                totals: { type: 'object', properties: { debit: moneyStr, credit: moneyStr, difference: moneyStr } },
                balanced: { type: 'boolean' },
              },
            }),
            ...errors(401, 403),
          },
        },
      },
      '/reports/profit-loss': {
        get: {
          tags: ['Reports'], summary: 'Profit & loss',
          description: 'Includes cost of sales and gross margin, real because COGS is posted at delivery from moving-average cost.',
          parameters: [reportParams.from, reportParams.to, reportParams.format],
          responses: { 200: ok('P&L', { type: 'object' }), ...errors(400, 401, 403) },
        },
      },
      '/reports/balance-sheet': {
        get: {
          tags: ['Reports'], summary: 'Balance sheet',
          description:
            'Assets == Liabilities + Capital + Current Period Earnings. Profit for the period sits on the ' +
            'equity side — omit it and the sheet will not balance.',
          parameters: [reportParams.asOf, reportParams.format],
          responses: { 200: ok('Balance sheet', { type: 'object' }), ...errors(401, 403) },
        },
      },
      '/reports/inventory-valuation': {
        get: {
          tags: ['Reports'], summary: 'Inventory valuation',
          description:
            'Rebuilt from append-only valuation layers and compared with the Inventory control account. ' +
            '`tiesOut` is the second self-verifying check in the system.',
          parameters: [reportParams.asOf, reportParams.format],
          responses: { 200: ok('Valuation', { type: 'object' }), ...errors(401, 403) },
        },
      },
      '/reports/budget': {
        get: {
          tags: ['Reports'], summary: 'Budget vs actual',
          description: 'Actuals come from journal items tagged with the budget’s analytic account.',
          parameters: [reportParams.from, reportParams.to, reportParams.format],
          responses: { 200: ok('Budget report', { type: 'object' }), ...errors(401, 403) },
        },
      },
      '/reports/general-ledger': {
        get: {
          tags: ['Reports'], summary: 'General ledger with running balance',
          description: 'The drill-down target: a report figure links here, and each row links on to its source document.',
          parameters: [
            { name: 'accountId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'partnerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'analyticAccountId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            reportParams.from, reportParams.to, reportParams.format,
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 500, maximum: 2000 } },
          ],
          responses: { 200: ok('Ledger', { type: 'object' }), ...errors(401, 403) },
        },
      },
      '/reports/transactions': {
        get: {
          tags: ['Reports'], summary: 'Transactions (flat voucher view)',
          description:
            'One row per account per voucher: date, voucher_no, voucher_type, accountid, amount, reference, narration. ' +
            'amount = credit − debit, so positive is a credit and negative is a debit.',
          parameters: [
            { name: 'voucherType', in: 'query', schema: { type: 'string', enum: ['BReceipt', 'BPayment', 'CReceipt', 'CPayment', 'Journal'] } },
            { name: 'fiscalYear', in: 'query', schema: { type: 'integer', example: 2026 } },
            { name: 'accountId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            reportParams.from, reportParams.to, reportParams.format,
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 200 } },
          ],
          responses: {
            200: ok('Transactions', {
              type: 'object',
              properties: {
                rows: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } },
                total: { type: 'integer' },
              },
            }),
            ...errors(401, 403),
          },
        },
      },

      // ─── masters ───
      ...masterPaths('contacts', 'Contacts', '#/components/schemas/Contact'),
      ...masterPaths('products', 'Products', '#/components/schemas/Product'),
      ...masterPaths('product-categories', 'Categories', '#/components/schemas/Category'),
      ...masterPaths('accounts', 'Accounts', '#/components/schemas/Account'),
      ...masterPaths('journals', 'Journals', '#/components/schemas/Journal'),
      ...masterPaths('taxes', 'Taxes', '#/components/schemas/Tax'),
      ...masterPaths('currencies', 'Currencies', '#/components/schemas/Currency'),
      ...masterPaths('analytic-accounts', 'Analytic accounts', '#/components/schemas/AnalyticAccount'),
      ...masterPaths('budgets', 'Budgets', '#/components/schemas/Budget'),

      '/currency-rates': {
        get: {
          tags: ['Currencies'], summary: 'List exchange rates',
          description:
            'Rates are business records entered and versioned by date, never fetched from a live API at render ' +
            'time. That keeps historical documents reproducible and the app working with no internet.',
          parameters: [{ name: 'currencyId', in: 'query', schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: ok('Rates', { type: 'object' }), ...errors(401) },
        },
        post: {
          tags: ['Currencies'], summary: 'Set a rate for a date',
          description: 'rate = how many BASE units equal 1 unit of this currency. USD 83.50 means 1 USD = ₹83.50.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['currencyId', 'date', 'rate'],
                  properties: {
                    currencyId: { type: 'string', format: 'uuid' },
                    date: { type: 'string', format: 'date' },
                    rate: { type: 'number', example: 83.5 },
                  },
                },
              },
            },
          },
          responses: { 201: ok('Saved', { type: 'object' }), ...errors(401, 403, 404, 422) },
        },
      },
    },
  }
}
