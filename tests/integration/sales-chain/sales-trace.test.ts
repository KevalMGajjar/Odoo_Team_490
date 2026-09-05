import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAllRoles, today } from '../../helpers/api';

describe('Sales Trace & Accounting Flow', () => {
  let customerId: number;
  let productId: number;
  let bankJournalId: number;
  let initialStock: number;
  
  beforeAll(async () => {
    await loginAllRoles();
    
    // Get Customer "Meera"
    const contactsRes = await api('/contacts?q=Meera', { method: 'GET', as: 'sales' });
    expect(contactsRes.status).toBe(200);
    customerId = contactsRes.rows[0].id;

    // Get Product "Bar Stool"
    const productsRes = await api('/products?q=Bar Stool', { method: 'GET', as: 'sales' });
    expect(productsRes.status).toBe(200);
    productId = productsRes.rows[0].id;
    initialStock = productsRes.rows[0].onHandQty;
    
    // Get Bank Journal
    const journalsRes = await api('/journals', { method: 'GET', as: 'accounting' });
    expect(journalsRes.status).toBe(200);
    const bank = journalsRes.rows.find((j: any) => j.type === 'bank');
    bankJournalId = bank.id;
  });

  describe('AC-SALE-01: Credit sale full accounting trace', () => {
    let invoiceId: number;
    let journalEntryId: number;
    let cogsEntryId: number;
    let untaxed = 0;
    let total = 0;
    const qty = 4;
    const price = 2900;
    
    it('creates the invoice correctly', async () => {
      const res = await api('/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: today(),
          dueDate: today(),
          lines: [{ productId, quantity: qty, unitPrice: price }]
        },
        as: 'sales'
      });
      expect(res.status).toBe(201);
      invoiceId = res.id;
      untaxed = res.untaxed;
      total = res.total;
      
      expect(untaxed).toBe(qty * price);
    });

    it('posts it -> assert journalEntryId AND cogsEntryId both exist', async () => {
      const res = await api(`/invoices/${invoiceId}/post`, {
        method: 'POST',
        as: 'accounting'
      });
      expect(res.status).toBe(200);
      expect(res.journalEntryId).toBeDefined();
      expect(res.cogsEntryId).toBeDefined();
      expect(res.settleState).toBe('not_paid');
      
      journalEntryId = res.journalEntryId;
      cogsEntryId = res.cogsEntryId;
    });

    it('NEW EDGE: Revenue entry debit (Debtors) = total, credit (Sales Income) = untaxed, credit (Output GST) = tax', async () => {
      const res = await api(`/journal-entries/${journalEntryId}`, { method: 'GET', as: 'accounting' });
      expect(res.status).toBe(200);
      
      const debtorsItem = res.items.find((i: any) => i.debit > 0);
      expect(Number(debtorsItem.debit)).toBe(total);
      
      const incomeItem = res.items.find((i: any) => i.credit == untaxed);
      expect(incomeItem).toBeDefined();
      
      const taxItem = res.items.find((i: any) => i.credit == (total - untaxed));
      if (total > untaxed) {
        expect(taxItem).toBeDefined();
      }
    });

    it('Fetch COGS entry via GET /journal-entries/:cogsEntryId -> verify items sum', async () => {
      const res = await api(`/journal-entries/${cogsEntryId}`, { method: 'GET', as: 'accounting' });
      expect(res.status).toBe(200);
      
      let sumDebit = 0;
      let sumCredit = 0;
      for (const item of res.items) {
        sumDebit += Number(item.debit || 0);
        sumCredit += Number(item.credit || 0);
      }
      expect(sumDebit).toBeGreaterThan(0);
      expect(sumDebit).toBe(sumCredit);
    });

    it('NEW EDGE: Stock quantity check — verify stock decreased by 4', async () => {
      const res = await api(`/products/${productId}`, { method: 'GET', as: 'inventory' });
      expect(res.status).toBe(200);
      expect(Number(res.onHandQty)).toBe(Number(initialStock) - qty);
    });
  });

  describe('AC-SALE-02: Cash sale', () => {
    it('create invoice, post, immediately pay full amount via bank -> settleState = paid', async () => {
      // Create
      const createRes = await api('/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: today(),
          dueDate: today(),
          lines: [{ productId, quantity: 1, unitPrice: 1000 }]
        },
        as: 'sales'
      });
      const invId = createRes.id;
      const total = createRes.total;
      
      // Post
      await api(`/invoices/${invId}/post`, { method: 'POST', as: 'accounting' });
      
      // Pay
      const payRes = await api(`/invoices/${invId}/register-payment`, {
        method: 'POST',
        body: {
          journalId: bankJournalId,
          paymentDate: today(),
          amount: total
        },
        as: 'accounting'
      });
      expect(payRes.status).toBe(201);
      
      // Check state
      const getRes = await api(`/invoices/${invId}`, { method: 'GET', as: 'sales' });
      expect(getRes.settleState).toBe('paid');
    });
  });

  describe('Invoice with fractional quantity (2.5 units)', () => {
    it('test that total math is correct', async () => {
      const res = await api('/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: today(),
          dueDate: today(),
          lines: [{ productId, quantity: 2.5, unitPrice: 1000 }]
        },
        as: 'sales'
      });
      expect(res.status).toBe(201);
      expect(res.untaxed).toBe(2500);
    });
  });

  describe('Partial payment and Full settlement', () => {
    let invoiceId: number;
    let totalToPay: number;
    
    beforeAll(async () => {
      const res = await api('/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: today(),
          dueDate: today(),
          lines: [{ productId, quantity: 4, unitPrice: 2900 }]
        },
        as: 'sales'
      });
      invoiceId = res.id;
      totalToPay = res.total;
      
      await api(`/invoices/${invoiceId}/post`, { method: 'POST', as: 'accounting' });
    });
    
    it('Partial payment then check residual', async () => {
      const payRes = await api(`/invoices/${invoiceId}/register-payment`, {
        method: 'POST',
        body: {
          journalId: bankJournalId,
          paymentDate: today(),
          amount: 5000
        },
        as: 'accounting'
      });
      expect(payRes.status).toBe(201);
      
      const getRes = await api(`/invoices/${invoiceId}`, { method: 'GET', as: 'sales' });
      expect(getRes.settleState).toBe('partial');
      expect(Number(getRes.amountResidual)).toBe(totalToPay - 5000);
    });
    
    it('Full settlement', async () => {
      const payRes = await api(`/invoices/${invoiceId}/register-payment`, {
        method: 'POST',
        body: {
          journalId: bankJournalId,
          paymentDate: today(),
          amount: totalToPay - 5000
        },
        as: 'accounting'
      });
      expect(payRes.status).toBe(201);
      
      const getRes = await api(`/invoices/${invoiceId}`, { method: 'GET', as: 'sales' });
      expect(getRes.settleState).toBe('paid');
      expect(Number(getRes.amountResidual)).toBe(0);
    });
    
    it('Overpayment beyond residual -> 422', async () => {
      const payRes = await api(`/invoices/${invoiceId}/register-payment`, {
        method: 'POST',
        body: {
          journalId: bankJournalId,
          paymentDate: today(),
          amount: 100
        },
        as: 'accounting'
      });
      expect(payRes.status).toBe(422);
    });
  });

  describe('Posting same invoice twice -> 409', () => {
    it('rejects duplicate post', async () => {
      const res = await api('/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: today(),
          dueDate: today(),
          lines: [{ productId, quantity: 1, unitPrice: 1000 }]
        },
        as: 'sales'
      });
      const invId = res.id;
      
      const post1 = await api(`/invoices/${invId}/post`, { method: 'POST', as: 'accounting' });
      expect(post1.status).toBe(200);
      
      const post2 = await api(`/invoices/${invId}/post`, { method: 'POST', as: 'accounting' });
      expect(post2.status).toBe(409);
    });
  });

  describe('NEW EDGE: Invoice with zero quantity', () => {
    it('should be rejected (422)', async () => {
      const res = await api('/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: today(),
          dueDate: today(),
          lines: [{ productId, quantity: 0, unitPrice: 1000 }]
        },
        as: 'sales'
      });
      expect(res.status).toBe(422);
    });
  });

  describe('NEW EDGE: Invoice with negative unit price', () => {
    it('should be rejected (422)', async () => {
      const res = await api('/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: today(),
          dueDate: today(),
          lines: [{ productId, quantity: 1, unitPrice: -500 }]
        },
        as: 'sales'
      });
      expect(res.status).toBe(422);
    });
  });

  describe('NEW EDGE: Two invoices to same customer', () => {
    it('each has independent residual tracking', async () => {
      const inv1 = await api('/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: today(),
          dueDate: today(),
          lines: [{ productId, quantity: 1, unitPrice: 1000 }]
        },
        as: 'sales'
      });
      const inv2 = await api('/invoices', {
        method: 'POST',
        body: {
          customerId,
          invoiceDate: today(),
          dueDate: today(),
          lines: [{ productId, quantity: 2, unitPrice: 1000 }]
        },
        as: 'sales'
      });
      
      await api(`/invoices/${inv1.id}/post`, { method: 'POST', as: 'accounting' });
      await api(`/invoices/${inv2.id}/post`, { method: 'POST', as: 'accounting' });
      
      // Pay inv1
      await api(`/invoices/${inv1.id}/register-payment`, {
        method: 'POST',
        body: {
          journalId: bankJournalId,
          paymentDate: today(),
          amount: inv1.total
        },
        as: 'accounting'
      });
      
      const get1 = await api(`/invoices/${inv1.id}`, { method: 'GET', as: 'sales' });
      const get2 = await api(`/invoices/${inv2.id}`, { method: 'GET', as: 'sales' });
      
      expect(get1.settleState).toBe('paid');
      expect(Number(get1.amountResidual)).toBe(0);
      
      expect(get2.settleState).toBe('not_paid');
      expect(Number(get2.amountResidual)).toBe(inv2.total);
    });
  });

  describe('NEW EDGE: COGS entry only appears for goods products', () => {
    it.todo('TEST-ID: service-invoice-no-cogs: if we ever add service invoice, no COGS');
  });
});
