import express from 'express'
import { prisma } from '../lib/prisma.js'
import { verifyJWT } from '../middleware/auth.js'
import { badRequest } from '../lib/errors.js'
import { routeTranscript, isVoiceRoutingConfigured } from '../services/voiceRouter.js'

/**
 * VOICE ASSISTANT — read-only navigation.
 *
 * This router interprets a spoken phrase and answers with a screen to open.
 * It reads nothing and writes nothing itself; the screen the browser then
 * navigates to fetches its own data through the normal, already-permissioned
 * endpoints. So the assistant cannot widen what a user is allowed to see.
 *
 * Portal users are excluded outright — the screens in the catalog are
 * whole-business views that `internalOnly` already refuses them.
 */

const router = express.Router()

const internalOnly = (req, res, next) =>
  req.user?.role === 'user'
    ? res.status(403).json({ message: 'The assistant is not available to portal users' })
    : next()

/**
 * Resolve a spoken partner name to a real contact.
 *
 * Deliberately conservative: a name that matches nothing, or matches several
 * contacts, returns a clarification instead of picking one. Silently filtering
 * a report by the wrong customer is the kind of quiet error this assistant
 * must not make.
 */
async function resolvePartner(name) {
  const q = name.trim()
  if (q.length < 2) return { ok: false, clarify: 'Which customer or vendor did you mean?' }

  const matches = await prisma.contact.findMany({
    where: { name: { contains: q, mode: 'insensitive' }, status: 'active' },
    select: { id: true, name: true },
    take: 6,
  })

  if (matches.length === 0) {
    return { ok: false, clarify: `I couldn't find a contact named "${q}".` }
  }
  if (matches.length > 1) {
    const exact = matches.find((m) => m.name.toLowerCase() === q.toLowerCase())
    if (!exact) {
      return {
        ok: false,
        clarify: `I found several contacts matching "${q}": ${matches.map((m) => m.name).join(', ')}. Which one?`,
      }
    }
    return { ok: true, partner: exact }
  }
  return { ok: true, partner: matches[0] }
}

const helpText = (role) => [
  'I open screens for you — I never create or change anything myself.',
  '',
  'Reports: "open the balance sheet for financial year 2025-2026", "profit and loss for last month", "trial balance", "budget report for this quarter".',
  'Documents: "show unpaid invoices", "bills from Kishan Auto Parts", "purchase orders", "payments received".',
  'Forms: "how do I make a sales invoice", "add a new product", "create a purchase order" — I open the blank form for you to fill in.',
  'Masters: "show contacts", "open the chart of accounts", "products".',
  role === 'admin' ? 'Admin: "open users", "show the audit log", "odoo sync".' : '',
].filter(Boolean).join('\n')

/**
 * POST /voice/interpret  { transcript }
 *
 * → { ok: true, route, label, params, spoken }   navigate here
 * → { ok: false, clarify }                       say this, change nothing
 */
router.post('/interpret', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const { transcript } = req.body ?? {}
    if (typeof transcript !== 'string' || !transcript.trim()) {
      throw badRequest('Say something first — the transcript was empty.')
    }
    if (transcript.length > 500) {
      throw badRequest('That was too long to interpret. Try a shorter command.')
    }
    if (!isVoiceRoutingConfigured()) {
      return res.json({
        ok: false,
        clarify: 'The assistant is not configured on this server. Set AI_ENABLED=true and AI_API_KEY in the backend .env.',
      })
    }

    const routed = await routeTranscript(transcript.trim(), { role: req.user.role })
    if (!routed.ok) return res.json(routed)

    // HELP answers in the panel rather than navigating anywhere.
    if (routed.intent === 'HELP') {
      return res.json({ ok: true, answer: helpText(req.user.role) })
    }

    const params = { ...routed.params }
    let spokenSuffix = ''

    // Only intents that declare a partner param can be filtered by one; for
    // anything else a spoken name is simply ignored rather than smuggled in.
    if (routed.partnerQuery && 'partnerId' in params === false) {
      const canFilterByPartner = [
        'INVOICES', 'BILLS', 'PURCHASE_ORDERS', 'SALES_ORDERS',
        'PAYMENTS_RECEIVED', 'PAYMENTS_MADE',
      ].includes(routed.intent)
      if (canFilterByPartner) {
        const resolved = await resolvePartner(routed.partnerQuery)
        if (!resolved.ok) return res.json({ ok: false, clarify: resolved.clarify })
        params.partnerId = resolved.partner.id
        spokenSuffix = ` for ${resolved.partner.name}`
      }
    }

    if (params.settleState === 'not_paid') spokenSuffix = ` (unpaid)${spokenSuffix}`
    if (params.from && params.to) spokenSuffix += ` from ${params.from} to ${params.to}`
    else if (params.asOf) spokenSuffix += ` as at ${params.asOf}`

    // Say plainly that a blank form was opened, so nobody reads "New Invoice"
    // as "an invoice was created".
    const spoken = routed.creates
      ? `Here's the ${routed.label} form — fill it in and save to create it.`
      : `Opening ${routed.label}${spokenSuffix}`

    res.json({
      ok: true,
      intent: routed.intent,
      route: routed.route,
      label: routed.label,
      creates: routed.creates,
      params,
      spoken,
    })
  } catch (err) { next(err) }
})

/** Lets the UI show an honest "not configured" state instead of failing on use. */
router.get('/status', verifyJWT, internalOnly, (req, res) => {
  res.json({ configured: isVoiceRoutingConfigured(), model: process.env.AI_MODEL ?? null })
})

export default router
