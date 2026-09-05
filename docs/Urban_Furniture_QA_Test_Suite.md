# Urban Furniture — Accounting System
## Complete QA Test Strategy & Test Case Suite

---

## 0. How to Read This Document

Every test case in this suite maps to one row containing:

| Field | Meaning |
|---|---|
| **ID** | Unique test case ID, format `MOD-###` (e.g. `CON-001`, `JE-014`, `E2E-003`) |
| **Module / Sub-module** | Where the test lives |
| **Type** | Functional / Validation / Negative / Boundary / Edge / Security / RBAC / Accounting / Calculation / Integration / Regression / Data Integrity / E2E / Reporting |
| **Priority** | P0 (Critical) / P1 (High) / P2 (Medium) / P3 (Low) |
| **Preconditions** | State the system must be in before the test starts |
| **Steps** | The exact action sequence |
| **Expected Result** | UI + backend/data + accounting result combined (accounting-specific columns are broken out separately for every accounting test, see Part 8) |
| **Postcondition** | State of the system after the test (used to detect regressions) |

For every **accounting** test case, the row is extended with: **Debit A/c, Credit A/c, Amount, Outstanding, Cash/Bank Impact, P&L Impact, Balance Sheet Impact** — this is the "books of account" layer described in Part 8.

**"Failure" is defined broadly.** A test is FAILED if any of the following is true, even if the screen looks correct:
- UI value is right but the journal entry is wrong or missing
- Journal is balanced but the ledger balance doesn't move
- Ledger is correct but the report doesn't reconcile to it
- Debit ≠ Credit anywhere, at any point, under any condition
- A payment does not reduce the correct receivable/payable
- An unauthorized role can read or act on data it shouldn't
- Historical reports change when master data is edited/archived after the fact

---

## 1. Test Strategy

1. **Four-lens testing** — every module is tested for (a) software correctness, (b) accounting correctness, (c) data/integration correctness, (d) real business workflow correctness.
2. **Trace, don't trust the screen.** For every transaction, the test doesn't stop at the invoice/bill screen — it is traced through Journal Entry → Ledger → Account Balance → AR/AP/Cash/Bank → P&L → Balance Sheet → Budget Report (where relevant).
3. **Independent recalculation.** For every accounting/reporting test, the expected number is calculated manually (or in a spreadsheet) *before* looking at the system output. The system is the thing under test, never the source of truth.
4. **Both interpretations tested where the spec is ambiguous.** See Section 3 — Assumptions. Where an assumption was made, a secondary test exists to confirm the *rejected* alternative is NOT what happens (i.e., a boundary test proving the system behaves per the chosen policy and not the other one).
5. **Layered coverage** — Unit → Functional → Integration → E2E → Regression → Smoke → UAT, run in that order (see Section 22 — Execution Order at the end of this document).

---

## 2. Testing Scope

**In scope:** Contact Master, Product Master, Chart of Accounts, Journals, Journal Entries, Analytic Accounts, Budgets, Purchase Order, Vendor Bill, Sales Order, Customer Invoice, Payments (Cash/Bank), Balance Sheet, P&L, Budget Report, Role-Based Access (Admin/Accountant/Contact), Login/Signup screens shown in the mockup.

**Out of scope (not in the spec — flagged, not assumed):** Multi-currency, inventory/stock valuation methods (FIFO/weighted average), multi-company/consolidation, recurring invoices, credit notes as a distinct document type, e-invoicing/GST filing integration, mobile app, notification/email delivery testing (only triggering conditions are tested, not email deliverability).

---

## 3. Assumptions — Explicitly Flagged

The source spec (doc 1) is a hackathon-level PRD and is silent or ambiguous on several accounting design points. Per the request, nothing is silently assumed — every assumption below is stated with its reasoning, the rejected alternative, and what changes if the alternative is actually true.

### A-01: Purchases are expensed, not inventorized
- **Assumption:** Purchases post `Dr Purchase Expense / Cr Accounts Payable`. No Inventory/Stock asset account is used.
- **Why:** Doc 1's Chart of Accounts example lists only `Cash, Bank, Debtors, Creditors, Sales Income, Purchases Expense` — no Inventory account exists in the given CoA. The clarification received also described the transaction generically as "Purchase Expense / Inventory Dr," which does not resolve the ambiguity.
- **Alternative:** Inventory is capitalized as an asset on purchase and expensed via COGS on sale.
- **Test impact:** If Inventory accounting is actually implemented, every purchase test in Part 8/10 needs a parallel entry (`Dr Inventory` instead of `Dr Purchase Expense`), the Balance Sheet tests need an Inventory asset line, and P&L tests need a COGS line instead of gross Purchase Expense. **PART 8-INV** below contains the parallel test set to run if this assumption is wrong.

### A-02: Overpayment is accepted and creates a credit/advance balance
- **Assumption (per stakeholder answer):** Overpayment is allowed; the excess is held as a customer/vendor credit balance (advance), not rejected and not silently discarded.
- **Test impact:** Requires the system to have *some* representation of "customer advance" (e.g., a negative outstanding balance on the contact, or a separate Advance account). If no such field/account exists in the actual build, this whole area is a confirmed defect area — see AC-OVERPAY-01..04 in Part 8.

### A-03: Tax is a single flat percentage per line, exclusive of the entered price, posted to a "Tax Payable" liability account
- **Why:** Doc 1 only says "Tax" with no further detail; a single Tax Payable liability account is the simplest standard model and is used consistently in the stakeholder's own worked example (₹50,000 + ₹9,000 tax = ₹59,000 gross).
- **Alternative:** Tax-inclusive pricing, multiple tax components (CGST+SGST), or no dedicated Tax Payable account (tax merged into Sales Income).
- **Test impact:** If tax is inclusive, all "gross = net + tax" assertions in Part 8/9/33 must be re-derived as "net = gross / (1+rate)".

