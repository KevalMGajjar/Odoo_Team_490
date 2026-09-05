# Urban Furniture — UI & Design System

> Target: this should read as **an ERP built by people who use ERPs**, not a generic SaaS dashboard. Odoo's own design language, applied honestly.

---

## 1. The anti-brief — what "AI-generated UI" looks like, and what we do instead

Judges have seen forty of these. These are the tells:

| ❌ Tell | ✅ What we do |
|---|---|
| Purple→blue **gradient** headers, buttons, hero panels | Flat solid fills. Exactly one brand colour. |
| **Glassmorphism** / `backdrop-blur` cards | Opaque white sheets on a light-grey ground, 1px borders |
| `rounded-2xl` / `rounded-3xl` everywhere | **4px** radius. Buttons 3px. This is the single biggest tell. |
| Huge padding, 3 cards per screen, airy "breathing room" | **Dense.** ERP users want 30 rows visible, not 6. |
| Emoji as icons (📊 💰 ✅) | `lucide-react`, 16px, stroke 1.5 |
| Big centred hero empty states with illustrations | One line of muted text + a small primary button, left-aligned |
| Drop shadows on everything, multiple elevations | **One** shadow token, used only on the form sheet and dropdowns |
| Generic KPI card grid as the whole dashboard | KPI strip + real worklists (overdue invoices, unposted entries) |
| Sentence-case labels floating inside inputs | Small uppercase field labels above the input, Odoo-style |
| 16px body text, 32px headings | **13px** body, 15px section titles. ERP density. |
| Rainbow status colours | Semantic only: draft grey · posted purple · paid green · overdue red |

**The rule:** if it would look at home on a crypto landing page, delete it.

---

## 2. Palette — Odoo's actual colours

Odoo's brand plum drives the UI; teal is the secondary/link accent.

```css
:root {
  /* ── brand ── */
  --o-brand:          #714B67;   /* Odoo plum — primary buttons, active nav, statusbar */
  --o-brand-hover:    #5C3D54;
  --o-brand-light:    #F0EAEE;   /* selected row tint, active nav bg */
  --o-secondary:      #017E84;   /* teal — links, secondary actions, focus ring */
  --o-secondary-hover:#016468;

  /* ── surfaces ── */
  --o-bg:             #F9F9F9;   /* app background behind sheets */
  --o-sheet:          #FFFFFF;   /* form sheet, table body */
  --o-sidebar:        #FFFFFF;
  --o-header:         #FFFFFF;
  --o-subtle:         #F5F5F5;   /* table header, striped rows */
  --o-hover:          #F0F0F0;

  /* ── text ── */
  --o-text:           #2C2C34;
  --o-text-muted:     #6C757D;
  --o-text-faint:     #9AA0A6;
  --o-text-invert:    #FFFFFF;

  /* ── lines ── */
  --o-border:         #DEE2E6;
  --o-border-strong:  #C6CBD1;

  /* ── semantic (document states) ── */
  --o-draft:          #8F8F8F;
  --o-posted:         #714B67;
  --o-paid:           #28A745;
  --o-partial:        #F0AD4E;
  --o-overdue:        #D9534F;
  --o-info:           #17A2B8;

  /* ── numeric emphasis ── */
  --o-debit:          #1F6FEB;   /* Dr column */
  --o-credit:         #C2410C;   /* Cr column */

  /* ── shape (small! this is the anti-AI tell) ── */
  --o-radius:         4px;
  --o-radius-sm:      3px;
  --o-shadow:         0 2px 6px rgba(0,0,0,.08);
  --o-shadow-pop:     0 4px 16px rgba(0,0,0,.14);
}

:root[data-theme="dark"], :root:not([data-theme="light"]) {
  @media (prefers-color-scheme: dark) {
    --o-bg:        #1A1A1A;
    --o-sheet:     #2B2B2B;
    --o-sidebar:   #202020;
    --o-header:    #252525;
    --o-subtle:    #303030;
    --o-hover:     #353535;
    --o-text:      #E4E4E4;
    --o-text-muted:#A0A0A0;
    --o-text-faint:#787878;
    --o-border:    #3A3A3A;
    --o-border-strong: #4A4A4A;
    --o-brand:     #A87E9C;   /* lifted for contrast on dark */
    --o-brand-light: #33262F;
    --o-secondary: #2FA8AE;
  }
}
```

