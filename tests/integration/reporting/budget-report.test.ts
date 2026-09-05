import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAllRoles } from '../../helpers/api';

describe('Budget Reporting', () => {
  beforeAll(async () => {
    await loginAllRoles();
  });

  it('BUD-RPT-01: GET /reports/budget → 200', async () => {
    const res = await api('/reports/budget', { method: 'GET', as: 'admin' });
    expect(res.status).toBe(200);
  });

  it('BUD-RPT-02: Budget report has valid structure', async () => {
    const res = await api('/reports/budget', { method: 'GET', as: 'admin' });
    expect(res.status).toBe(200);
    expect(res).toHaveProperty('sections');
  });

  it.todo('BUD-RPT-03: Budget vs Actual calculates variance correctly (needs A-07)');
  it.todo('BUD-RPT-04: Exceeding budget raises warning (needs A-07)');
  it.todo('BUD-RPT-05: Analytic account filtering applies (needs A-07)');
  it.todo('BUD-RPT-06: Budget hierarchical rollups (needs A-07)');
});
