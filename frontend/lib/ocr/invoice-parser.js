/**
 * Turns raw extracted text (from a digital PDF's text layer, or Tesseract's
 * OCR output) into a structured ParsedInvoice. This is heuristic, regex-based
 * extraction — it will not be perfect, especially on OCR'd photos, which is
 * exactly why every field lands in an editable review modal rather than
 * writing straight to the form (PLAN.md §11b change #3).
 *
 * ParsedInvoice: { vendorName, vendorGSTIN, vendorAddress, invoiceNumber,
 *   invoiceDate, dueDate, lineItems[], subtotal, taxes[], totalAmount,
 *   confidence, rawText }
 * LineItem: { sno, description, hsnCode, quantity, unit, rate, amount }
 * TaxDetail: { name, rate, amount }
 */

const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/

const INVOICE_NO_RE = /(?:invoice|bill|inv)\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Z0-9/\-]{3,})/i
const DATE_TOKEN = '(\\d{1,2}[/\\-.]\\d{1,2}[/\\-.]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\.?\\s+\\d{2,4}|[A-Za-z]{3,9}\\.?\\s+\\d{1,2},?\\s+\\d{2,4})'
const INVOICE_DATE_RE = new RegExp(`(?:invoice date|bill date|dated?|date)\\s*[:\\-]?\\s*${DATE_TOKEN}`, 'i')
const DUE_DATE_RE = new RegExp(`due date\\s*[:\\-]?\\s*${DATE_TOKEN}`, 'i')

const TAX_LINE_RE = /(CGST|SGST|IGST|GST)\s*@?\s*(\d+(?:\.\d+)?)\s*%?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.\d{1,2}|[\d,]+)/gi
const TOTAL_RE = /(?:grand total|total amount|amount payable|invoice total|total)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.\d{1,2}|[\d,]+)/gi
const SUBTOTAL_RE = /(?:sub[\s\-]?total|taxable value|taxable amount)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.\d{1,2}|[\d,]+)/i

/**
 * A line-item table row, loosely: S.No  Description  [HSN]  Qty  [Unit]  Rate  Amount
 * Columns are whitespace-separated because both the position-reconstructed
 * digital-PDF text and Tesseract's PSM-6 output land in roughly that shape.
 */
const LINE_ITEM_RE = /^(\d{1,3})[.)]?\s+(.+?)\s+(\d{4,8})?\s*(\d+(?:\.\d+)?)\s*(pcs?|nos?|units?|box(?:es)?|kg|ltr?|mtr?|ea)?\s+([\d,]+\.\d{1,2}|[\d,]+)\s+([\d,]+\.\d{1,2}|[\d,]+)\s*$/i

function toNumber(str) {
  if (!str) return 0
  return Number(String(str).replace(/,/g, '')) || 0
}

function normalizeDate(raw) {
  if (!raw) return null
  const s = raw.trim().replace(/\./g, '')

  const dmy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/)
  if (dmy) {
    let [, d, m, y] = dmy
    if (y.length === 2) y = `20${y}`
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)

  return null
}

function extractVendorName(lines) {
  // Heuristic: the vendor's name is almost always the letterhead — one of the
  // first few non-empty lines, before "GSTIN"/"Invoice"/an address keyword.
  const stopWords = /gstin|invoice|bill\s*(no|to)|date|tax invoice|address/i
  for (const line of lines.slice(0, 6)) {
    // Cut the line at its first stop word rather than discarding the whole
    // row. Invoices routinely set "TAX INVOICE" beside the letterhead, and
    // both a PDF text layer and OCR flatten anything sharing a baseline into
    // one line — so the row arrives as "Azure Furniture Pvt Ltd TAX INVOICE".
    // Skipping it took the street address as the vendor instead, which is
    // both wrong and confidently wrong: the field is filled, so nothing about
    // the result invites a second look.
    const hit = line.search(stopWords)
    const candidate = (hit >= 0 ? line.slice(0, hit) : line).trim()
    if (candidate.length < 3 || candidate.length > 80) continue
    if (/^\d+$/.test(candidate)) continue
    return candidate
  }
  return null
}

function extractLineItems(lines) {
  const items = []
  for (const line of lines) {
    const m = line.match(LINE_ITEM_RE)
    if (!m) continue
    const [, sno, description, hsnCode, quantity, unit, rate, amount] = m
    items.push({
      sno: Number(sno),
      description: description.trim(),
      hsnCode: hsnCode || null,
      quantity: toNumber(quantity),
      unit: unit ? unit.toLowerCase() : null,
      rate: toNumber(rate),
      amount: toNumber(amount),
    })
  }
  return items
}

function extractTaxes(text) {
  const taxes = []
  let m
  TAX_LINE_RE.lastIndex = 0
  while ((m = TAX_LINE_RE.exec(text)) !== null) {
    taxes.push({ name: m[1].toUpperCase(), rate: toNumber(m[2]), amount: toNumber(m[3]) })
  }
  return taxes
}

function extractTotal(text) {
  let best = null
  let m
  TOTAL_RE.lastIndex = 0
  while ((m = TOTAL_RE.exec(text)) !== null) {
    const value = toNumber(m[1])
    if (value > 0 && (best === null || value > best)) best = value
  }
  return best
}

export function parseInvoice(rawText, ocrConfidence = 97) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean)
  const text = rawText

  const gstinMatch = text.match(GSTIN_RE)
  const invoiceNoMatch = text.match(INVOICE_NO_RE)
  const invoiceDateMatch = text.match(INVOICE_DATE_RE)
  const dueDateMatch = text.match(DUE_DATE_RE)
  const subtotalMatch = text.match(SUBTOTAL_RE)

  const lineItems = extractLineItems(lines)
  const taxes = extractTaxes(text)
  const totalAmount = extractTotal(text)
  const vendorName = extractVendorName(lines)

  // Confidence starts from OCR/text-layer quality, then loses points for
  // every key field that couldn't be found — a blank field is a signal to
  // "verify carefully", not a silent gap.
  let confidence = ocrConfidence
  if (!vendorName) confidence -= 15
  if (!invoiceNoMatch) confidence -= 10
  if (!invoiceDateMatch) confidence -= 10
  if (!totalAmount) confidence -= 20
  if (lineItems.length === 0) confidence -= 15
  confidence = Math.max(0, Math.min(100, Math.round(confidence)))

  return {
    vendorName,
    vendorGSTIN: gstinMatch ? gstinMatch[0].toUpperCase() : null,
    vendorAddress: null,
    invoiceNumber: invoiceNoMatch ? invoiceNoMatch[1] : null,
    invoiceDate: normalizeDate(invoiceDateMatch?.[1]),
    dueDate: normalizeDate(dueDateMatch?.[1]),
    lineItems,
    subtotal: subtotalMatch ? toNumber(subtotalMatch[1]) : null,
    taxes,
    totalAmount,
    confidence,
    rawText,
  }
}