> Define the full light palette on bare `:root`, override only what changes in the dark blocks, and give `body` an explicit `background: var(--o-bg)`.

**Typography:** Inter, **self-hosted** as woff2 (offline requirement). Weights 400/500/600 only.
Body **13px/1.45** · table cells 13px · field labels **11px uppercase, letter-spacing .04em, `--o-text-muted`** · section titles 15px/600 · page title 18px/600. Numerals: `font-variant-numeric: tabular-nums` on every money column — non-negotiable for an accounting app.

**Spacing scale:** 4 / 8 / 12 / 16 / 24 only. Table cell padding `6px 12px`. Form row gap 12px.

---

## 3. Layout skeleton

```
┌──────────────────────────────────────────────────────────────┐
│ TOPBAR  Urban Furniture    [⌘K search]   ● Online  ☾  KG ▾    │ 44px
├───────────────┬──────────────────────────────────────────────┤
│               │ CONTROL PANEL                                │
│  SIDEBAR      │ Invoices / INV/2026/0004      [Post] [Print]  │ 48px
│  240px        │ [search…]              ⊞ ☰ ▤     ‹ 4/27 ›     │
│  collapsible  ├──────────────────────────────────────────────┤
│  grouped      │                                              │
│               │   FORM SHEET (max-width 1100px, centred)     │
│               │   or LIST (full-bleed, dense)                │
│               │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

**The control panel is the most Odoo thing you can build.** Breadcrumb + record pager on the left, action buttons beside it, search and view-switcher on the right. It appears on *every* screen, which is what makes the app feel like one system.

---

## 4. Sidebar — grouped collapsible nav

Per the reference: small-caps section headers, a group row with a folder icon and chevron, children indented behind a vertical guide rail.

```
MASTERS
 ▸ 📁 Account Masters          ⌄        ← group: 13px/500, folder icon, chevron
   │  Chart of Accounts                 ← child: 13px/400, muted; guide rail at left
   │  Journals
   │  Taxes
   │  Currencies
 ▸ 📁 Business Masters         ›
   │  Contacts
   │  Products
   │  Product Categories
   │  Analytic Accounts

TRANSACTIONS
 ▸ 📁 Purchase                 ›
   │  Purchase Orders
   │  Vendor Bills
   │  Payments Made
 ▸ 📁 Sales                    ›
   │  Sales Orders
   │  Customer Invoices
   │  Payments Received
 ▸ 📁 Accounting               ›
   │  Journal Entries
   │  Stock Moves
   │  Stock Adjustments

REPORTS
    Trial Balance
    Profit & Loss
    Balance Sheet
    Inventory Valuation
    Budget Report
    General Ledger

ADMIN
    Users
    Audit Log
    Health
```

**Specs**
- Width 240px; collapses to 56px icon rail under `lg:`; becomes an overlay drawer under `md:`
- Section header: 10px uppercase, `letter-spacing .08em`, `--o-text-faint`, 16px top margin
- Group row: 32px tall, folder icon 15px, chevron rotates 90° on expand (150ms)
- Child row: 30px tall, `padding-left: 32px`, with a **1px guide rail** at `left:18px` in `--o-border`
- **Active child:** `background: var(--o-brand-light)`, text `--o-brand`, weight 500, plus a **2px left bar** in `--o-brand` — driven off `usePathname()`
- Expanded/collapsed state persists in `localStorage`; the group containing the active route auto-expands on load
- **Role-filtered** — an `invoicing_user` never sees ADMIN; a portal user gets an entirely different 3-item sidebar

---

## 5. The Odoo-specific components (these are what sell it)

### 5.1 Statusbar — top-right of every document form
Connected chevron pills showing the document's lifecycle, current one filled with `--o-brand`, future ones outlined muted. Clickable only where a legal transition exists.

```
 Draft  ›  Posted  ›  Paid          Draft ▸ Confirmed ▸ Billed