### A-04: No Trial Balance screen exists
- **Why:** Doc 1 defines exactly three reports (Balance Sheet, P&L, Budget Report). No Trial Balance screen appears in the mockup.
- **Test impact:** Trial Balance is tested only as a *derived, off-system check* (tester's own spreadsheet cross-check that ΣDebits = ΣCredits across all journal entries) — not as a UI screen to click into. If a Trial Balance screen does exist in the build, promote TB-01..TB-06 (Part 9) from "manual reconciliation" to "UI verification."

### A-05: Accountant (Invoicing User) can create master data but not archive it
- **Why:** Doc 1 gives Admin explicit "Create/Modify/Archive," but only "Creates Master Data" for the Accountant role — archive is not listed for the Accountant.
- **Alternative:** Accountant can also modify/archive.
- **Test impact:** RBAC-05..RBAC-08 test both the "should fail" and "should succeed" version of Accountant-archives-a-record; whichever the app does becomes the documented behavior, and the other is flagged as a spec-deviation, not necessarily a bug.

### A-06: A Contact-user account is auto-created (with a system-generated invite/credential flow) whenever a Contact is saved with an associated email
- **Why:** Doc 1 states this happens "when creating Contact Master data" without detail.
- **Test impact:** CON-USER-01..05 test the credential/first-login flow; if this turns out to be a manual, separate "invite" action instead of automatic, those tests are re-scoped as manual-trigger tests instead of automatic-trigger tests.

### A-07: Analytic Account is an optional field on Sales Order / Purchase Order / Journal Entry lines
- **Why:** The Budget module requires transactions to roll up into an Analytic Account, but neither the PO/SO field list in doc 1 nor the (illegible at full resolution) mockup form conclusively shows this field present on the transaction entry screens.
- **Test impact:** BUD-INT-01..06 test whether Budget Actuals ever populate at all; if the field is missing from PO/SO, this is flagged as a **P0 gap** — the Budget Report cannot function as specified without it.

### A-08: Currency is INR (₹), 2-decimal precision, and rounding is "round-half-up" at the invoice-line level
- **Why:** Not stated in doc 1; used consistently for numeric examples going forward for concreteness. Test cases are currency-agnostic and use "₹" only as a placeholder.

### A-09: A zero-value journal entry (Debit = Credit = 0) is invalid and must be rejected
- **Why:** A zero-amount posting has no accounting meaning and is most commonly blocked by ERP systems (e.g., Odoo rejects it).
- **Alternative:** System allows it (e.g., as a placeholder/draft).
- **Test impact:** JE-007/JE-008 test both outcomes; whichever passes becomes documented behavior.

---

## 4. Risk Areas (ranked)

| Rank | Area | Why it's high risk |
|---|---|---|
| 1 | Journal-entry balancing engine | Every single transaction depends on this; one rounding bug corrupts every downstream report |
| 2 | Payment allocation (partial/over/duplicate) | Money-handling logic with many edge states |
| 3 | Report reconciliation (P&L / Balance Sheet / Budget) | Aggregation bugs are invisible unless independently recalculated |
| 4 | RBAC / Contact-user data isolation | Financial data leakage between customers/vendors is a severe real-world defect |
| 5 | Archive/edit of master data referenced by historical transactions | Silent retroactive corruption of historical reports |
| 6 | Tax calculation & rounding | Compounds across every sale; easy to get "close but wrong" |
| 7 | Budget ↔ Analytic Account ↔ Transaction linkage | Entire module fails silently if the linking field (A-07) is missing |
| 8 | Status-transition integrity (PO/SO/Bill/Invoice lifecycle) | Illegal state transitions cause duplicate or orphaned accounting entries |

---

## 5. Roles & Permission Matrix

| Action | Admin | Accountant | Contact |
|---|---|---|---|
| View master data | ✅ | ✅ | ❌ (own record only) |
| Create master data | ✅ | ✅ | ❌ |
| Edit master data | ✅ | ✅ (assumption A-05) | ❌ |
| Archive master data | ✅ | ⚠️ per A-05 (test both) | ❌ |
| Create PO | ✅ | ✅ | ❌ |
| Create SO | ✅ | ✅ | ❌ |
| Create Vendor Bill | ✅ | ✅ | ❌ |
| Create Customer Invoice | ✅ | ✅ | ❌ |
| Record payment (on behalf of contact) | ✅ | ✅ | ❌ |
| Make own payment | N/A | N/A | ✅ |
| Create Journal / Journal Entry | ✅ | ✅ | ❌ |
| View reports (BS/P&L/Budget) | ✅ | ✅ | ❌ |
| Edit posted accounting data | ⚠️ P0 — must be blocked or explicitly reversible only | ⚠️ same | ❌ |
| View other contacts' invoices/bills | ❌ | ❌ (only if outside job function — flag if allowed) | ❌ |
| View own invoices/bills | N/A | N/A | ✅ |

Every ✅/❌ cell above has a corresponding pair of RBAC test cases in Part 5 — one proving the allowed action **succeeds**, one proving the disallowed action **fails**, tested via UI **and** direct action/API call (not just hidden buttons).

---

## 6. Chart of Accounts Used Throughout This Suite

| Account | Type | Normal Balance |
|---|---|---|
| Cash | Asset | Debit |
| Bank | Asset | Debit |
| Accounts Receivable (Debtors) | Asset | Debit |
| Accounts Payable (Creditors) | Liability | Credit |
| Tax Payable | Liability | Credit |
| Sales Income | Income | Credit |
| Purchase Expense | Expense | Debit |
| Capital | Capital/Equity | Credit |
| Customer Advance (per A-02) | Liability | Credit |

---

# PART 1 — Master Data Unit Tests

## 1.1 Contact Master

| ID | Type | Priority | Preconditions | Steps | Expected Result | Postcondition |
|---|---|---|---|---|---|---|
| CON-001 | Functional | P1 | Logged in as Admin | Create contact: Name="Nimesh Pathak", Type=Customer, Email, Mobile, Address, Image | Contact saved; appears in Contact List View with correct type badge | Contact selectable in SO |
| CON-002 | Functional | P1 | Contact exists | Edit mobile number | Updated value persists; audit/last-modified reflects change | New value used in future docs |
| CON-003 | Functional | P2 | Contact exists, unused | Archive contact | Contact moves to archived filter, disappears from active "Select Customer" dropdown | Cannot be selected in new SO/PO |
| CON-004 | Functional | P2 | Multiple contacts exist | Search "Nimesh" | Only matching contact(s) returned | — |
| CON-005 | Functional | P2 | Contacts of both types exist | Filter by Type=Vendor | Only vendors shown | — |
| CON-006 | Functional | P1 | — | Create contact Type=Both | Contact is selectable as both Customer in SO and Vendor in PO | — |
| CON-007 | Validation | P1 | — | Save contact with Name blank | Save blocked; "Name is required" shown | No record created |
| CON-008 | Validation | P1 | — | Enter Email = "nimesh@@invalid" | Save blocked with email-format error | — |
| CON-009 | Validation | P2 | — | Enter Mobile = "12" (too short) | Save blocked / validation warning | — |
| CON-010 | Validation | P2 | — | Enter Mobile = letters "abcdefghij" | Save blocked | — |
| CON-011 | Validation | P2 | — | Enter Pincode = "AB123" | Save blocked or normalized per locale rule (flag if accepted silently) | — |
| CON-012 | Boundary | P3 | — | Name = 255-char string | Confirm system's max length is enforced consistently (not silently truncated on save but shown untruncated on screen) | — |
| CON-013 | Edge | P2 | — | Name = " Nimesh " (leading/trailing spaces) | Value is trimmed on save, not stored with stray spaces | Search still finds it as "Nimesh" |
| CON-014 | Edge | P2 | — | Name contains emoji/Unicode (e.g. "Nimesh 🪑") | Either accepted and displayed correctly everywhere, or rejected with clear message — must not corrupt downstream PDF/invoice rendering | — |
| CON-015 | Negative/Security | P1 | — | Name = `<script>alert(1)</script>` | Stored as literal text and escaped on render; NOT executed anywhere it's displayed (invoice, contact list) | No XSS |
| CON-016 | Negative/Security | P1 | — | Name = `Robert'); DROP TABLE contacts;--` | Stored literally; no SQL error, no data loss | Table intact |
| CON-017 | Validation | P2 | Contact "Nimesh" (mobile X) exists | Create second contact with same mobile X | Flag as duplicate (warn or block per implemented policy — document which) | — |
| CON-018 | Validation | P2 | Contact with email Y exists | Create second contact, same email Y, different case (Y vs y) | Duplicate check must be case-insensitive if duplicate blocking is implemented | — |
| CON-019 | Lifecycle | P0 | Contact used in a posted Invoice | Attempt to delete (hard-delete) the contact | Deletion blocked — "Contact is referenced by existing transactions" | Historical invoice still shows original contact name |
| CON-020 | Lifecycle | P0 | Contact used in a posted Invoice | Attempt to archive the contact | Archive succeeds (archiving ≠ deleting) but contact disappears from *new*-document dropdowns only | Old invoice still displays and reprints correctly |
| CON-021 | Lifecycle | P1 | Contact archived, has historical invoice | Open historical invoice | Old invoice still fully readable/printable, contact name intact | — |
| CON-022 | Lifecycle | P1 | Contact used in transactions | Edit contact's Name after transactions exist | New name reflected going forward; verify whether historical invoice PDFs freeze the old name or dynamically show new one (document actual behavior; flag if historical documents silently change) | — |
| CON-023 | Security/RBAC | P0 | Two Contact-users A (linked to Customer A) and B exist | Log in as Contact A, attempt to view Customer B's invoice via direct URL/ID | Access denied (403), not just hidden from UI | No data returned in response payload |
| CON-024 | Security/RBAC | P0 | Contact-user A | Attempt to open Chart of Accounts / Journal Entries screen via direct link | Access denied | — |
| CON-025 | Security/RBAC | P1 | Contact-user A | Attempt to edit own invoice amount via API | Rejected — Contact role has no write access to financial documents, only payment action | — |

## 1.2 Product Master

| ID | Type | Priority | Steps | Expected Result |
|---|---|---|---|---|
| PRD-001 | Functional | P1 | Create Product "Office Chair", Type=Goods, Sales Price=3000, Cost=1800, Category=Furniture | Saved and selectable in SO/PO |
| PRD-002 | Functional | P2 | Create Type=Service (e.g. "Assembly Service") | Selectable in SO with no quantity/stock implication |
| PRD-003 | Functional | P2 | Create Type=Combo | Confirm actual combo behavior (does it explode into components on the order line, or act as a single priced line?) — document as found; flag ambiguity if unclear |
| PRD-004 | Validation | P1 | Save with Sales Price blank | Blocked |
| PRD-005 | Validation | P2 | Sales Price = -500 | Blocked or explicit warning (negative sales price is not a valid business state) |
| PRD-006 | Validation | P2 | Cost = -500 | Same as above |
| PRD-007 | Boundary | P2 | Price = 0.00 | Accepted only if a "free item" business case is intended — flag if silently accepted without warning |
| PRD-008 | Boundary | P3 | Price = 99999999999.99 (very large) | No overflow/rounding corruption; totals still calculate correctly on an order using this product |
| PRD-009 | Calculation | P2 | Sales Price < Cost | Product saves but system should surface a "selling below cost" warning if implemented; if not implemented, flag as a recommended control, not a bug |
| PRD-010 | Lifecycle | P0 | Product used in a posted Invoice | Archive product | Archive succeeds; product no longer selectable in new SO, but historical invoice line still displays original name/price |
| PRD-011 | Lifecycle | P0 | Product archived | Attempt to add archived product to new SO | Blocked / not shown in product picker |
| PRD-012 | Lifecycle | P1 | Product used historically | Edit Sales Price | New orders use new price; existing invoices retain their original recorded price (verify price is copied at transaction time, not looked up live) |
| PRD-013 | Validation | P2 | Duplicate product name | Warn or block per implemented policy (document which) |
| PRD-014 | Edge | P2 | Product name = long/Unicode/special chars | Same handling as CON-013/014/015/016 |

## 1.3 Chart of Accounts

| ID | Type | Priority | Steps | Expected Result |
|---|---|---|---|---|
| COA-001 | Functional | P1 | Create account "Tax Payable", Type=Liability | Saved and available in Journal Entry account picker |
| COA-002 | Validation | P1 | Save account with blank Type | Blocked |
| COA-003 | Validation | P2 | Duplicate account name | Blocked or warned (document) |
| COA-004 | Accounting rule | P0 | Post several entries to "Cash" (Asset) | Balance moves in the debit direction for debits, credit direction for credits, and the *net* balance display matches Assets' normal-debit convention |
| COA-005 | Accounting rule | P0 | Post entries to "Creditors" (Liability) | Balance correctly accumulates as a credit-normal balance |
| COA-006 | Lifecycle | P0 | Account referenced by posted journal entries | Attempt to change its Type (e.g. Asset → Expense) | Blocked, or if allowed, flag as **P0 risk** — this would corrupt every historical report that used this account |
| COA-007 | Lifecycle | P0 | Account referenced by transactions | Archive the account | Archive succeeds but account cannot be selected for *new* journal lines; historical entries still display correctly and still roll up into reports for their period |
| COA-008 | Negative | P1 | Attempt to post a Journal Entry line against an archived account | Blocked with clear error | — |

## 1.4 Journals

| ID | Type | Priority | Steps | Expected Result |
|---|---|---|---|---|
| JRN-001 | Functional | P1 | Create "Sales Journal", Type=Sale, Default Account=Sales Income | Saved; used automatically when Customer Invoice is posted |
| JRN-002 | Validation | P1 | Save journal with no Default Account | Blocked, or allowed only if journal type doesn't require one (document) |
| JRN-003 | Validation | P2 | Assign a Default Account whose Type mismatches the Journal's purpose (e.g. Sales Journal defaulting to a Liability account) | Should warn — flag as a control gap if silently accepted |
| JRN-004 | Lifecycle | P0 | Journal used in posted entries | Archive Journal | New transactions can't select it; historical entries remain intact and still show in reports |
| JRN-005 | Lifecycle | P1 | — | Attempt to delete a Journal with entries | Blocked |

## 1.5 Analytic Accounts

| ID | Type | Priority | Steps | Expected Result |
|---|---|---|---|---|
| ANA-001 | Functional | P1 | Create Analytic Account "Retail Division", Type=Income | Saved, selectable on transaction lines (subject to A-07) |
| ANA-002 | Functional | P1 | Create Analytic Account Type=Expense | Selectable for expense-side transactions |
| ANA-003 | Integration | P0 | Post a Sales Order tagged with Analytic Account "Retail Division" | Confirm whether the amount actually rolls up into that Analytic Account's totals — **if the field doesn't exist on the SO/PO form, this fails and confirms Risk #7 (A-07)** |
| ANA-004 | Validation | P2 | Assign Income-type transaction to an Expense-type Analytic Account | Should be blocked or warned |

---

# PART 2 — Transaction Module Unit Tests

## 2.1 Purchase Order

| ID | Type | Priority | Steps | Expected Result |
|---|---|---|---|---|
| PO-001 | Functional | P1 | Select Vendor=Azure Furniture, Product=Wooden Chair, Qty=100, Unit Price=1000 | PO created, Total = 100,000, Status=Draft |
| PO-002 | Functional | P1 | Confirm PO | Status → Confirmed |
| PO-003 | Negative | P1 | Attempt to confirm an already-Confirmed PO | Blocked / no duplicate confirmation event, no duplicate downstream record |
| PO-004 | Negative | P0 | Attempt to cancel a Confirmed PO that has already been converted to a Bill | Blocked — must not orphan the Bill |
| PO-005 | Negative | P0 | Attempt to "Receive" goods on a Cancelled PO | Blocked |
| PO-006 | Negative | P0 | Attempt to Bill a Cancelled PO | Blocked |
| PO-007 | Negative | P1 | Attempt to modify line items after PO is Billed | Blocked, or only allowed via a formal amendment path (document actual behavior) |
| PO-008 | Validation | P1 | Qty = 0 | Blocked |
| PO-009 | Validation | P1 | Qty = -5 | Blocked |
| PO-010 | Validation | P2 | Qty = 2.5 for a "Goods" product not sold fractionally | Flag if silently accepted — furniture units are typically whole numbers |
| PO-011 | Validation | P2 | Qty = 999999999 | No overflow in Total calculation |
| PO-012 | Validation | P1 | Unit Price = 0 | Accepted only if a free-goods business case is valid — flag otherwise |
| PO-013 | Validation | P1 | Unit Price = -100 | Blocked |
| PO-014 | Calculation | P1 | Two lines: Qty 100 × ₹1000 and Qty 5 × ₹250.55 | PO Total = exact sum with correct 2-decimal rounding |
| PO-015 | Functional | P2 | Add duplicate product line (Wooden Chair twice) | Confirm system either merges lines or keeps them separate consistently — document behavior |
| PO-016 | Negative | P1 | Select an archived Vendor | Vendor not selectable in picker |
| PO-017 | Negative | P1 | Select an archived Product | Product not selectable in picker |
| PO-018 | Concurrency | P1 | Two users try to Confirm the same Draft PO simultaneously | Only one confirmation succeeds; no duplicate journal/bill created |

## 2.2 Vendor Bill

| ID | Type | Priority | Steps | Expected Result |
|---|---|---|---|---|
| VB-001 | Functional | P1 | Convert Confirmed PO → Vendor Bill | Bill inherits Vendor, Products, Qty, Price from PO |
| VB-002 | Validation | P1 | Bill Invoice Date = 10-Sep, Due Date = 05-Sep (before invoice date) | Blocked or warned |
| VB-003 | Functional | P2 | Partial bill: Bill only 60 of the 100 chairs ordered | PO remains partially billed; remaining 40 still billable |
| VB-004 | Negative | P0 | Attempt to bill more quantity than was received/ordered | Blocked, or explicit over-billing confirmation required (document) |
| VB-005 | Validation | P2 | Duplicate Bill/Invoice Number entered manually (if manual numbering allowed) | Blocked |
| VB-006 | Functional | P3 | Attempt to create a Bill with no linked PO (if business rule allows direct bills) | Confirm whether this is supported; if yes, test its accounting entries identically to PO-based bills |
| VB-007 | Accounting | P0 | Post the Bill for ₹100,000 credit purchase | See Part 8 AC-PUR-01 for full books-of-account trace |

## 2.3 Sales Order

| ID | Type | Priority | Steps | Expected Result |
|---|---|---|---|---|
| SO-001 | Functional | P1 | Customer=Nimesh Pathak, Product=Office Chair, Qty=5, Unit Price=3000, Tax=18% | SO Total = 5×3000 = 15,000 net, Tax=2,700, Gross=17,700 |
| SO-002 | Validation | P1 | Qty = 0 / -1 | Blocked |
| SO-003 | Validation | P1 | Unit Price = -100 | Blocked |
| SO-004 | Calculation | P1 | Tax = 0% | Gross = Net, Tax Payable line = 0 (or omitted; document which) |
| SO-005 | Calculation | P2 | Tax = 100% (extreme) | Correctly doubles the gross; no overflow |
| SO-006 | Calculation | P2 | Tax = 18.5% (decimal rate) | Rounding matches the documented rounding policy (A-08) |
| SO-007 | Calculation | P2 | Multiple products, mixed tax rates (if supported) | Each line taxed independently; total Tax Payable = sum of line taxes |
| SO-008 | Negative | P1 | Archived customer/product selected | Not selectable |
| SO-009 | Functional | P2 | Discount field (if it exists) applied | Confirm actual discount accounting treatment; if not supported, mark N/A |

## 2.4 Customer Invoice

| ID | Type | Priority | Steps | Expected Result |
|---|---|---|---|---|
| INV-001 | Functional | P1 | Generate Invoice from SO-001 | All SO fields carried forward unchanged: customer, product, qty, price, tax, total |
| INV-002 | Validation | P1 | Invoice number auto-generated | Unique, sequential/non-colliding even under concurrent creation (see INV-CONC-01) |
| INV-003 | Concurrency | P0 | Two invoices created in rapid succession / double-click Save | No duplicate invoice number; no duplicate journal entry for a single logical invoice |
| INV-004 | Functional | P1 | View Outstanding Amount before any payment | Outstanding = Gross Total |
| INV-005 | Accounting | P0 | Post Invoice INV-001 (₹17,700 gross, ₹15,000 net, ₹2,700 tax) | See Part 8 AC-SALE-01 for full books-of-account trace |

## 2.5 Payments

| ID | Type | Priority | Steps | Expected Result |
|---|---|---|---|---|
| PAY-001 | Functional | P1 | Full payment against Invoice via Bank | Outstanding → 0, Status → Paid |
| PAY-002 | Functional | P1 | Partial payment | Outstanding reduces by paid amount, Status → Partially Paid |
| PAY-003 | Functional | P2 | Multiple partial payments over time | Each payment reduces Outstanding correctly and independently; sum of payments never exceeds invoice unless overpayment path is triggered |
| PAY-004 | Negative | P1 | Payment amount = 0 | Blocked |
| PAY-005 | Negative | P1 | Payment amount = negative | Blocked |
| PAY-006 | Boundary | P0 | Payment = 12,000 against a 10,000 Invoice (overpayment) | Per A-02: payment applies 10,000 to the invoice (Status=Paid) and the remaining 2,000 becomes a customer Advance/Credit balance — verify the credit balance actually appears against the contact |
| PAY-007 | Negative | P0 | Attempt a second full payment against an already-Paid invoice | Blocked, or explicitly routed into the Advance/Credit flow (must not silently create a duplicate paid state) |
| PAY-008 | Negative | P1 | Attempt payment against a Cancelled invoice | Blocked |
| PAY-009 | Negative | P1 | Attempt payment against an archived contact's invoice | Existing invoice should still be payable (payment isn't a "new use" of the contact for selection purposes) — confirm actual behavior |
| PAY-010 | Functional | P1 | Cash payment recorded | Cash ledger moves; Bank ledger untouched |
| PAY-011 | Functional | P1 | Bank payment recorded | Bank ledger moves; Cash ledger untouched |
| PAY-012 | Negative | P0 | Verify a Cash payment never appears in the Bank account balance and vice versa | Confirmed via ledger inspection, not just the payment screen dropdown |
| PAY-013 | Validation | P2 | Duplicate payment reference number entered twice | Warn or block (document policy) |
| PAY-014 | Concurrency | P0 | Double-click "Register Payment" | Exactly one payment record and one journal entry created, not two |

