import { describe, it, beforeAll } from 'vitest';
import { login } from '../../helpers/api';

describe('Tax Trace & Budget AC Tests', () => {
  beforeAll(async () => {
    await login('admin');
  });

  it.todo('AC-TAX-01: Trace tax amounts to underlying transaction source');
  it.todo('AC-BUDGET-01: Exceeding budget triggers warning (if configured)');
  it.todo('AC-BUDGET-02: Budget adjustments are recorded in audit trail');
});