```

### 5.2 Smart buttons — top-right of a form, under the statusbar
Bordered boxes, `--o-radius`, showing **count above label** with a small icon. This is instantly recognisable as an ERP.

```
┌──────────┐ ┌──────────┐ ┌──────────┐
│    3     │ │    2     │ │  ₹26,550 │
│ Payments │ │  Moves   │ │  Journal │
└──────────┘ └──────────┘ └──────────┘
```
On an invoice: Payments · Stock Moves · Journal Entry. On a contact: Invoices · Bills · Total Due.

### 5.3 Form sheet
White card, `max-width:1100px`, centred, 1px border, `--o-shadow`, 24px padding. Title row at top (big, editable-looking). Fields in a **two-column grid** with labels above. A **notebook (tab strip)** at the bottom for line items — `Invoice Lines · Other Info · Accounting`.

### 5.4 Line-item grid
Editable inline table — not a modal per row. Columns right-sized, numerics right-aligned with `tabular-nums`. Last row is a ghost "Add a line" that materialises on click. Totals block bottom-right: Untaxed / Tax / **Total** (bold, 15px, top border).

### 5.5 Debit/Credit grid (journal entry form)
The signature screen. Columns: Account · Partner · Analytic · Label · **Debit** · **Credit**.
- Debit column tinted `--o-debit`, credit `--o-credit`
- **Sticky footer row** with running `Σ Dr` and `Σ Cr`
- When unbalanced: footer background goes `--o-overdue` at 8% opacity, shows `Difference: ₹1,250.00`, and the **Post button is disabled** with a tooltip
- When balanced: footer shows a green ✓ and Post enables
- This live feedback *is* the mockup's blocking-warning callout (A1) — build it as a live indicator, not an alert-on-save

### 5.6 List view
Dense rows (32px), `--o-subtle` header with 11px uppercase muted labels, hover `--o-hover`, sortable headers, checkbox column, right-aligned money. Status column uses a **`StatusBadge`**: 11px, 2px radius, tinted background at 12% of the semantic colour with solid text.

### 5.7 Kanban
Cards in columns, 3px coloured top border by state, `--o-shadow` on hover only. Card = title, partner, amount (bold, tabular), date, status badge.

### 5.8 Report shell
Filter bar pinned at top (date range, comparison, grouping), then the report table. **Every number is a `DrillDownLink`** — teal, underline on hover. Report header carries Print / PDF / XLSX / CSV. The Balance Sheet and Inventory Valuation each end with their **balanced banner**:

> ✅ **Balanced** — Assets ₹12,45,000 = Liabilities ₹3,20,000 + Capital ₹8,00,000 + Earnings ₹1,25,000

---

## 6. Interaction rules

- **Optimistic** on drag/toggle; **pessimistic** on anything that posts to the ledger (never fake a ledger write)
- Validation errors render **inline under the field** from the API's `errors[{field,message}]`, plus `aria-invalid`. Toast only for whole-request failures.
- Every destructive/irreversible action (Post, Reverse, Archive) opens a small confirm with the *consequence* spelled out: "Posting creates journal entry INV/2026/0004. Posted entries cannot be edited."
- **⌘K palette**: jump to any record by number or name, plus verbs — "new invoice", "trial balance"
- Keyboard: `/` focus search · `j/k` move row · `Enter` open · `Esc` close · `Alt+S` save
- Skeleton rows on list load, never a centred spinner
- Money always formatted `₹1,23,456.78` (Indian grouping), right-aligned, tabular

---

## 7. Responsive (MUST #2 — a pass/fail gate)

| Breakpoint | Behaviour |
|---|---|
| **≥1280** | Sidebar 240px expanded, form sheet centred, full table columns |
| **1024–1279** | Sidebar collapses to a 56px icon rail (hover to peek) |
| **768–1023** | Sidebar becomes an overlay drawer; tables drop low-priority columns |
| **<768** | Drawer nav; **tables become stacked cards** (label:value rows); line-item grid becomes one card per line; totals pinned bottom; control panel actions collapse into a ⋯ menu |

Build mobile-first. Never let the page scroll horizontally — wide tables get their own `overflow-x:auto` container.

---

## 8. Build order

1. Tokens in `globals.css` + Tailwind config mapping them → utilities
2. `AppShell` = Sidebar + Topbar + ControlPanel
3. Primitives: `Button` `Input` `Select` `FormField` `StatusBadge` `Modal` `Toast` `EmptyState` `Skeleton`
4. `DataTable` (sort/filter/paginate/select/CSV) — every list view uses it
5. `FormSheet` + `Notebook` + `Statusbar` + `SmartButton`
6. `LineItemGrid` → then `DebitCreditGrid` extends it
7. `ReportShell` + `DrillDownLink` + charts
8. Kanban last — it's the least load-bearing

**Nothing gets styled ad hoc.** If a screen needs a new visual treatment, it becomes a primitive first. That single discipline is what produces "consistent colour scheme and layout" for free.