---

# PART 3 — Accounting Module Unit Tests (Journal Entry Engine)

This is the highest-priority module in the whole system: **every other report depends on it being airtight.**

| ID | Scenario | Priority | Expected Result |
|---|---|---|---|
| JE-001 | One debit line / one credit line, equal amounts | P0 | Entry posts successfully |
| JE-002 | Multiple debits / one credit, sums equal | P0 | Posts successfully; ledger reflects each debit line separately |
| JE-003 | One debit / multiple credits, sums equal | P0 | Posts successfully |
| JE-004 | Multiple debits / multiple credits, sums equal | P0 | Posts successfully |
| JE-005 | Debit-only lines (no credit line at all) | P0 | **Rejected** — "Entry is unbalanced" |
| JE-006 | Credit-only lines | P0 | **Rejected** |
| JE-007 | Debit = 0, Credit = 0 (both zero) | P1 | Per A-09: rejected as a no-op entry — confirm actual behavior |
| JE-008 | One line has both a Debit and a Credit value filled simultaneously | P1 | Rejected — a line must be either a debit or a credit, not both |
| JE-009 | Debit total = 100, Credit total = 100 | P0 | **Pass** |
| JE-010 | Debit total = 100, Credit total = 90 | P0 | **Reject** — "Debit ≠ Credit, difference ₹10" |
| JE-011 | Debit total = 90, Credit total = 100 | P0 | **Reject** |
| JE-012 | Debit = 100.005, Credit = 100.004 (sub-cent rounding mismatch) | P0 | Confirm the system's rounding tolerance policy — either both round to 100.01/100.00 and are compared post-rounding, or the raw mismatch is rejected. Document which; flag if inconsistent |
| JE-013 | Negative Debit value entered (e.g., -500) | P1 | Rejected — a negative debit is a modeling error, not a valid credit shortcut |
| JE-014 | Negative Credit value entered | P1 | Rejected |
| JE-015 | Empty Account field on a line with a non-zero amount | P0 | Rejected — "Account is required on all lines" |
| JE-016 | Same account used twice within one entry (e.g., Debit Cash ₹500, Debit Cash ₹300 elsewhere in same entry) | P2 | Allowed if it's two distinct legitimate postings; verify the ledger sums both correctly rather than overwriting |
| JE-017 | Very large amount (₹999,999,999.99) | P2 | No overflow/precision loss anywhere downstream (ledger, reports) |
| JE-018 | Decimal amounts to 2 places throughout a multi-line entry | P1 | Sums reconcile exactly |
| JE-019 | Auto-generated entry from a Customer Invoice matches the invoice's own totals exactly | P0 | See Part 8 for the full trace — Journal Entry Debit/Credit lines must equal invoice Net/Tax/Gross exactly, no rounding drift |
| JE-020 | Auto-generated entry from a Vendor Bill matches the bill's totals exactly | P0 | Same as above for purchases |

