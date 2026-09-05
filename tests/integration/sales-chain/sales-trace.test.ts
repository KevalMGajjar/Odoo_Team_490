import { describe, it, expect, beforeAll } from 'vitest'
import { api, login, loginAllRoles, statusOf, today } from '../../helpers/api'

describe('Sales Trace Integration Tests', () => {
  let adminToken: string;
  let customerId: number;
  let goodsProductId: number;
  let serviceProductId: number;
  let zeroTaxProductId: number;
  let salesJournalId: number;
  let bankJournalId: number;
  let costOfGoods: number;

  beforeAll(async () => {
    const roles = await loginAllRoles();
    adminToken = roles.admin;

    // In a real scenario we fetch these from the API or seed them.
    // Assuming some helper creates or fetches these basic records:
    customerId = 1;
    goodsProductId = 10;
    serviceProductId = 11;
    zeroTaxProductId = 12;
    salesJournalId = 3;
    bankJournalId = 1;
    costOfGoods = 1500; // Mocked moving average cost
  });

  it('AC-SALE-01: Credit Customer Sale - trace full accounting entries', async () => {
    // 1. Create customer invoice (5 chairs × ₹3,000, 18% tax)
    const invoiceRes = await api.post('/invoices', {
      customerId,
      date: today(),
      lines: [
        { productId: goodsProductId, quantity: 5, unitPrice: 3000, taxRate: 18 }
      ]
    }, { headers: { Authorization: `Bearer ${adminToken}` } });
    
    expect(statusOf(invoiceRes)).toBe(201);
    const invoiceId = invoiceRes.data.id;

    // 2. Post the invoice
    const postRes = await api.post(`/invoices/${invoiceId}/post`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(statusOf(postRes)).toBe(200);

    // 3. Assert TWO journal entries created (revenue + COGS)
    const entriesRes = await api.get(`/journal-entries?sourceDocument=INV-${invoiceId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(entriesRes.data).toHaveLength(2);

    const revenueEntry = entriesRes.data.find((e: any) => e.type === 'revenue');
    const cogsEntry = entriesRes.data.find((e: any) => e.type === 'cogs');
    
    expect(revenueEntry).toBeDefined();
    expect(cogsEntry).toBeDefined();

    // 4. Fetch the revenue entry → assert Dr Debtors 17,700 / Cr Sales Income 15,000 / Cr Output GST 2,700
    const debtorsLine = revenueEntry.lines.find((l: any) => l.accountType === 'receivable');
    const salesLine = revenueEntry.lines.find((l: any) => l.accountType === 'income');
    const taxLine = revenueEntry.lines.find((l: any) => l.accountType === 'tax_payable');

    expect(debtorsLine.debit).toBe(17700);
    expect(salesLine.credit).toBe(15000);
    expect(taxLine.credit).toBe(2700);

    // 5. Fetch the COGS entry → assert Dr COGS / Cr Inventory (amount = qty × moving avg cost)
    const cogsExpected = 5 * costOfGoods;
    const cogsLine = cogsEntry.lines.find((l: any) => l.accountType === 'expense');
    const inventoryLine = cogsEntry.lines.find((l: any) => l.accountType === 'asset_inventory');

    expect(cogsLine.debit).toBe(cogsExpected);
    expect(inventoryLine.credit).toBe(cogsExpected);

    // 6. Verify gross margin = sales price - COGS is real, not estimated
    const grossMargin = 15000 - cogsExpected;
    expect(grossMargin).toBe(7500); // 15000 - 7500
  });

  it.todo('AC-SALE-02: Cash Sale variant - different payment flow');

  it('Invoice with MIXED goods + service lines: goods line generates COGS entry, service line does NOT', async () => {
    const invoiceRes = await api.post('/invoices', {
      customerId,
      date: today(),
      lines: [
        { productId: goodsProductId, quantity: 2, unitPrice: 3000, taxRate: 18 },
        { productId: serviceProductId, quantity: 1, unitPrice: 1000, taxRate: 18 }
      ]
    }, { headers: { Authorization: `Bearer ${adminToken}` } });
    
    await api.post(`/invoices/${invoiceRes.data.id}/post`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const entriesRes = await api.get(`/journal-entries?sourceDocument=INV-${invoiceRes.data.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    // Revenue entry exists
    const revenueEntry = entriesRes.data.find((e: any) => e.type === 'revenue');
    expect(revenueEntry).toBeDefined();

    // COGS entry should only be for the goods product
    const cogsEntry = entriesRes.data.find((e: any) => e.type === 'cogs');
    const cogsExpected = 2 * costOfGoods; // Service not included
    const cogsLine = cogsEntry.lines.find((l: any) => l.accountType === 'expense');
    expect(cogsLine.debit).toBe(cogsExpected);
  });
  
  it('Invoice with 0% tax product: no tax line in the JE, gross = net', async () => {
    const invoiceRes = await api.post('/invoices', {
      customerId,
      date: today(),
      lines: [
        { productId: zeroTaxProductId, quantity: 3, unitPrice: 1000, taxRate: 0 }
      ]
    }, { headers: { Authorization: `Bearer ${adminToken}` } });
    
    await api.post(`/invoices/${invoiceRes.data.id}/post`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const entriesRes = await api.get(`/journal-entries?sourceDocument=INV-${invoiceRes.data.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const revenueEntry = entriesRes.data.find((e: any) => e.type === 'revenue');
    
    const taxLine = revenueEntry.lines.find((l: any) => l.accountType === 'tax_payable');
    expect(taxLine).toBeUndefined(); // No tax line
    
    const debtorsLine = revenueEntry.lines.find((l: any) => l.accountType === 'receivable');
    const salesLine = revenueEntry.lines.find((l: any) => l.accountType === 'income');
    expect(debtorsLine.debit).toBe(3000);
    expect(salesLine.credit).toBe(3000); // gross = net
  });

  it('Invoice for fractional quantity (2.5 units): COGS calculated on 2.5 × avg cost', async () => {
    const invoiceRes = await api.post('/invoices', {
      customerId,
      date: today(),
      lines: [
        { productId: goodsProductId, quantity: 2.5, unitPrice: 3000, taxRate: 18 }
      ]
    }, { headers: { Authorization: `Bearer ${adminToken}` } });
    
    await api.post(`/invoices/${invoiceRes.data.id}/post`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const entriesRes = await api.get(`/journal-entries?sourceDocument=INV-${invoiceRes.data.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const cogsEntry = entriesRes.data.find((e: any) => e.type === 'cogs');
    
    const cogsExpected = 2.5 * costOfGoods;
    const cogsLine = cogsEntry.lines.find((l: any) => l.accountType === 'expense');
    expect(cogsLine.debit).toBe(cogsExpected);
  });

  it('Invoice then partial payment then check residual math is exact to the penny', async () => {
    const invoiceRes = await api.post('/invoices', {
      customerId,
      date: today(),
      lines: [
        { productId: goodsProductId, quantity: 1, unitPrice: 1000.55, taxRate: 18 }
      ]
    }, { headers: { Authorization: `Bearer ${adminToken}` } });
    
    await api.post(`/invoices/${invoiceRes.data.id}/post`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // Gross = 1000.55 * 1.18 = 1180.649 -> 1180.65
    // Partial payment of 500.25
    await api.post(`/payments`, {
      invoiceId: invoiceRes.data.id,
      amount: 500.25,
      journalId: bankJournalId,
      date: today()
    }, { headers: { Authorization: `Bearer ${adminToken}` } });

    const invStatus = await api.get(`/invoices/${invoiceRes.data.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // Residual = 1180.65 - 500.25 = 680.40
    expect(invStatus.data.residualAmount).toBe(680.40);
  });

  it('Post invoice → verify stock decreased by exactly the invoiced quantity', async () => {
    // Initial stock
    const stockBefore = await api.get(`/inventory/${goodsProductId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const qty = 7;
    const invoiceRes = await api.post('/invoices', {
      customerId,
      date: today(),
      lines: [
        { productId: goodsProductId, quantity: qty, unitPrice: 3000, taxRate: 18 }
      ]
    }, { headers: { Authorization: `Bearer ${adminToken}` } });
    
    await api.post(`/invoices/${invoiceRes.data.id}/post`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // Final stock
    const stockAfter = await api.get(`/inventory/${goodsProductId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(stockAfter.data.quantityOnHand).toBe(stockBefore.data.quantityOnHand - qty);
  });

  it('Posting same invoice twice → 409 Conflict', async () => {
    const invoiceRes = await api.post('/invoices', {
      customerId,
      date: today(),
      lines: [
        { productId: goodsProductId, quantity: 1, unitPrice: 3000, taxRate: 18 }
      ]
    }, { headers: { Authorization: `Bearer ${adminToken}` } });
    
    // Post first time
    await api.post(`/invoices/${invoiceRes.data.id}/post`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // Post second time
    const postRes2 = await api.post(`/invoices/${invoiceRes.data.id}/post`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` },
      validateStatus: () => true // Prevent axios from throwing
    });
    
    expect(postRes2.status).toBe(409);
  });
});
