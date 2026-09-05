import { catalogForPrompt, intentIdsForRole, validateIntent } from './voiceIntents.js'

/**
 * VOICE ASSISTANT — SPEECH → SCREEN ROUTER
 *
 * Uses whatever OpenAI-compatible endpoint AI_BASE_URL points at (Groq by
 * default; set it to http://localhost:11434/v1 to run fully offline against
 * Ollama). No vendor SDK, so switching hosts is an env change, not a code
 * change.
 *
 * What leaves this machine is ONE spoken phrase — "open the balance sheet for
 * last year". No ledger figures, customer names or documents are ever sent:
 * the model's entire job is to name a screen from the allowlist and describe
 * the period in words. Every number the user eventually sees is rendered by
 * the app from the database, never by the model.
 */

const TIMEOUT_MS = 12000

const buildPrompt = (role) => `You route spoken commands in an accounting app to the correct screen.

You never answer questions, never state figures, and never invent data. You only choose which screen to open.

Choose exactly one intent from this list:
${catalogForPrompt(role)}

Return JSON with these keys:
- "intent": one of ${intentIdsForRole(role).join(', ')}, or "NONE" if the request does not clearly match one screen.
- "period": the time period the user asked for, expressed ONLY as one of these tokens:
  today, yesterday, this_week, last_7_days, this_month, last_month, last_30_days,
  this_quarter, last_quarter, this_year, last_year, this_fy, last_fy,
  "fy:YYYY" for an Indian financial year (April-March; "2025-2026" or "FY 2025-26" both mean fy:2025),
  "year:YYYY" for a calendar year, or "" if the user gave no period.
  Never calculate dates yourself. Never output a date. Only these tokens.
- "settleState": "not_paid" if they asked for unpaid/outstanding/due, "paid", "partial", or "" if unspecified.
- "state": "draft", "posted", "confirmed", "cancelled", or "" if unspecified.
- "partner": the customer or vendor name the user named, exactly as spoken, or "" if none.
- "confidence": 0.0 to 1.0, how clearly the request maps to that one screen.

Rules:
- "profit", "profits", "earnings", "how much did I make", "income statement" all mean PROFIT_LOSS.
- "receipts" / "money received" means PAYMENTS_RECEIVED; "payments made" / "money paid out" means PAYMENTS_MADE.
- "what do customers owe me" / "outstanding invoices" means INVOICES with settleState not_paid.
- "what do I owe" / "unpaid bills" means BILLS with settleState not_paid.
- A "how do I…" / "how can I…" / "where do I…" / "make a…" / "create a…" / "add a…" request means the
  matching NEW_* intent — it opens the blank form so the user can fill it in. Example:
  "how can I make a new sales invoice" means NEW_SALES_INVOICE.
- Distinguish viewing from creating: "show me invoices" means INVOICES, but
  "make an invoice" means NEW_SALES_INVOICE.
- "what can you do", "help", "what can I ask" means HELP.
- Deleting, editing or posting an existing record is not supported: return "NONE".
- If the request is vague or off-topic, return intent "NONE" with confidence 0.

Respond with JSON only.`

/** True when an AI endpoint is configured; the route reports this so the UI can
 *  explain itself instead of failing silently. */
export function isVoiceRoutingConfigured() {
  return process.env.AI_ENABLED === 'true' && Boolean(process.env.AI_BASE_URL)
}

async function callModel(transcript, role) {
  const base = (process.env.AI_BASE_URL ?? '').replace(/\/$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        // Ollama ignores the header; cloud hosts require it.
        ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildPrompt(role) },
          { role: 'user', content: transcript },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      // Carry the status so the caller can explain the actual problem — a rate
      // limit told to "check your API key" sends you after the wrong bug.
      const err = new Error(`AI endpoint returned ${res.status}: ${body.slice(0, 200)}`)
      err.status = res.status
      throw err
    }

    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (!content) throw new Error('AI endpoint returned no content')
    return JSON.parse(content)
  } finally {
    clearTimeout(timer)
  }
}

/** Turn a transport/API failure into something the user can actually act on. */
function explainFailure(err) {
  if (err.name === 'AbortError') return 'That took too long to interpret. Please try again.'
  switch (err.status) {
    case 429:
      return 'The assistant is rate-limited right now. Wait a few seconds and try again.'
    case 401:
    case 403:
      return 'The assistant service rejected the API key. Check AI_API_KEY in the backend .env.'
    case 404:
      return `The configured model (${process.env.AI_MODEL}) isn't available on this account. Check AI_MODEL in the backend .env.`
    default:
      return err.status
        ? `The assistant service returned an error (${err.status}). Please try again.`
        : 'I could not reach the assistant service. Check AI_BASE_URL and your connection.'
  }
}

/**
 * Turn a transcript into a validated navigation target.
 *
 * Resolves to one of:
 *   { ok: true,  intent, route, label, params, partnerQuery, confidence }
 *   { ok: false, clarify: '…' }              — say this back to the user
 *
 * It never throws for a bad model response; an unusable answer becomes a
 * clarifying question, because guessing a screen is worse than asking.
 */
export async function routeTranscript(transcript, { now = new Date(), role = null } = {}) {
  let raw
  try {
    raw = await callModel(transcript, role)
  } catch (err) {
    console.error('[voice] model call failed:', err.message)
    return { ok: false, clarify: explainFailure(err) }
  }

  const confidence = Number(raw?.confidence)
  const intent = typeof raw?.intent === 'string' ? raw.intent.trim().toUpperCase() : ''

  if (!intent || intent === 'NONE') {
    return {
      ok: false,
      clarify: 'I can only open screens that show your data — reports, invoices, bills, orders or payments. Try "open the balance sheet" or "show unpaid invoices".',
    }
  }

  // A low-confidence match is treated as no match: opening the wrong report
  // silently is worse than admitting the command wasn't understood.
  if (Number.isFinite(confidence) && confidence < 0.5) {
    return { ok: false, clarify: `I wasn't sure what you meant. Could you rephrase that?` }
  }

  const checked = validateIntent(raw, { now, role })
  if (!checked.ok) {
    const clarify = {
      unparseable_period: 'I understood the screen but not the time period. Try naming it plainly, like "last month" or "financial year 2025-2026".',
      forbidden_intent: `${checked.label} is only available to administrators.`,
    }[checked.reason] ?? 'I can only open screens in this app. Try "open the profit and loss for last month" or "how do I make a sales invoice".'
    return { ok: false, clarify }
  }

  return {
    ...checked,
    partnerQuery: typeof raw.partner === 'string' ? raw.partner.trim() : '',
    confidence: Number.isFinite(confidence) ? confidence : null,
  }
}