---

# PART 4 — Validation & Negative Tests (Consolidated Edge-Case Matrix)

Applies across **every** text/number/date field system-wide unless a module-specific override exists above.

### Text fields
| Case | Expected |
|---|---|
| Null / not submitted | Rejected if mandatory |
| Empty string `""` | Rejected if mandatory |
| Whitespace-only `"   "` | Treated as empty — rejected if mandatory (must not pass as "non-empty") |
| Leading/trailing spaces | Trimmed on save |
| Max-length overflow (>255/>1000 chars depending on field) | Rejected or truncated with warning — must not silently corrupt the DB |
| Unicode / emoji | Accepted and rendered correctly everywhere (invoice PDF, list views) or explicitly rejected with a clear message |
| HTML/script injection (`<script>`, `<img onerror=`) | Escaped on render; never executed |
| SQL-meta characters (`'`, `--`, `;DROP`) | Stored literally; no query error, no data loss |
| Duplicate values (name/email/mobile/account name) | Warned or blocked per documented policy — must be applied **consistently** across all creation and edit paths |

### Numeric fields (price, qty, amount, tax rate)
| Case | Expected |
|---|---|
| 0 | Accepted only where a genuine zero-value business case exists (documented per field); otherwise rejected |
| Negative | Rejected for price/qty/amount fields; may be valid for a designed "reversal" feature only if one exists |
| Extremely large (near numeric type limits) | No overflow, no silent wraparound |
| Decimal precision beyond 2 places (e.g., 100.999) | Rounded per policy (A-08) consistently, not truncated in one place and rounded in another |

