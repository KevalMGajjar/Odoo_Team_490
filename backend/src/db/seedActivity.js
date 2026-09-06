import { PRODUCTS } from './seedMasters.js'

/**
 * Generates eighteen months of trading, rather than listing it.
 *
 * The hand-written version was fourteen invoices and seven bills, which is
 * enough to prove the ledger works and far too little to see how anything
 * behaves at size: a report over sixty rows tells you nothing about a report
 * over six hundred, pagination is never exercised, and a search that returns
 * everything is not a search.
 *
 * Three properties matter more than volume, and are why this is generated
 * rather than random:
 *
 *   Deterministic. A fixed PRNG seed, so every run produces the same books.
 *   The verification harnesses assert exact figures, and a demo that shows
 *   different numbers each time is one nobody can prepare against.
 *
 *   Stock-safe. Inventory refuses to go negative, so a sale can only be
 *   generated for a product that has been bought first. The generator carries
 *   its own running on-hand count and buys before it sells.
 *
 *   Profitable. Sales are priced from the product master and purchases near
 *   cost, so the year closes in profit. A demo that opens on a loss invites
 *   a question about the data rather than about the software.
 */

const STOCKED = PRODUCTS.filter((p) => p.track)
const SERVICES = PRODUCTS.filter((p) => !p.track)
const VENDORS = ['Azure Furniture Pvt Ltd', 'Rahul Sharma Timber', 'Kishan Auto Parts']
const CUSTOMERS = ['Nimesh Pathak', 'Meera Joshi', 'Skyline Interiors LLP', 'Gateway Hotels Ltd']

/** Trading period, inclusive. Two financial years, so year-on-year reports and
 *  the Apr-Mar fiscal numbering both have something to show. */
const FROM = { y: 2025, m: 4 }
const TO = { y: 2026, m: 9 }

/** Buy more of a product once its cover drops below this many months of sales. */
const REORDER_MONTHS = 2

/** mulberry32 — small, fast, and the same sequence everywhere. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const daysIn = (y, m) => new Date(y, m, 0).getDate()

export function generateActivity(seed = 20260906) {
  const rand = rng(seed)
  const pick = (xs) => xs[Math.floor(rand() * xs.length)]
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))

  const onHand = Object.fromEntries(STOCKED.map((p) => [p.name, 0]))
  const purchases = []
  const sales = []
  const vouchers = []

  let month = { ...FROM }
  let monthIndex = 0

  while (month.y < TO.y || (month.y === TO.y && month.m <= TO.m)) {
    const { y, m } = month
    const last = daysIn(y, m)

    // ── restocking ──
    // Buy the products that are running low, two or three lines to a bill so
    // the bills look like real orders rather than one line each.
    const low = STOCKED.filter((p) => onHand[p.name] < expectedMonthlySales(p) * REORDER_MONTHS)
    const toBuy = low.length ? low : [pick(STOCKED)]
    for (let i = 0; i < toBuy.length; i += 3) {
      const group = toBuy.slice(i, i + 3)
      const lines = group.map((p) => {
        const qty = Math.max(6, expectedMonthlySales(p) * between(3, 5))
        onHand[p.name] += qty
        // Purchase prices drift a little either side of standing cost, which
        // is what gives the moving average something to average.
        const rate = Math.round(p.cost * (0.94 + rand() * 0.14))
        return [p.name, qty, rate]
      })
      purchases.push([iso(y, m, between(3, 12)), pick(VENDORS), lines])
    }

    // ── sales ──
    // Three to five invoices a month, each one to three lines, and never more
    // than is actually on the shelf. Each posted invoice raises two entries —
    // revenue and cost of goods — so this is the figure that decides the size
    // of the ledger more than any other.
    const invoiceCount = between(3, 5)
    for (let k = 0; k < invoiceCount; k += 1) {
      const available = STOCKED.filter((p) => onHand[p.name] >= 2)
      if (!available.length) break

      const lineCount = between(1, 3)
      const chosen = []
      for (let l = 0; l < lineCount; l += 1) {
        const p = pick(available)
        if (chosen.some(([name]) => name === p.name)) continue
        const qty = Math.min(onHand[p.name], between(1, Math.max(2, expectedMonthlySales(p))))
        if (qty < 1) continue
        onHand[p.name] -= qty
        chosen.push([p.name, qty])
      }
      if (!chosen.length) continue

      // A service line on roughly a third of them — delivery or assembly is
      // how a furniture sale usually goes out.
      if (rand() < 0.35) chosen.push([pick(SERVICES).name, 1])

      sales.push([iso(y, m, between(2, last - 1)), pick(CUSTOMERS), chosen])
    }

    // ── standing costs ──
    // Rent and salaries every month, so the P&L has a cost base rather than
    // only cost of goods.
    vouchers.push(['BPayment', iso(y, m, last), '1010', '5100', 45000,
      `RENT-${String(monthIndex + 1).padStart(2, '0')}`, `Showroom rent — ${monthName(m)} ${y}`, 'Showroom Operations'])
    vouchers.push(['BPayment', iso(y, m, last), '1010', '5200', between(138, 152) * 1000,
      `SAL-${String(monthIndex + 1).padStart(2, '0')}`, `Staff salaries — ${monthName(m)} ${y}`, 'Showroom Operations'])
    if (rand() < 0.55) {
      vouchers.push(['CPayment', iso(y, m, between(8, 24)), '1000', '5300', between(6, 18) * 1000,
        `FRT-${String(monthIndex + 1).padStart(2, '0')}`, 'Freight and local delivery', 'Logistics'])
    }
    if (rand() < 0.25) {
      vouchers.push(['CReceipt', iso(y, m, between(10, 26)), '1000', '4100', between(8, 22) * 1000,
        `MISC-${String(monthIndex + 1).padStart(2, '0')}`, 'Scrap timber sale', null])
    }

    monthIndex += 1
    month = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }
  }

  return { purchases, sales, vouchers }
}

/**
 * Rough monthly demand. Cheap items move faster than a wardrobe.
 *
 * These also set the scale of the whole business, which is why they are larger
 * than they first look. Rent and salaries run about ₹190,000 a month, and at a
 * ~35% gross margin that needs roughly ₹550,000 of monthly revenue before the
 * business earns anything. The first pass sold about ₹258,000 a month, so
 * eighteen months of fixed costs put the company ₹1.8m into the red with an
 * overdrawn bank account — arithmetically consistent, and not a demo anyone
 * wants to open.
 */
function expectedMonthlySales(p) {
  if (p.sale >= 20000) return 5
  if (p.sale >= 10000) return 10
  if (p.sale >= 5000) return 20
  return 30
}

function monthName(m) {
  return ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][m]
}
