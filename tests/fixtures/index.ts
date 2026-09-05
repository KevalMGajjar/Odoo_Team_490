/**
 * Test fixture factories.
 *
 * Build fixture objects that match the Prisma schema models.
 * These are used inside withRollback() transactions for unit tests,
 * or to construct API payloads for integration tests.
 */

const RUN = Date.now()  // uniqueness salt to avoid collisions across runs

/**
 * Create a unique code/email/name suffix for this test run.
 */
export function unique(prefix: string): string {
  return `${prefix}-${RUN}-${Math.random().toString(36).slice(2, 6)}`
}

// ── Chart of Account fixtures ──

export function makeAccount(overrides: Record<string, any> = {}) {
  return {
    code: unique('T'),
    name: `Test Account ${unique('A')}`,
    type: 'asset' as const,
    ...overrides,
  }
}

export function makeCashBankAccount(overrides: Record<string, any> = {}) {
  return makeAccount({ isCashBank: true, ...overrides })
}

// ── Contact fixtures ──

export function makeContact(overrides: Record<string, any> = {}) {
  return {
    name: `Test Contact ${unique('C')}`,
    type: 'customer' as const,
    email: `${unique('c')}@test.local`,
    ...overrides,
  }
}

export function makeVendor(overrides: Record<string, any> = {}) {
  return makeContact({ type: 'vendor', ...overrides })
}

// ── Product fixtures ──

export function makeProduct(overrides: Record<string, any> = {}) {
  return {
    name: `Test Product ${unique('P')}`,
    type: 'goods' as const,
    trackInventory: true,
    salesPrice: '3000',
    cost: '1800',
    gstRate: '18',
    ...overrides,
  }
}

export function makeServiceProduct(overrides: Record<string, any> = {}) {
  return makeProduct({
    type: 'service',
    trackInventory: false,
    cost: '0',
    gstRate: '0',
    ...overrides,
  })
}

// ── Journal fixtures ──

export function makeJournal(overrides: Record<string, any> = {}) {
  return {
    name: `Test Journal ${unique('J')}`,
    type: 'miscellaneous' as const,
    code: unique('TJ'),
    ...overrides,
  }
}

// ── Currency fixtures ──

export function makeCurrency(overrides: Record<string, any> = {}) {
  return {
    code: unique('X').slice(0, 3).toUpperCase(),
    name: `Test Currency ${unique('$')}`,
    symbol: '¤',
    isBase: false,
    ...overrides,
  }
}

// ── User fixtures ──

export function makeUser(overrides: Record<string, any> = {}) {
  return {
    name: `Test User ${unique('U')}`,
    email: `${unique('u')}@test.local`,
    password: 'x',
    role: 'admin' as const,
    ...overrides,
  }
}

// ── Journal Entry line helpers ──

export function debitLine(accountId: string, amount: string | number) {
  return { accountId, debit: String(amount), credit: '0' }
}

export function creditLine(accountId: string, amount: string | number) {
  return { accountId, debit: '0', credit: String(amount) }
}

/**
 * Build a balanced pair of journal entry lines for testing.
 */
export function balancedPair(debitAccountId: string, creditAccountId: string, amount: string | number) {
  return [debitLine(debitAccountId, amount), creditLine(creditAccountId, amount)]
}