### Date fields
| Case | Expected |
|---|---|
| Same start/end date (budget period) | Accepted as a valid 1-day period, or explicitly rejected with reason |
| End date before start date | Rejected |
| Future-dated transaction | Accepted (accounting systems generally allow forward-dating) unless a business rule blocks it — document |
| Backdated transaction into a closed period (if period-close exists) | Should be blocked; if no period-close feature exists, flag as a control gap |
| Leap-day (29-Feb) | Accepted and calculates correctly in period-based reports |
| Year-end boundary (31-Dec / 01-Jan) | Transaction correctly attributed to the right fiscal year in reports |
| Month-end boundary | Same, for monthly report filters |

### Transaction-integrity edge cases
| Case | Expected |
|---|---|
| Double-click Save on any Create form | Exactly one record created |
| Browser back button after successful save, then Save again | No duplicate record; ideally a stale-form warning |
| Network retry after timeout (simulated) | Idempotent — no duplicate transaction/journal entry |
| Refresh page mid-transaction-entry | No partial/corrupt record persisted |

---

# PART 5 — Role / Permission Tests

Each row in the Section 5 matrix gets a positive and negative test. Representative set (full set follows the same pattern for every matrix cell):

| ID | Role | Action | Expected |
|---|---|---|---|
| RBAC-01 | Admin | Archive a Contact | ✅ Succeeds |
| RBAC-02 | Accountant | Archive a Contact | Per A-05 — test both outcomes, document actual |
| RBAC-03 | Contact | Attempt to view Chart of Accounts via UI | ❌ Menu item not shown |
| RBAC-04 | Contact | Attempt to view Chart of Accounts via direct URL/API call | ❌ 403/blocked at the server, not just hidden in UI |
| RBAC-05 | Contact A | View Contact A's own invoice | ✅ Succeeds |
| RBAC-06 | Contact A | View Contact B's invoice by guessing/incrementing the invoice ID in the URL | ❌ Blocked — this is the single most important security test in the suite |
| RBAC-07 | Contact | Make a payment on their own invoice | ✅ Succeeds |
| RBAC-08 | Contact | Attempt to edit their own invoice amount before paying | ❌ Blocked |
| RBAC-09 | Accountant | Create a Journal Entry directly (not via SO/PO) | ✅ Succeeds (per doc 1, Accountant can record transactions) |
| RBAC-10 | Contact | Attempt to create/post a Journal Entry via API | ❌ Blocked |
| RBAC-11 | Admin | View P&L / Balance Sheet / Budget Report | ✅ Succeeds |
| RBAC-12 | Contact | Attempt to view P&L / Balance Sheet via direct URL | ❌ Blocked |
| RBAC-13 | Unauthenticated user | Attempt to hit any financial API endpoint without a session token | ❌ 401 |
| RBAC-14 | Admin | Deactivate an Accountant's login | Accountant immediately loses access on next request, not just on next login |

---

# PART 6 — Calculation Tests

| ID | Scenario | Expected |
|---|---|---|
| CALC-001 | PO: 100 × ₹1,000 | Total = ₹100,000 |
| CALC-002 | PO: 100 × ₹333.33 | Total = ₹33,333.00 (verify rounding, not ₹33,332.99 from float error) |
| CALC-003 | SO: Net ₹15,000, Tax 18% | Tax = ₹2,700.00, Gross = ₹17,700.00 |
| CALC-004 | SO: Net ₹10,000.33, Tax 18% | Tax = ₹1,800.06 (0.33×0.18=0.0594→ rounds correctly), Gross = ₹11,800.39 — verify actual system rounding matches policy A-08 |
| CALC-005 | Multi-line SO, tax applied per-line vs. on-total | Confirm which model is implemented; totals must match either way, but a per-line-rounded total can legitimately differ by a cent from a total-then-tax model — verify system is internally consistent, not mixing both |
| CALC-006 | Payment allocation across 3 partial payments (₹20,000 + ₹15,000 + ₹24,000 against a ₹59,000 invoice) | Running outstanding after each: ₹39,000 → ₹24,000 → ₹0; status Draft→Partially Paid→Partially Paid→Paid |
| CALC-007 | Budget Variance = Budget − Actual | Verify sign convention is consistent (positive = under budget, or vice versa — document and confirm it's not flipped) |
| CALC-008 | Cumulative rounding across 50 invoices summed in a report vs. summed manually | Must match exactly to the cent — a common source of "off by a few paise" report bugs |

---

# PART 7 — Multi-Module Integration Tests

| ID | Modules | Steps | Expected |
|---|---|---|---|
| INT-001 | Contact + Product + SO | Create both master records, then build an SO referencing them | SO correctly pulls contact details and product price as defaults |
| INT-002 | SO + Invoice | Generate Invoice from confirmed SO | All fields carried over exactly; SO status updates to "Invoiced" |
| INT-003 | Invoice + Payment | Register payment against invoice | Invoice outstanding/status updates immediately |
| INT-004 | Invoice + Journal Entry | Post invoice | Corresponding JE auto-created, balanced, correct accounts |
| INT-005 | Payment + Cash/Bank | Register bank payment | Bank ledger balance increases by exact payment amount |
| INT-006 | PO + Vendor Bill | Convert PO to Bill | Bill inherits PO data exactly; PO status updates |
| INT-007 | Vendor Bill + Payment | Pay bill | Payable reduces; Bank/Cash reduces |
| INT-008 | Payment + Journal Entry | Any payment | JE auto-created and balanced |
| INT-009 | Journal Entry + Ledger | Any posted JE | Each line posts to the correct account ledger with correct running balance |
| INT-010 | Ledger + P&L | Sales Income and Purchase Expense ledgers | P&L = ΣIncome ledger − ΣExpense ledger for the selected period, reconciled |
| INT-011 | Ledger + Balance Sheet | Asset/Liability/Capital ledgers | Balance Sheet totals reconcile to ledger balances at the report date |
| INT-012 | Analytic Account + Budget | Transaction tagged to Analytic Account inside a Budget's period | Actual amount on Budget Report increases by the transaction amount (subject to A-07) |
| INT-013 | Budget + Transactions + Budget Report | Multiple transactions across the budget period | Budget Report shows correct cumulative Actual vs. Budget vs. Variance |
| INT-014 | Master Data + Transactions + Reports | Archive a Contact after transactions exist, then re-run historical P&L for a past period | Historical P&L is unaffected — archiving must not retroactively remove data from reports |

---

# PART 8 — Accounting Integrity Tests: Books of Account (3-Layer Trace)

This section documents the **Accounting Trace** for every major transaction type. Each one is shown as:

```
BUSINESS EVENT → SOURCE DOCUMENT → JOURNAL ENTRY → DEBIT/CREDIT → LEDGER →
ACCOUNT BALANCE → AR/AP/CASH/BANK/TAX → P&L → BALANCE SHEET → BUDGET REPORT
```

For each, three layers are given:
- **Layer 1 – Real-World Books** (how an accountant would write it)
- **Layer 2 – Software Record** (what the system must create internally)
- **Layer 3 – Exact UI Verification Location** (where the tester clicks to confirm it)

---

## AC-SALE-01 — Credit Customer Sale (taxable)

**Business event:** Nimesh Pathak buys 5 Office Chairs @ ₹3,000 each, on credit, 18% tax.

**Layer 1 — Real books:**
```
JOURNAL
10-Sep-2026
Accounts Receivable A/c  Dr.        ₹17,700
      To Sales Income A/c                          ₹15,000
      To Tax Payable A/c                            ₹2,700
Narration: Being sale of 5 Office Chairs to Nimesh Pathak on credit (INV-0001).

LEDGER — ACCOUNTS RECEIVABLE A/C
10-Sep-2026 | To Sales | ₹17,700 | — | ₹17,700 Dr.

LEDGER — SALES INCOME A/C
10-Sep-2026 | By Accounts Receivable | — | ₹15,000 | ₹15,000 Cr.

LEDGER — TAX PAYABLE A/C
10-Sep-2026 | By Accounts Receivable | — | ₹2,700 | ₹2,700 Cr.
```

**Layer 2 — Software record:**
```
Journal: Sales Journal | Date: 10-09-2026 | Reference: INV-0001
Journal Items:
  1. Accounts Receivable   Dr  ₹17,700
  2. Sales Income          Cr  ₹15,000
  3. Tax Payable           Cr  ₹2,700
Invoice: Total=17,700, Paid=0, Outstanding=17,700, Status=Unpaid
```

**Layer 3 — UI verification:**
| Screen | Field | Expected value |
|---|---|---|
| Sales → Customer Invoice INV-0001 | Grand Total / Outstanding / Status | 17,700 / 17,700 / Unpaid |
| Accounting → Journal Entries | Debit Accounts Receivable | 17,700 |
| Accounting → Journal Entries | Credit Sales Income | 15,000 |
| Accounting → Journal Entries | Credit Tax Payable | 2,700 |
| Accounting → Ledger (Accounts Receivable) | Balance | +17,700 |
| Reports → P&L | Sales Income | +15,000 (tax must NOT appear as income) |
| Reports → Balance Sheet | Accounts Receivable (Asset) | +17,700; Tax Payable (Liability) | +2,700 |

**Failure conditions:** invoice shows 17,700 but JE debit ≠ 17,700; P&L includes tax inside "Sales Income"; Balance Sheet doesn't balance (Assets ≠ Liabilities+Capital) after this single entry.

---

## AC-SALE-02 — Cash Customer Sale (immediate, no credit period)

```
Bank/Cash A/c  Dr.  ₹17,700
      To Sales Income A/c        ₹15,000
      To Tax Payable A/c          ₹2,700
```
Software: Invoice created and marked Paid in the same action (or Invoice + immediate Payment as two linked records — confirm which model is implemented and test both the Invoice AND the Payment JE separately if it's two records). UI check: Bank ledger increases by 17,700 immediately, Outstanding = 0, Status = Paid.

---

## AC-PAY-01 — Bank Payment Against Existing Invoice (Partial)

**Business event:** Customer pays ₹30,000 by Bank against the AC-SALE-01 invoice of ₹17,700 total... *(illustrative alternate figures per the specification example)* — using invoice ₹59,000 for this worked example per the stakeholder's own numbers:

```
REAL BOOKS
Bank A/c  Dr.                ₹30,000
      To Accounts Receivable A/c        ₹30,000

LEDGER RESULT
Bank: +₹30,000
Accounts Receivable: ₹59,000 − ₹30,000 = ₹29,000 Dr. (outstanding)
```
**Software record:**
```
Invoice: Total=59,000, Paid=30,000, Outstanding=29,000, Status=Partially Paid
Payment: Method=Bank, Amount=30,000, Reference=PAY-0001
Journal Entry: Debit Bank 30,000 / Credit Accounts Receivable 30,000
```
**UI verification:** Invoice screen shows Outstanding=29,000/Status=Partially Paid; Journal Entries shows the balanced 30,000/30,000 entry; Bank ledger +30,000; Accounts Receivable ledger −30,000 (net balance 29,000).

---

## AC-PAY-02 — Overpayment (per Assumption A-02)

**Business event:** Invoice = ₹10,000. Customer pays ₹12,000.

```
REAL BOOKS (advance/credit model)
Bank A/c  Dr.                       ₹12,000
      To Accounts Receivable A/c              ₹10,000
      To Customer Advance A/c                  ₹2,000
```
**Software record:** Invoice Outstanding=0, Status=Paid; a Customer Advance/Credit of ₹2,000 recorded against the contact, available to apply to a future invoice.
**UI verification:** Invoice screen: Paid=12,000 shown but Outstanding=0 (not negative, unless the UI is designed to show a negative/credit outstanding — document actual). Contact record or a "Customer Credit" screen shows ₹2,000 available. Bank ledger +12,000. Accounts Receivable ledger net change −10,000 (i.e., the invoice's own receivable fully cleared) plus a distinct +2,000 liability/advance line — **verify this is NOT incorrectly booked entirely against Accounts Receivable**, which would understate receivables.
**Failure condition:** system either rejects the payment outright (violates A-02 as clarified) or silently absorbs the extra ₹2,000 with no trace anywhere (money materializes from nowhere in the books) — both are P0 defects under the stated policy.

---

## AC-PUR-01 — Credit Purchase

**Business event:** Purchase 100 Wooden Chairs from Azure Furniture on credit, ₹1,000 each = ₹100,000. (Per Assumption A-01: expensed, not inventorized.)

```
REAL BOOKS
Purchase Expense A/c  Dr.        ₹100,000
      To Accounts Payable A/c              ₹100,000
```
**Software record:** Journal: Purchase Journal, Reference=BILL-0001, Debit Purchase Expense 100,000 / Credit Accounts Payable 100,000. Bill: Total=100,000, Paid=0, Outstanding=100,000.
**UI verification:** Purchase → Vendor Bill shows Outstanding=100,000; Journal Entries shows the balanced pair; Ledger → Accounts Payable +100,000; Reports → P&L shows Purchase Expense +100,000 (reduces net profit); Reports → Balance Sheet shows Accounts Payable (Liability) +100,000.

**If A-01 is wrong (Inventory is actually tracked) — PART 8-INV parallel test:**
```
Inventory A/c  Dr.       ₹100,000
      To Accounts Payable A/c     ₹100,000
```
and Purchase Expense/COGS is only recognized later, at the point of sale, matched against Sales Income. Run this parallel version if inventory accounting is confirmed present; check Balance Sheet for an Inventory asset line instead of the expense hitting P&L immediately.

---

## AC-PUR-02 — Vendor Payment (Bank, Partial then Full)

**Business event:** Pay Azure Furniture ₹60,000 now (of the ₹100,000 payable), then the remaining ₹40,000 later.

```
Payment 1:
Accounts Payable A/c  Dr.  ₹60,000
      To Bank A/c                    ₹60,000
→ Payable outstanding = ₹40,000

Payment 2:
Accounts Payable A/c  Dr.  ₹40,000
      To Bank A/c                    ₹40,000
→ Payable outstanding = ₹0
```
**UI verification after each payment:** Vendor Bill Outstanding updates (₹40,000 then ₹0), Status Partially Paid → Paid; Bank ledger decreases by each payment amount; Accounts Payable ledger decreases correspondingly; P&L unaffected by the payment itself (expense was already recognized at bill time); Balance Sheet: Accounts Payable liability reduces, Bank asset reduces by the same amounts (books stay balanced).

---

## AC-PUR-03 — Cash Vendor Payment

Same as AC-PUR-02 but `Dr Accounts Payable / Cr Cash`. **Critical check:** Cash ledger moves, Bank ledger does NOT move (see PAY-012).

---

## AC-TAX-01 — Taxable Sale, Full Trace

Net ₹50,000, Tax 18% = ₹9,000, Gross ₹59,000 (stakeholder's own worked figures).
```
Accounts Receivable A/c  Dr.  ₹59,000
      To Sales Income A/c                  ₹50,000
      To Tax Payable A/c                    ₹9,000
```
Trace through to P&L (Sales Income = 50,000 only, tax excluded) and Balance Sheet (Receivable +59,000, Tax Payable +9,000). This is the canonical worked example — used as the baseline reconciliation test in Part 9.

---

## AC-BUDGET-01 — Budgeted Income vs Actual

Budget: "Q3 Retail Sales", Analytic Account = "Retail Division", Planned = ₹500,000, Period = Jul–Sep.
Actual transactions tagged to "Retail Division" during the period sum to ₹430,000 (from multiple invoices).
**Expected Budget Report:** Budget=500,000, Actual=430,000, Variance=70,000 (under budget), consistent sign convention throughout.
**UI verification:** Each contributing invoice individually traceable — sum of the Analytic-tagged invoice net amounts must equal the reported Actual exactly (reconciliation test, not just a displayed number).

---

## AC-BUDGET-02 — Budgeted Expense, Over Budget

Budget: "Office Supplies Q3", Planned=₹20,000. Actual tagged expenses = ₹25,000.
**Expected:** Variance = −5,000 (over budget), report visually flags over-budget state if implemented.

---

# PART 9 — Reporting Tests & Reconciliation

## 9.1 Balance Sheet

| ID | Scenario | Expected |
|---|---|---|
| BS-001 | Fresh company, only Capital injected (₹1,00,000) | Assets(Bank)=1,00,000; Liabilities=0; Capital=1,00,000 → balances |
| BS-002 | After AC-SALE-01 and AC-PUR-01 posted, no payments yet | Assets: AR +17,700; Liabilities: AP +100,000, Tax Payable +2,700; verify Assets = Liabilities + Capital (+ retained P&L effect) still holds |
| BS-003 | Date filter: report as of a date BEFORE a transaction was posted | Transaction excluded — Balance Sheet reflects only prior state |
| BS-004 | Date filter: report as of a date AFTER | Transaction included |
| BS-005 | Empty period (no transactions ever) | Balance Sheet shows zeros / opening state, no errors |
| BS-006 | Historical report after a referenced contact/product was later archived | Report unchanged — archiving must not alter historical numbers |
| BS-007 | Large volume (500+ transactions in the period) | Performance acceptable; totals still reconcile exactly to manual ledger sums |

**Reconciliation formula tested:** `Assets = Liabilities + Capital` — recompute independently from every posted ledger balance and compare to the report's own total, for every BS-* test above.

## 9.2 Profit & Loss

| ID | Scenario | Expected |
|---|---|---|
| PL-001 | Sales only (no purchases) in period | Net Profit = Total Sales Income |
| PL-002 | Purchases only | Net Loss = Total Purchase Expense |
| PL-003 | Sales ₹15,000 + Purchases ₹10,000 | Net Profit = ₹5,000 |
| PL-004 | Sales < Purchases | Net Loss shown correctly (negative, or explicit "Loss" label) |
| PL-005 | No transactions in period | Zero / blank report, no crash |
| PL-006 | Tax amounts | Confirmed excluded from both Income and Expense lines (tax is a liability passthrough, not P&L) |
| PL-007 | Date-range filter (e.g. only September) | Only transactions dated within September are included |
| PL-008 | Two invoices, ₹50,000 and ₹30,000 | Reported Sales Income = ₹80,000, independently reconciled against the sum of the two invoices' JE credit lines |

## 9.3 Budget Report

| ID | Scenario | Expected |
|---|---|---|
| BUD-RPT-01 | Under budget | Variance positive, correct remaining amount |
| BUD-RPT-02 | Exactly on budget | Variance = 0 |
| BUD-RPT-03 | Over budget | Variance negative / flagged |
| BUD-RPT-04 | No actuals posted yet | Actual = 0, Variance = full Budget amount |
| BUD-RPT-05 | No budget defined for a given Analytic Account with actual transactions | Report handles gracefully (shows "no budget" rather than error or a false 0-variance) |
| BUD-RPT-06 | Multiple budgets, same Analytic Account, overlapping periods | Confirm system's overlap policy (block creation, or sum both, or use most specific) — document and test accordingly |

## 9.4 Trial-Balance-Style Cross-Check (off-system, per A-04)

| ID | Scenario | Expected |
|---|---|---|
| TB-01 | Sum all Debit journal-item amounts across the full ledger | Equals sum of all Credit journal-item amounts, to the cent, at all times |
| TB-02 | Run TB-01 again after 50+ mixed transactions (sales, purchases, payments) | Still balances |
| TB-03 | Run TB-01 immediately after a rejected/failed unbalanced entry attempt (JE-010) | Confirms the rejected entry was never actually persisted (no partial write) |

---

# PART 10 — Real-Life Workflow Tests (Full Numeric Scenarios)

## Scenario 1 — Purchase (Azure Furniture, 100 Wooden Chairs)

| Step | Action | Verify |
|---|---|---|
| 1 | Create vendor Azure Furniture | Contact List shows it as Vendor |
| 2 | Create product Wooden Chair, cost ₹1,000 | Product List |
| 3 | Create PO: 100 × ₹1,000 = ₹100,000 | PO Total correct |
| 4 | Confirm PO | Status=Confirmed |
| 5 | Receive goods | Status=Received (if a separate receipt step exists) |
| 6 | Convert to Vendor Bill | Bill Total=100,000, Outstanding=100,000; JE per AC-PUR-01 |
| 7 | Bank payment ₹60,000 | Outstanding=40,000; JE per AC-PUR-02 (payment 1) |
| 8 | Bank payment ₹40,000 | Outstanding=0, Status=Paid; JE per AC-PUR-02 (payment 2) |
| 9 | Verify Bank balance | Reduced by exactly ₹100,000 total from its pre-scenario balance |
| 10 | Verify P&L for the period | Purchase Expense +100,000 |
| 11 | Verify Balance Sheet | Accounts Payable = 0 (fully settled), Bank reduced by 100,000 |

## Scenario 2 — Sales (Nimesh Pathak, 5 Office Chairs)

| Step | Action | Verify |
|---|---|---|
| 1 | Create customer Nimesh Pathak | Contact List |
| 2 | Create product Office Chair, price ₹3,000 | Product List |
| 3 | Create SO: 5 × ₹3,000, tax 18% | Net=15,000, Tax=2,700, Gross=17,700 |
| 4 | Generate Customer Invoice | Outstanding=17,700, Status=Unpaid; JE per AC-SALE-01 |
| 5 | Cash payment ₹10,000 | Outstanding=7,700, Status=Partially Paid |
| 6 | Bank payment ₹7,700 | Outstanding=0, Status=Paid |
| 7 | Verify Cash balance | +10,000 from pre-scenario balance |
| 8 | Verify Bank balance | +7,700 |
| 9 | Verify P&L | Sales Income +15,000 (tax excluded) |
| 10 | Verify Balance Sheet | Accounts Receivable=0, Tax Payable +2,700, Cash+10,000, Bank+7,700 |

---

# PART 11 — End-to-End System Tests

| ID | Flow |
|---|---|
| E2E-001 | New customer → Product → SO → Invoice → Partial payment → Final payment → JE → Ledger → P&L → Balance Sheet, fully reconciled at each step |
| E2E-002 | New vendor → Product → PO → Goods receipt → Bill → Partial payment → Final payment → JE → Ledger → Reports, fully reconciled |
| E2E-003 | One sale + one purchase + payments, same period → generate P&L and Balance Sheet → manually reconcile both against the four journal entries created |
| E2E-004 | Budget created → tagged transactions posted → Budget Report reflects correct Actual and Variance, reconciled against the source invoices |
| E2E-005 | Admin creates master data → Accountant records SO/Invoice → Contact logs in and views only their own invoice → Contact pays → Accountant confirms payment reflected → Reports updated — tests the full role chain in one flow |
| E2E-006 | Product/contact archived after being used historically → old invoice still fully intact and reportable → same product/contact NOT selectable in any new transaction |
| E2E-007 | Transactions spread across 3 months → monthly P&L for each month reconciles individually → yearly P&L equals the sum of the three monthly P&Ls exactly |

---

# PART 12 — Edge-Case Matrix (Summary Index)

All individually listed above; indexed here for execution planning:

- Input edge cases → CON-007…018, PRD-004…014, Part 4
- Date edge cases → PO/SO/VB due-date tests, Part 4 date table, BUD period tests
- Money edge cases → CALC-001…008, JE-012/017/018
- Quantity edge cases → PO-008…011, SO-002
- Transaction edge cases (duplicate submit, concurrency) → PO-018, INV-003, PAY-014

---

# PART 13 — Data Integrity Tests

| ID | Scenario | Expected |
|---|---|---|
| DI-001 | Delete attempt on any master record referenced by a transaction | Blocked system-wide (Contact, Product, Account, Journal) |
| DI-002 | Edit a referenced master record's non-critical field (e.g., contact phone) | Allowed; historical documents unaffected in substance |
| DI-003 | Orphan check: manually attempt to create an Invoice with no linked SO where the business rule requires one | Blocked, or explicitly supported as a direct-invoice path (document) |
| DI-004 | Every posted Journal Entry has a valid, existing source reference (Invoice/Bill/Payment ID) | No "floating" journal entries with a dangling reference |
| DI-005 | Every Invoice/Bill has exactly one corresponding balanced Journal Entry (not zero, not two) | 1:1 mapping verified across a sample of 20+ transactions |
| DI-006 | Deleting/archiving a Journal used by historical entries | Historical entries retain their journal reference and still report correctly |

---

# PART 14 — Regression Suite (run after every code change)

1. JE-009/010/011 — Debit=Credit enforcement still holds
2. AC-SALE-01, AC-PUR-01 — standard sale/purchase JE generation still correct
3. PAY-001/002 — payment still reduces the correct receivable/payable
4. BS reconciliation (Assets = Liabilities+Capital) after a mixed batch of transactions
5. PL-003 reconciliation
6. RBAC-05/06 — Contact data isolation still enforced
7. CON-020/PRD-010 — archived master data still doesn't break historical reports
8. CALC-003/004 — tax calculation and rounding still correct
9. BUD-RPT-01 — budget vs actual still correct after a new transaction

---

# PART 15 — Critical Smoke Test Suite (fastest signal that the build is even usable)

1. Create one Contact, one Product, one CoA account, one Journal — no errors
2. Create and confirm a PO → convert to Bill → make a payment — Outstanding reaches 0
3. Create an SO → generate Invoice → make a payment — Outstanding reaches 0
4. Open Balance Sheet, P&L, Budget Report — all three render without error
5. Log in as each of the three roles — each sees the correct menu set
6. Attempt one unbalanced Journal Entry — confirm it is rejected

---

# PART 16 — UAT Scenarios (business-owner-facing acceptance)

1. As the Business Owner, I can see at a glance who owes me money and how much (Accounts Receivable / outstanding invoices list).
2. As the Business Owner, I can see who I owe money to (Accounts Payable / outstanding bills list).
3. As the Accountant, I can record a full day's sales and purchases without needing to touch the Journal Entry screen directly.
4. As the Business Owner, at month end I can pull a P&L and Balance Sheet that I trust match my own manual reconciliation.
5. As a Customer, I can log in and see only my own invoices and pay them, and I can't see anyone else's information.
6. As the Business Owner, I can set a budget for a department and see, mid-quarter, whether I'm on track.

---

# Final Deliverables

## A. Top 20 Most Critical Test Cases
JE-009, JE-010, JE-011, JE-015, INV-003, PAY-014, RBAC-06, RBAC-04, CON-019, COA-006, AC-SALE-01, AC-PUR-01, AC-PAY-01, AC-PAY-02, BS reconciliation (9.1), PL-003, DI-005, PO-004/005/006, E2E-005, CON-020

## B. Top 20 Accounting Failure Scenarios
1. Debit ≠ Credit accepted by the system
2. Invoice total correct on screen, JE wrong
3. Payment reduces Cash but not the matching Receivable
4. Overpayment silently discarded (money vanishes from the books)
5. Overpayment rejected outright despite A-02 policy
6. Tax posted into Sales Income instead of Tax Payable
7. P&L includes tax as income, inflating profit
8. Balance Sheet doesn't balance after a routine transaction
9. Archived contact/product breaks a historical report's numbers
10. Duplicate invoice created on double-click, duplicate JE posted
11. Duplicate payment applied twice against the same invoice
12. Partial payment sequence produces a wrong intermediate outstanding balance
13. Vendor payment posted against the wrong vendor's payable
14. Journal entry references a non-existent/archived account
15. Report reconciles at the UI level but not against the underlying ledger sum
16. Budget Actual never updates because Analytic Account isn't linked at transaction level (A-07 gap)
17. Rounding drift accumulates across many invoices, causing report totals to diverge from the sum of source documents
18. Cash and Bank ledgers cross-contaminate (a Cash payment moves the Bank balance or vice versa)
19. Cancelled PO/Invoice still contributes to a report total
20. Changing an account's Type after it has historical postings silently corrupts every report that used it

## C. Top 20 Edge Cases
CON-013, CON-014, CON-015, CON-016, PO-010, PO-011, JE-007, JE-008, JE-012, JE-013, PAY-006, PAY-007, SO-005, SO-006, CALC-002, CALC-004, Date leap-day/year-end tests (Part 4), BS-003/004 (date-boundary filtering), CON-021 (historical doc after archive), INT-014 (archive vs. historical report)

## D. Top 20 Integration Scenarios
All of INT-001 through INT-014, plus AC-BUDGET-01, AC-BUDGET-02, E2E-003, E2E-004, E2E-005, DI-005

## E. Complete E2E Test Flow (canonical run-through)
`New Contact → New Product → New CoA/Journal (if not preset) → PO/SO → Confirm → Bill/Invoice → JE auto-generated & balance-checked → Partial payment (Cash) → Partial payment (Bank) → Outstanding=0 → Ledger balances verified independently → P&L and Balance Sheet pulled and manually reconciled against the source JEs → Budget Report checked if an Analytic Account was tagged → Archive the Contact/Product used → Re-pull the historical report to confirm it is unchanged → Attempt the same archived record in a new transaction and confirm it's blocked.`

---

# Recommended Execution Order

1. Smoke Suite (Part 15) — confirms the build is testable at all
2. Master Data Unit Tests (Part 1)
3. Journal Entry Engine (Part 3) — nothing else can be trusted until this passes
4. Transaction Module Unit Tests (Part 2)
5. Accounting Trace / Books-of-Account tests (Part 8)
6. Reporting & Reconciliation (Part 9)
7. Integration Tests (Part 7)
8. RBAC / Security (Part 5)
9. Real-Life Workflows and E2E (Parts 10–11)
10. Edge Cases & Data Integrity (Parts 4, 12, 13)
11. Regression Suite (Part 14) — baseline for every future build
12. UAT (Part 16)
